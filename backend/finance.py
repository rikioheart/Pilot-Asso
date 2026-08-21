"""Phase 6 — Finances opérationnelles, parts professionnels, remboursements, avantages adhérents."""
import csv
import io
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field

from rbac import ROLE_ADMIN, ROLE_PRO
from deps import (db, iso, now_utc, new_id, active_user, require, require_admin,
                  log_action, notify, notify_bureau, display_name)
from content import manager_user, is_manager, allowed_access
from storage import file_meta

router = APIRouter(prefix="/api")

DIRECTIONS = ["IN", "OUT"]
CATEGORIES = ["COTISATION", "COTISATION_APPRENANT", "COTISATION_PROFESSIONNEL",
              "COTISATION_PARTICULIER", "COTISATION_SOUTIEN",
              "ACTIVITE", "EVENEMENT", "PARTENARIAT", "ACHAT", "DON",
              "PRODUIT_NUMERIQUE", "REMBOURSEMENT", "SUBVENTION", "AUTRE"]
CATEGORY_LABELS = {
    "COTISATION": "Cotisation (autre)",
    "COTISATION_APPRENANT": "Cotisation apprenant",
    "COTISATION_PROFESSIONNEL": "Cotisation professionnel",
    "COTISATION_PARTICULIER": "Cotisation particulier",
    "COTISATION_SOUTIEN": "Cotisation membre soutien",
    "ACTIVITE": "Activité", "EVENEMENT": "Événement",
    "PARTENARIAT": "Partenariat", "ACHAT": "Achat", "DON": "Don",
    "PRODUIT_NUMERIQUE": "Produit numérique", "REMBOURSEMENT": "Remboursement",
    "SUBVENTION": "Subvention", "AUTRE": "Autre",
}
PAYMENT_METHODS = ["ESPECES", "CHEQUE", "VIREMENT", "AUTRE"]
REIMBURSEMENT_STATUSES = ["PENDING", "APPROVED", "PAID", "REFUSED"]
ADVANTAGE_KINDS = ["CODE_PROMO", "ACTIVITE_OFFERTE", "GOODIE", "SEANCE_PRO", "TARIF_REDUIT"]
ADVANTAGE_STATUSES = ["ACTIVE", "EXPIRED", "SOLD_OUT", "ARCHIVED"]


def period_range(year: int, month: Optional[int] = None, quarter: Optional[int] = None) -> tuple:
    if month:
        start = f"{year:04d}-{month:02d}-01"
        end = f"{year:04d}-{month:02d}-31"
    elif quarter:
        first = (quarter - 1) * 3 + 1
        start = f"{year:04d}-{first:02d}-01"
        end = f"{year:04d}-{first + 2:02d}-31"
    else:
        start, end = f"{year:04d}-01-01", f"{year:04d}-12-31"
    return start, end


# ---------------------------------------------------------------- Écritures
class TransactionIn(BaseModel):
    direction: str
    date: str
    amount: float = Field(gt=0)
    category: str = "AUTRE"
    description: str = ""
    payment_method: str = "AUTRE"
    activity_id: Optional[str] = None
    event_id: Optional[str] = None
    project_id: Optional[str] = None
    professional_id: Optional[str] = None
    member_id: Optional[str] = None
    receipt_file_id: Optional[str] = None


class TransactionUpdate(BaseModel):
    direction: Optional[str] = None
    date: Optional[str] = None
    amount: Optional[float] = None
    category: Optional[str] = None
    description: Optional[str] = None
    payment_method: Optional[str] = None
    receipt_file_id: Optional[str] = None
    status: Optional[str] = None


@router.get("/finance/meta")
async def finance_meta(user: dict = Depends(require("finance.view_global"))):
    return {"directions": DIRECTIONS, "categories": CATEGORIES, "category_labels": CATEGORY_LABELS,
            "payment_methods": PAYMENT_METHODS, "reimbursement_statuses": REIMBURSEMENT_STATUSES,
            "advantage_kinds": ADVANTAGE_KINDS, "advantage_statuses": ADVANTAGE_STATUSES}


