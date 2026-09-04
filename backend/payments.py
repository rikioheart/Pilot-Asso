"""Prompt 8C — Suivi manuel des paiements (aucune passerelle en ligne).

Statuts 100 % manuels ; un paiement « en attente » bascule automatiquement en
« en retard » 21 jours (3 semaines) après sa date de saisie (created_at).
"""
from typing import Optional
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from deps import (db, iso, now_utc, new_id, active_user, require_admin,
                  log_action, notify, display_name)

router = APIRouter(prefix="/api")

PAYMENT_TYPES = ["COTISATION", "ACTIVITE", "AUTRE"]
PAYMENT_STATUSES = ["PAYE", "EN_ATTENTE", "EN_RETARD"]
PAYMENT_METHODS = ["ESPECES", "CHEQUE", "VIREMENT", "AUTRE"]
LATE_AFTER_DAYS = 21


class PaymentIn(BaseModel):
    user_id: str
    type: str = "COTISATION"
    amount: float = Field(ge=0)
    status: str = "EN_ATTENTE"
    label: Optional[str] = None
    method: Optional[str] = None
    date: Optional[str] = None
    note: Optional[str] = None


class PaymentUpdate(BaseModel):
    type: Optional[str] = None
    amount: Optional[float] = None
    status: Optional[str] = None
    label: Optional[str] = None
    method: Optional[str] = None
    date: Optional[str] = None
    note: Optional[str] = None


def _clean(doc: dict) -> dict:
    return {k: v for k, v in doc.items() if k != "_id"}


@router.get("/payments/me")
async def my_payments(user: dict = Depends(active_user)):
    items = await db.payments.find({"user_id": user["user_id"]}, {"_id": 0}).sort("date", -1).to_list(500)
    return {"items": items}


@router.get("/payments/summary")
async def payments_summary(admin: dict = Depends(require_admin)):
    return await _summary()


async def _summary() -> dict:
    summary = {s: {"count": 0, "amount": 0.0} for s in PAYMENT_STATUSES}
    async for p in db.payments.find({}, {"_id": 0, "status": 1, "amount": 1}):
        s = p.get("status")
        if s in summary:
            summary[s]["count"] += 1
            summary[s]["amount"] += float(p.get("amount") or 0)
    total = sum(v["amount"] for v in summary.values())
    return {"by_status": summary, "total_amount": round(total, 2),
            "collected": round(summary["PAYE"]["amount"], 2)}


@router.get("/payments")
async def list_payments(status: Optional[str] = None, type: Optional[str] = None,
                        user_id: Optional[str] = None, admin: dict = Depends(require_admin)):
    q = {}
    if status:
        q["status"] = status
    if type:
        q["type"] = type
    if user_id:
        q["user_id"] = user_id
    items = await db.payments.find(q, {"_id": 0}).sort("date", -1).to_list(2000)
    return {"items": items, "summary": await _summary()}


@router.post("/payments")
async def create_payment(payload: PaymentIn, admin: dict = Depends(require_admin)):
    if payload.type not in PAYMENT_TYPES:
        raise HTTPException(status_code=400, detail="Type de paiement invalide")
    if payload.status not in PAYMENT_STATUSES:
        raise HTTPException(status_code=400, detail="Statut de paiement invalide")
    if payload.method and payload.method not in PAYMENT_METHODS:
        raise HTTPException(status_code=400, detail="Mode de règlement invalide")
    target = await db.users.find_one({"user_id": payload.user_id}, {"_id": 0, "user_id": 1})
    if not target:
        raise HTTPException(status_code=404, detail="Membre introuvable")
    now = iso(now_utc())
    doc = {
        "payment_id": new_id("pay"), **payload.model_dump(),
        "date": payload.date or now[:10], "member_name": await display_name(payload.user_id),
        "created_by": admin["user_id"], "created_at": now, "updated_at": now,
    }
    await db.payments.insert_one(doc)
    await log_action(admin, "CREATE", "payments", doc["payment_id"],
                     new_value={"user_id": payload.user_id, "amount": payload.amount, "status": payload.status})
    await notify(payload.user_id, type="PAYMENT_RECORDED", title="Paiement enregistré",
                 message=f"Le Bureau a enregistré un paiement de {payload.amount:.2f} € "
                         f"({payload.label or payload.type}).", level="INFO", link="/paiements")
    return _clean(doc)


@router.put("/payments/{payment_id}")
async def update_payment(payment_id: str, payload: PaymentUpdate, admin: dict = Depends(require_admin)):
    payment = await db.payments.find_one({"payment_id": payment_id}, {"_id": 0})
    if not payment:
        raise HTTPException(status_code=404, detail="Paiement introuvable")
    updates = payload.model_dump(exclude_none=True)
    if "type" in updates and updates["type"] not in PAYMENT_TYPES:
        raise HTTPException(status_code=400, detail="Type de paiement invalide")
    if "status" in updates and updates["status"] not in PAYMENT_STATUSES:
        raise HTTPException(status_code=400, detail="Statut de paiement invalide")
    if "method" in updates and updates["method"] not in PAYMENT_METHODS:
        raise HTTPException(status_code=400, detail="Mode de règlement invalide")
    updates["updated_at"] = iso(now_utc())
    await db.payments.update_one({"payment_id": payment_id}, {"$set": updates})
    await log_action(admin, "UPDATE", "payments", payment_id, old_value=payment, new_value=updates)
    if updates.get("status") == "PAYE" and payment.get("status") != "PAYE":
        await notify(payment["user_id"], type="PAYMENT_RECORDED", title="Paiement confirmé",
                     message=f"Votre paiement de {payment.get('amount', 0):.2f} € est marqué comme réglé. Merci !",
                     level="INFO", link="/paiements")
    return _clean({**payment, **updates})


@router.delete("/payments/{payment_id}")
async def delete_payment(payment_id: str, admin: dict = Depends(require_admin)):
    payment = await db.payments.find_one({"payment_id": payment_id}, {"_id": 0})
    if not payment:
        raise HTTPException(status_code=404, detail="Paiement introuvable")
    await db.payments.delete_one({"payment_id": payment_id})
    await log_action(admin, "DELETE", "payments", payment_id, old_value=payment)
    return {"ok": True}


async def sweep_overdue_payments() -> int:
    """Bascule en « en retard » les paiements en attente saisis il y a plus de 21 jours."""
    cutoff = iso(now_utc() - timedelta(days=LATE_AFTER_DAYS))
    late = await db.payments.find(
        {"status": "EN_ATTENTE", "created_at": {"$lt": cutoff}}, {"_id": 0}).to_list(2000)
    for p in late:
        await db.payments.update_one({"payment_id": p["payment_id"]},
                                     {"$set": {"status": "EN_RETARD", "updated_at": iso(now_utc())}})
        await notify(p["user_id"], type="PAYMENT_OVERDUE", title="Paiement en retard",
                     message=f"Un paiement de {p.get('amount', 0):.2f} € ({p.get('label') or p.get('type')}) "
                             f"est en attente depuis plus de 3 semaines.", level="WARNING", link="/paiements")
    return len(late)
