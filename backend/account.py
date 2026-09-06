"""Prompt 8G — Compte membre : mode de notification, mode vacances, désactivation & suppression RGPD."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from rbac import ROLE_ADMIN
from deps import (db, iso, now_utc, active_user, log_action, notify, notify_bureau, display_name)

router = APIRouter(prefix="/api")


class DeliveryIn(BaseModel):
    delivery_mode: Optional[str] = None  # IMMEDIATE | DIGEST
    digest_hour: Optional[int] = None    # 0..23


class VacationIn(BaseModel):
    end_date: str                        # YYYY-MM-DD
    replacement_user_id: Optional[str] = None


class DeleteIn(BaseModel):
    confirm: bool = False


async def _prefs(user_id: str) -> dict:
    profile = await db.profiles.find_one({"user_id": user_id}, {"_id": 0, "preferences": 1})
    return ((profile or {}).get("preferences") or {})


@router.get("/account/settings")
async def account_settings(user: dict = Depends(active_user)):
    prefs = await _prefs(user["user_id"])
    profile = await db.profiles.find_one({"user_id": user["user_id"]}, {"_id": 0, "deactivated": 1})
    is_bureau = user["role"] == ROLE_ADMIN
    return {
        "delivery_mode": prefs.get("delivery_mode") or "IMMEDIATE",
        "digest_hour": prefs.get("digest_hour", 18),
        "vacation": prefs.get("vacation") or {"active": False},
        "deactivated": bool((profile or {}).get("deactivated")),
        "is_bureau": is_bureau,
        "notifications_locked": is_bureau,
    }


@router.put("/account/notifications")
async def set_delivery(payload: DeliveryIn, user: dict = Depends(active_user)):
    if user["role"] == ROLE_ADMIN:
        raise HTTPException(status_code=403, detail="Le Bureau reçoit toujours ses notifications immédiatement")
    updates = {}
    if payload.delivery_mode is not None:
        if payload.delivery_mode not in ("IMMEDIATE", "DIGEST"):
            raise HTTPException(status_code=400, detail="Mode de réception invalide")
        updates["preferences.delivery_mode"] = payload.delivery_mode
    if payload.digest_hour is not None:
        if not 0 <= payload.digest_hour <= 23:
            raise HTTPException(status_code=400, detail="Choisissez une heure entre 0 et 23")
        updates["preferences.digest_hour"] = payload.digest_hour
    if not updates:
        raise HTTPException(status_code=400, detail="Aucune préférence fournie")
    updates["updated_at"] = iso(now_utc())
    await db.profiles.update_one({"user_id": user["user_id"]}, {"$set": updates})
    prefs = await _prefs(user["user_id"])
    return {"delivery_mode": prefs.get("delivery_mode") or "IMMEDIATE", "digest_hour": prefs.get("digest_hour", 18)}


async def _bureau_relay_available(user_id: str) -> bool:
    """Un autre profil Bureau actif, non en vacances, prend le relais ?"""
    async for u in db.users.find({"role": ROLE_ADMIN, "status": "ACTIVE", "is_active": True,
                                  "user_id": {"$ne": user_id}}, {"_id": 0, "user_id": 1}):
        prefs = await _prefs(u["user_id"])
        if not (prefs.get("vacation") or {}).get("active"):
            return True
    return False


@router.post("/account/vacation")
async def start_vacation(payload: VacationIn, user: dict = Depends(active_user)):
    today = iso(now_utc())[:10]
    if payload.end_date <= today:
        raise HTTPException(status_code=400, detail="Choisissez une date de fin dans le futur")
    replacement_name = None
    if user["role"] == ROLE_ADMIN and not await _bureau_relay_available(user["user_id"]):
        if not payload.replacement_user_id:
            raise HTTPException(status_code=409,
                                detail="Aucun autre profil Bureau actif ne peut prendre le relais. "
                                       "Désignez un remplaçant temporaire pour activer le mode vacances.")
        replacement = await db.users.find_one({"user_id": payload.replacement_user_id}, {"_id": 0, "role": 1})
        if not replacement or replacement["role"] != ROLE_ADMIN:
            raise HTTPException(status_code=400, detail="Le remplaçant doit être un membre du Bureau")
        replacement_name = await display_name(payload.replacement_user_id)
    vacation = {"active": True, "start_date": today, "end_date": payload.end_date,
                "replacement_user_id": payload.replacement_user_id, "started_at": iso(now_utc())}
    await db.profiles.update_one({"user_id": user["user_id"]},
                                 {"$set": {"preferences.vacation": vacation, "updated_at": iso(now_utc())}})
    await log_action(user, "VACATION_ON", "account", user["user_id"], new_value={"end_date": payload.end_date})
    name = await display_name(user["user_id"])
    extra = f" {replacement_name} prend le relais." if replacement_name else ""
    await notify_bureau(type="MEMBER_ON_VACATION", title="Un membre est en mode vacances",
                        message=f"{name} est en mode vacances jusqu'au {payload.end_date}.{extra}",
                        level="INFO", link="/admin/members")
    if payload.replacement_user_id:
        await notify(payload.replacement_user_id, type="VACATION_RELAY",
                     title="Vous prenez le relais du Bureau",
                     message=f"{name} vous a désigné comme remplaçant jusqu'au {payload.end_date}.",
                     level="ACTION", link="/admin/dashboard")
    return {"vacation": vacation}


@router.delete("/account/vacation")
async def end_vacation(user: dict = Depends(active_user)):
    await db.profiles.update_one({"user_id": user["user_id"]},
                                 {"$set": {"preferences.vacation": {"active": False}, "updated_at": iso(now_utc())}})
    await log_action(user, "VACATION_OFF", "account", user["user_id"])
    return {"vacation": {"active": False}}


@router.post("/account/deactivate")
async def deactivate_account(user: dict = Depends(active_user)):
    if user["role"] == ROLE_ADMIN and not await _bureau_relay_available(user["user_id"]):
        raise HTTPException(status_code=409,
                            detail="Un autre profil Bureau actif doit exister avant de désactiver votre compte.")
    await db.profiles.update_one({"user_id": user["user_id"]},
                                 {"$set": {"deactivated": True, "deactivated_at": iso(now_utc()),
                                           "updated_at": iso(now_utc())}})
    await log_action(user, "DEACTIVATE", "account", user["user_id"])
    name = await display_name(user["user_id"])
    await notify_bureau(type="ACCOUNT_DEACTIVATED", title="Compte désactivé",
                        message=f"{name} a désactivé son compte. Son profil est désormais masqué ; ses données sont conservées.",
                        level="INFO", link="/admin/members")
    return {"deactivated": True}


@router.post("/account/reactivate")
async def reactivate_account(user: dict = Depends(active_user)):
    await db.profiles.update_one({"user_id": user["user_id"]},
                                 {"$set": {"deactivated": False, "updated_at": iso(now_utc())}})
    await log_action(user, "REACTIVATE", "account", user["user_id"])
    return {"deactivated": False}


@router.post("/account/delete")
async def delete_account(payload: DeleteIn, user: dict = Depends(active_user)):
    if not payload.confirm:
        raise HTTPException(status_code=400, detail="Confirmez la suppression définitive pour continuer")
    if user["role"] == ROLE_ADMIN and not await _bureau_relay_available(user["user_id"]):
        raise HTTPException(status_code=409,
                            detail="Un autre profil Bureau actif doit exister avant de supprimer votre compte.")
    uid = user["user_id"]
    name = await display_name(uid)
    # RGPD : effacement des données personnelles, conservation des données comptables (anonymisées).
    await db.profiles.update_one({"user_id": uid}, {"$set": {
        "display_name": "Ancien adhérent", "first_name": None, "last_name": None, "phone": None,
        "city": None, "department": None, "bio": None, "avatar": None, "avatar_file_id": None,
        "deactivated": True, "deleted": True, "deleted_at": iso(now_utc()), "updated_at": iso(now_utc())}})
    await db.users.update_one({"user_id": uid}, {"$set": {
        "is_active": False, "status": "DELETED", "email": f"supprime_{uid}@lavoixduchien.invalid",
        "deleted_at": iso(now_utc()), "updated_at": iso(now_utc())}})
    # Les paiements/cotisations restent liés à l'user_id mais s'afficheront comme « Ancien adhérent ».
    await db.notifications.delete_many({"recipient_id": uid})
    await log_action({"user_id": uid, "email": "system"}, "DELETE", "account", uid,
                     comment="Suppression RGPD à la demande du membre")
    await notify_bureau(type="ACCOUNT_DELETED", title="Demande de suppression RGPD",
                        message=f"{name} a demandé la suppression définitive de son compte. "
                                "Les données personnelles ont été effacées ; les données comptables sont conservées.",
                        level="WARNING", link="/admin/members")
    return {"deleted": True}