@router.get("/finance/transactions")
async def list_transactions(year: Optional[int] = None, month: Optional[int] = None, quarter: Optional[int] = None,
                            direction: Optional[str] = None, category: Optional[str] = None,
                            q: Optional[str] = None, limit: int = 500,
                            admin: dict = Depends(require("finance.view_global"))):
    filters = [{"status": {"$ne": "ARCHIVED"}}]
    if year:
        start, end = period_range(year, month, quarter)
        filters.append({"date": {"$gte": start, "$lte": end}})
    if direction:
        filters.append({"direction": direction})
    if category:
        filters.append({"category": category})
    if q:
        filters.append({"description": {"$regex": q, "$options": "i"}})
    items = await db.transactions.find({"$and": filters}, {"_id": 0}) \
        .sort("date", -1).limit(limit).to_list(limit)
    total_in = sum(t["amount"] for t in items if t["direction"] == "IN")
    total_out = sum(t["amount"] for t in items if t["direction"] == "OUT")
    return {"items": items, "total": len(items),
            "totals": {"in": round(total_in, 2), "out": round(total_out, 2),
                       "net": round(total_in - total_out, 2)}}


@router.post("/finance/transactions")
async def create_transaction(payload: TransactionIn, admin: dict = Depends(require("finance.edit"))):
    if payload.direction not in DIRECTIONS:
        raise HTTPException(status_code=400, detail="Sens d'écriture invalide")
    if payload.category not in CATEGORIES:
        raise HTTPException(status_code=400, detail="Catégorie invalide")
    if payload.payment_method not in PAYMENT_METHODS:
        raise HTTPException(status_code=400, detail="Moyen de paiement invalide")
    doc = {"transaction_id": new_id("trx"), **payload.model_dump(), "status": "RECORDED",
           "created_by": admin["user_id"], "created_by_name": await display_name(admin["user_id"]),
           "created_at": iso(now_utc()), "updated_at": iso(now_utc())}
    await db.transactions.insert_one(doc)
    await log_action(admin, "CREATE", "finance", doc["transaction_id"],
                     new_value={"amount": payload.amount, "direction": payload.direction})
    return {k: v for k, v in doc.items() if k != "_id"}


@router.put("/finance/transactions/{transaction_id}")
async def update_transaction(transaction_id: str, payload: TransactionUpdate,
                             admin: dict = Depends(require("finance.edit"))):
    old = await db.transactions.find_one({"transaction_id": transaction_id}, {"_id": 0})
    if not old:
        raise HTTPException(status_code=404, detail="Écriture introuvable")
    updates = payload.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="Aucune modification fournie")
    if "category" in updates and updates["category"] not in CATEGORIES:
        raise HTTPException(status_code=400, detail="Catégorie invalide")
    if "direction" in updates and updates["direction"] not in DIRECTIONS:
        raise HTTPException(status_code=400, detail="Sens d'écriture invalide")
    if "status" in updates and updates["status"] not in ("RECORDED", "ARCHIVED"):
        raise HTTPException(status_code=400, detail="Statut invalide")
    updates["updated_at"] = iso(now_utc())
    await db.transactions.update_one({"transaction_id": transaction_id}, {"$set": updates})
    await log_action(admin, "UPDATE", "finance", transaction_id,
                     old_value={k: old.get(k) for k in updates}, new_value=updates)
    return await db.transactions.find_one({"transaction_id": transaction_id}, {"_id": 0})


@router.delete("/finance/transactions/{transaction_id}")
async def archive_transaction(transaction_id: str, admin: dict = Depends(require_admin)):
    res = await db.transactions.update_one({"transaction_id": transaction_id},
                                           {"$set": {"status": "ARCHIVED", "updated_at": iso(now_utc())}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Écriture introuvable")
    await log_action(admin, "ARCHIVE", "finance", transaction_id)
    return {"ok": True}


@router.get("/finance/summary")
async def finance_summary(year: Optional[int] = None, admin: dict = Depends(require("finance.view_global"))):
    year = year or now_utc().year
    start, end = period_range(year)
    items = await db.transactions.find(
        {"status": {"$ne": "ARCHIVED"}, "date": {"$gte": start, "$lte": end}}, {"_id": 0}).to_list(5000)
    by_month = {m: {"in": 0.0, "out": 0.0} for m in range(1, 13)}
    by_category = {}
    for t in items:
        month = int(t["date"][5:7]) if len(t["date"]) >= 7 else 1
        key = "in" if t["direction"] == "IN" else "out"
        by_month[month][key] += t["amount"]
        cat = by_category.setdefault(t["category"], {"in": 0.0, "out": 0.0})
        cat[key] += t["amount"]
    by_quarter = []
    for q in range(1, 5):
        months = range((q - 1) * 3 + 1, (q - 1) * 3 + 4)
        qin = sum(by_month[m]["in"] for m in months)
        qout = sum(by_month[m]["out"] for m in months)
        by_quarter.append({"quarter": f"T{q}", "in": round(qin, 2), "out": round(qout, 2),
                           "net": round(qin - qout, 2)})
    total_in = sum(v["in"] for v in by_month.values())
    total_out = sum(v["out"] for v in by_month.values())
    pending_reimbursements = await db.reimbursements.aggregate([
        {"$match": {"status": {"$in": ["PENDING", "APPROVED"]}}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}, "count": {"$sum": 1}}}]).to_list(1)
    pending_shares = await db.distribution_lines.aggregate([
        {"$match": {"status": "PENDING"}},
        {"$group": {"_id": None, "total": {"$sum": "$computed_amount"}, "count": {"$sum": 1}}}]).to_list(1)
    years = sorted({t["date"][:4] for t in await db.transactions.find(
        {"status": {"$ne": "ARCHIVED"}}, {"_id": 0, "date": 1}).to_list(5000) if t.get("date")}, reverse=True)
    return {
        "year": year,
        "totals": {"in": round(total_in, 2), "out": round(total_out, 2), "net": round(total_in - total_out, 2),
                   "entries": len(items)},
        "by_month": [{"month": f"{m:02d}", "in": round(v["in"], 2), "out": round(v["out"], 2),
                      "net": round(v["in"] - v["out"], 2)} for m, v in by_month.items()],
        "by_quarter": by_quarter,
        "by_category": [{"category": c, "label": CATEGORY_LABELS.get(c, c),
                         "in": round(v["in"], 2), "out": round(v["out"], 2)}
                        for c, v in sorted(by_category.items(), key=lambda x: -(x[1]["in"] + x[1]["out"]))],
        "pending_reimbursements": {
            "total": round((pending_reimbursements[0]["total"] if pending_reimbursements else 0), 2),
            "count": pending_reimbursements[0]["count"] if pending_reimbursements else 0},
        "pending_shares": {
            "total": round((pending_shares[0]["total"] if pending_shares else 0), 2),
            "count": pending_shares[0]["count"] if pending_shares else 0},
        "available_years": years or [str(year)],
    }


@router.get("/finance/export")
async def export_transactions(year: Optional[int] = None, month: Optional[int] = None,
                              quarter: Optional[int] = None,
                              admin: dict = Depends(require("finance.view_global"))):
    filters = [{"status": {"$ne": "ARCHIVED"}}]
    if year:
        start, end = period_range(year, month, quarter)
        filters.append({"date": {"$gte": start, "$lte": end}})
    items = await db.transactions.find({"$and": filters}, {"_id": 0}).sort("date", 1).to_list(5000)
    buffer = io.StringIO()
    writer = csv.writer(buffer, delimiter=";")
    writer.writerow(["Date", "Sens", "Montant (€)", "Catégorie", "Description", "Moyen", "Saisi par"])
    for t in items:
        writer.writerow([t.get("date"), "Recette" if t["direction"] == "IN" else "Dépense",
                         f"{t['amount']:.2f}".replace(".", ","),
                         CATEGORY_LABELS.get(t.get("category"), t.get("category")),
                         t.get("description"), t.get("payment_method"), t.get("created_by_name")])
    await log_action(admin, "EXPORT", "finance", None, new_value={"rows": len(items)})
    return Response(content="\ufeff" + buffer.getvalue(), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": 'attachment; filename="finances-lavoixduchien.csv"'})


# ---------------------------------------------------------------- Parts professionnels
class ShareLine(BaseModel):
    professional_id: str
    mode: str = "PERCENT"
    value: float = Field(ge=0)


class DistributionIn(BaseModel):
    label: str = Field(min_length=2)
    scope: str = "ACTIVITY"
    activity_id: Optional[str] = None
    event_id: Optional[str] = None
    date: str
    total_amount: float = Field(gt=0)
    lines: List[ShareLine]
    notes: Optional[str] = None


async def compute_lines(total: float, lines: List[ShareLine]) -> List[dict]:
    computed = []
    for line in lines:
        if line.mode not in ("PERCENT", "FIXED"):
            raise HTTPException(status_code=400, detail="Mode de répartition invalide (pourcentage ou montant)")
        amount = round(total * line.value / 100, 2) if line.mode == "PERCENT" else round(line.value, 2)
        computed.append({"professional_id": line.professional_id,
                         "professional_name": await display_name(line.professional_id),
                         "mode": line.mode, "value": line.value, "computed_amount": amount})
    distributed = sum(c["computed_amount"] for c in computed)
    if distributed > total + 0.01:
        raise HTTPException(status_code=400,
                            detail=f"La répartition ({distributed:.2f} €) dépasse le montant encaissé ({total:.2f} €)")
    return computed


@router.get("/finance/distributions")
async def list_distributions(year: Optional[int] = None, admin: dict = Depends(require("finance.view_global"))):
    query = {"status": {"$ne": "ARCHIVED"}}
    if year:
        start, end = period_range(year)
        query["date"] = {"$gte": start, "$lte": end}
    items = await db.distributions.find(query, {"_id": 0}).sort("date", -1).to_list(500)
    for d in items:
        d["lines"] = await db.distribution_lines.find({"distribution_id": d["distribution_id"]},
                                                      {"_id": 0}).to_list(50)
    return {"items": items, "total": len(items)}


@router.post("/finance/distributions")
async def create_distribution(payload: DistributionIn, admin: dict = Depends(require("finance.edit"))):
    if payload.scope not in ("ACTIVITY", "EVENT", "OTHER"):
        raise HTTPException(status_code=400, detail="Périmètre de répartition invalide")
    if not payload.lines:
        raise HTTPException(status_code=400, detail="Ajoutez au moins un professionnel")
    computed = await compute_lines(payload.total_amount, payload.lines)
    distributed = round(sum(c["computed_amount"] for c in computed), 2)
    doc = {"distribution_id": new_id("dst"), "label": payload.label, "scope": payload.scope,
           "activity_id": payload.activity_id, "event_id": payload.event_id, "date": payload.date,
           "total_amount": payload.total_amount, "distributed_amount": distributed,
           "association_amount": round(payload.total_amount - distributed, 2),
           "notes": payload.notes, "status": "VALIDATED", "created_by": admin["user_id"],
           "created_at": iso(now_utc()), "updated_at": iso(now_utc())}
    await db.distributions.insert_one(doc)
    for line in computed:
        await db.distribution_lines.insert_one({
            "line_id": new_id("dln"), "distribution_id": doc["distribution_id"],
            "date": payload.date, "label": payload.label, **line,
            "status": "PENDING", "paid_at": None, "created_at": iso(now_utc())})
        await notify(line["professional_id"], type="SHARE_ASSIGNED", title="Votre part a été calculée",
                     message=f"« {payload.label} » : {line['computed_amount']:.2f} € vous reviennent.",
                     level="INFO", resource_type="distribution", resource_id=doc["distribution_id"],
                     link="/finance/my-shares")
    await log_action(admin, "CREATE", "finance", doc["distribution_id"],
                     new_value={"label": payload.label, "total": payload.total_amount})
    doc["lines"] = computed
    return {k: v for k, v in doc.items() if k != "_id"}


@router.post("/finance/distribution-lines/{line_id}/pay")
async def pay_share_line(line_id: str, admin: dict = Depends(require("finance.validate"))):
    line = await db.distribution_lines.find_one({"line_id": line_id}, {"_id": 0})
    if not line:
        raise HTTPException(status_code=404, detail="Part introuvable")
    if line["status"] == "PAID":
        raise HTTPException(status_code=400, detail="Cette part est déjà réglée")
    await db.distribution_lines.update_one({"line_id": line_id},
                                           {"$set": {"status": "PAID", "paid_at": iso(now_utc())}})
    await log_action(admin, "PAY", "finance", line_id, new_value={"amount": line["computed_amount"]})
    await notify(line["professional_id"], type="SHARE_PAID", title="Part réglée",
                 message=f"« {line['label']} » : {line['computed_amount']:.2f} € ont été versés.",
                 level="SUCCESS", link="/finance/my-shares")
    return {"ok": True}


@router.get("/finance/my-shares")
async def my_shares(year: Optional[int] = None, user: dict = Depends(require("finance.view_own"))):
    query = {"professional_id": user["user_id"]}
    if year:
        start, end = period_range(year)
        query["date"] = {"$gte": start, "$lte": end}
    lines = await db.distribution_lines.find(query, {"_id": 0}).sort("date", -1).to_list(500)
    total = round(sum(line["computed_amount"] for line in lines), 2)
    paid = round(sum(line["computed_amount"] for line in lines if line["status"] == "PAID"), 2)
    return {"items": lines, "totals": {"total": total, "paid": paid, "pending": round(total - paid, 2)},
            "reimbursements": await db.reimbursements.find(
                {"beneficiary_id": user["user_id"]}, {"_id": 0}).sort("request_date", -1).to_list(100)}


# ---------------------------------------------------------------- Remboursements
class ReimbursementIn(BaseModel):
    beneficiary_id: Optional[str] = None
    reason: str = Field(min_length=3)
    amount: float = Field(gt=0)
    request_date: Optional[str] = None
    proof_file_id: Optional[str] = None
    notes: Optional[str] = None


@router.get("/finance/reimbursements")
async def list_reimbursements(status: Optional[str] = None, admin: dict = Depends(require("finance.view_global"))):
    query = {} if not status else {"status": status}
    items = await db.reimbursements.find(query, {"_id": 0}).sort("request_date", -1).to_list(500)
    for r in items:
        r["proof"] = await file_meta(r.get("proof_file_id"))
    pending = round(sum(r["amount"] for r in items if r["status"] in ("PENDING", "APPROVED")), 2)
    return {"items": items, "total": len(items), "pending_amount": pending}


@router.post("/finance/reimbursements")
async def create_reimbursement(payload: ReimbursementIn, user: dict = Depends(active_user)):
    beneficiary = payload.beneficiary_id or user["user_id"]
    if beneficiary != user["user_id"] and user["role"] != ROLE_ADMIN:
        raise HTTPException(status_code=403, detail="Vous ne pouvez demander un remboursement que pour vous-même")
    doc = {"reimbursement_id": new_id("rmb"), "beneficiary_id": beneficiary,
           "beneficiary_name": await display_name(beneficiary), "reason": payload.reason,
           "amount": payload.amount, "status": "PENDING",
           "request_date": payload.request_date or iso(now_utc())[:10], "paid_date": None,
           "proof_file_id": payload.proof_file_id, "notes": payload.notes,
           "created_by": user["user_id"], "validated_by": None,
           "created_at": iso(now_utc()), "updated_at": iso(now_utc())}
    await db.reimbursements.insert_one(doc)
    await log_action(user, "CREATE", "finance", doc["reimbursement_id"], new_value={"amount": payload.amount})
    await notify_bureau(type="REIMBURSEMENT_REQUEST", title="Demande de remboursement",
                        message=f"{doc['beneficiary_name']} demande {payload.amount:.2f} € — {payload.reason}",
                        level="ACTION", resource_type="reimbursement", resource_id=doc["reimbursement_id"],
                        link="/finance/reimbursements")
    return {k: v for k, v in doc.items() if k != "_id"}


@router.put("/finance/reimbursements/{reimbursement_id}")
async def update_reimbursement(reimbursement_id: str, body: dict,
                               admin: dict = Depends(require("finance.validate"))):
    item = await db.reimbursements.find_one({"reimbursement_id": reimbursement_id}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Remboursement introuvable")
    updates = {k: v for k, v in body.items()
               if k in ("status", "amount", "reason", "notes", "paid_date", "proof_file_id")}
    if not updates:
        raise HTTPException(status_code=400, detail="Aucune modification fournie")
    if "status" in updates:
        if updates["status"] not in REIMBURSEMENT_STATUSES:
            raise HTTPException(status_code=400, detail="Statut de remboursement invalide")
        if updates["status"] == "PAID":
            updates["paid_date"] = updates.get("paid_date") or iso(now_utc())[:10]
    updates["validated_by"] = admin["user_id"]
    updates["updated_at"] = iso(now_utc())
    await db.reimbursements.update_one({"reimbursement_id": reimbursement_id}, {"$set": updates})
    await log_action(admin, "UPDATE", "finance", reimbursement_id, new_value=updates)
    if updates.get("status") == "PAID":
        await db.transactions.insert_one({
            "transaction_id": new_id("trx"), "direction": "OUT", "date": updates["paid_date"],
            "amount": item["amount"], "category": "REMBOURSEMENT",
            "description": f"Remboursement — {item['beneficiary_name']} — {item['reason']}",
            "payment_method": "AUTRE", "activity_id": None, "event_id": None, "project_id": None,
            "professional_id": None, "member_id": item["beneficiary_id"], "receipt_file_id": None,
            "status": "RECORDED", "created_by": admin["user_id"],
            "created_by_name": await display_name(admin["user_id"]),
            "created_at": iso(now_utc()), "updated_at": iso(now_utc())})
    if updates.get("status") in ("APPROVED", "PAID", "REFUSED"):
        labels = {"APPROVED": "Remboursement approuvé", "PAID": "Remboursement effectué",
                  "REFUSED": "Remboursement refusé"}
        await notify(item["beneficiary_id"], type="REIMBURSEMENT_UPDATE", title=labels[updates["status"]],
                     message=f"{item['reason']} — {item['amount']:.2f} €",
                     level="SUCCESS" if updates["status"] != "REFUSED" else "WARNING",
                     link="/finance/my-shares")
    return await db.reimbursements.find_one({"reimbursement_id": reimbursement_id}, {"_id": 0})


# ---------------------------------------------------------------- Avantages adhérents
class AdvantageIn(BaseModel):
    title: str = Field(min_length=2)
    description: Optional[str] = None
    kind: str = "CODE_PROMO"
    promo_code: Optional[str] = None
    partner_name: Optional[str] = None
    professional_id: Optional[str] = None
    conditions: Optional[str] = None
    valid_from: Optional[str] = None
    valid_until: Optional[str] = None
    quantity: Optional[int] = None
    access_level: str = "MEMBERS"
    cover_file_id: Optional[str] = None
    activity_id: Optional[str] = None
    partner_id: Optional[str] = None
    stock_item_id: Optional[str] = None


class AdvantageUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    kind: Optional[str] = None
    promo_code: Optional[str] = None
    partner_name: Optional[str] = None
    professional_id: Optional[str] = None
    conditions: Optional[str] = None
    valid_from: Optional[str] = None
    valid_until: Optional[str] = None
    quantity: Optional[int] = None
    access_level: Optional[str] = None
    cover_file_id: Optional[str] = None
    status: Optional[str] = None


def advantage_state(item: dict) -> str:
    today = iso(now_utc())[:10]
    if item.get("status") in ("ARCHIVED", "SOLD_OUT"):
        return item["status"]
    if item.get("valid_until") and item["valid_until"] < today:
        return "EXPIRED"
    if item.get("quantity") is not None and item.get("used_count", 0) >= item["quantity"]:
        return "SOLD_OUT"
    return item.get("status") or "ACTIVE"


@router.get("/advantages")
async def list_advantages(kind: Optional[str] = None, include_inactive: bool = False,
                          user: dict = Depends(require("advantages.view"))):
    manager = await is_manager(user)
    filters = [] if (manager and include_inactive) else [{"status": {"$ne": "ARCHIVED"}}]
    if not manager:
        filters.append({"access_level": {"$in": allowed_access(user)}})
    if kind:
        filters.append({"kind": kind})
    query = {"$and": filters} if filters else {}
    items = await db.advantages.find(query, {"_id": 0}).sort("created_at", -1).to_list(300)
    claims = {c["advantage_id"] async for c in db.advantage_claims.find(
        {"user_id": user["user_id"]}, {"_id": 0, "advantage_id": 1})}
    result = []
    for item in items:
        item["state"] = advantage_state(item)
        item["is_claimed"] = item["advantage_id"] in claims
        item["remaining"] = None if item.get("quantity") is None else \
            max(item["quantity"] - item.get("used_count", 0), 0)
        if not manager:
            if item["state"] != "ACTIVE" and not item["is_claimed"]:
                continue
            if not item["is_claimed"] and item["kind"] == "CODE_PROMO":
                item["promo_code"] = None
        result.append(item)
    return {"items": result, "total": len(result), "is_manager": manager}


@router.post("/advantages")
async def create_advantage(payload: AdvantageIn, user: dict = Depends(manager_user)):
    if payload.kind not in ADVANTAGE_KINDS:
        raise HTTPException(status_code=400, detail="Type d'avantage invalide")
    doc = {"advantage_id": new_id("adv"), **payload.model_dump(), "status": "ACTIVE",
           "used_count": 0, "created_by": user["user_id"],
           "created_at": iso(now_utc()), "updated_at": iso(now_utc())}
    await db.advantages.insert_one(doc)
    await log_action(user, "CREATE", "advantages", doc["advantage_id"], new_value={"title": payload.title})
    async for u in db.users.find({"status": "ACTIVE"}, {"_id": 0, "user_id": 1}):
        await notify(u["user_id"], type="NEW_ADVANTAGE", title="Nouvel avantage adhérent",
                     message=f"« {payload.title} » est disponible dans vos avantages.", level="INFO",
                     resource_type="advantage", resource_id=doc["advantage_id"], link="/advantages")
    return {k: v for k, v in doc.items() if k != "_id"}


@router.put("/advantages/{advantage_id}")
async def update_advantage(advantage_id: str, payload: AdvantageUpdate, user: dict = Depends(manager_user)):
    item = await db.advantages.find_one({"advantage_id": advantage_id}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Avantage introuvable")
    updates = payload.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="Aucune modification fournie")
    if "status" in updates and updates["status"] not in ADVANTAGE_STATUSES:
        raise HTTPException(status_code=400, detail="Statut d'avantage invalide")
    if "kind" in updates and updates["kind"] not in ADVANTAGE_KINDS:
        raise HTTPException(status_code=400, detail="Type d'avantage invalide")
    updates["updated_at"] = iso(now_utc())
    await db.advantages.update_one({"advantage_id": advantage_id}, {"$set": updates})
    await log_action(user, "UPDATE", "advantages", advantage_id, new_value=updates)
    return await db.advantages.find_one({"advantage_id": advantage_id}, {"_id": 0})


@router.post("/advantages/{advantage_id}/claim")
async def claim_advantage(advantage_id: str, body: dict = None,
                          user: dict = Depends(require("advantages.view"))):
    item = await db.advantages.find_one({"advantage_id": advantage_id}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Avantage introuvable")
    if advantage_state(item) != "ACTIVE":
        raise HTTPException(status_code=400, detail="Cet avantage n'est plus disponible")
    if item["access_level"] not in allowed_access(user) and user["role"] != ROLE_ADMIN:
        raise HTTPException(status_code=403, detail="Cet avantage ne vous est pas accessible")
    if await db.advantage_claims.find_one({"advantage_id": advantage_id, "user_id": user["user_id"]}):
        raise HTTPException(status_code=400, detail="Vous avez déjà réservé cet avantage")
    claim = {"claim_id": new_id("clm"), "advantage_id": advantage_id, "user_id": user["user_id"],
             "user_name": await display_name(user["user_id"]), "advantage_title": item["title"],
             "comment": (body or {}).get("comment"), "status": "RESERVED", "created_at": iso(now_utc())}
    await db.advantage_claims.insert_one(dict(claim))
    used = item.get("used_count", 0) + 1
    updates = {"used_count": used, "updated_at": iso(now_utc())}
    if item.get("quantity") is not None and used >= item["quantity"]:
        updates["status"] = "SOLD_OUT"
    await db.advantages.update_one({"advantage_id": advantage_id}, {"$set": updates})
    await log_action(user, "CLAIM", "advantages", advantage_id)
    if item.get("stock_item_id"):
        from stock import consume_stock
        await consume_stock(item["stock_item_id"], 1, f"Avantage adhérent — {item['title']}",
                            user["user_id"], user)
    await notify_bureau(type="ADVANTAGE_CLAIMED", title="Avantage réservé",
                        message=f"{claim['user_name']} a réservé « {item['title']} ».", level="INFO",
                        resource_type="advantage", resource_id=advantage_id, link="/advantages")
    return {"claim": claim, "promo_code": item.get("promo_code")}


@router.get("/advantages/{advantage_id}/claims")
async def advantage_claims(advantage_id: str, user: dict = Depends(manager_user)):
    items = await db.advantage_claims.find({"advantage_id": advantage_id}, {"_id": 0}) \
        .sort("created_at", -1).to_list(500)
    return {"items": items, "total": len(items)}
