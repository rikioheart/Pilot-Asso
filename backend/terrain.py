"""Phase 7 — Terrains & équipements, disponibilités, demandes de réservation."""
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from rbac import ROLE_ADMIN, ROLE_MEMBER, ROLE_PRO
from deps import (db, iso, now_utc, new_id, active_user, require, require_admin,
                  log_action, notify, notify_bureau, display_name)
from content import is_manager

router = APIRouter(prefix="/api")

TERRAIN_STATUSES = ["DISPONIBLE", "AMENAGEMENT", "INDISPONIBLE", "ARCHIVE"]
RESERVATION_CATEGORIES = ["SEANCE_SIMPLE", "COLLECTIVE", "SPORTIVE", "EVENEMENT",
                          "REUNION", "FORMATION", "STAGE"]
CATEGORY_LABELS = {
    "SEANCE_SIMPLE": "Séance simple", "COLLECTIVE": "Séance collective", "SPORTIVE": "Activité sportive",
    "EVENEMENT": "Événement", "REUNION": "Réunion", "FORMATION": "Formation", "STAGE": "Stage",
}
RESERVATION_STATUSES = ["PENDING", "CONFIRMED", "REFUSED", "CANCELLED"]
DEFAULT_RATES = {c: 0.0 for c in RESERVATION_CATEGORIES}


class TerrainIn(BaseModel):
    name: str = Field(min_length=2)
    location: Optional[str] = None
    description: Optional[str] = None
    status: str = "DISPONIBLE"
    surface: Optional[str] = None
    capacity: Optional[int] = None
    equipment: List[str] = []
    document_file_ids: List[str] = []
    photo_file_id: Optional[str] = None
    responsible_id: Optional[str] = None
    access_notes: Optional[str] = None
    hourly_rates: Dict[str, float] = {}


class TerrainUpdate(BaseModel):
    name: Optional[str] = None
    location: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    surface: Optional[str] = None
    capacity: Optional[int] = None
    equipment: Optional[List[str]] = None
    document_file_ids: Optional[List[str]] = None
    photo_file_id: Optional[str] = None
    responsible_id: Optional[str] = None
    access_notes: Optional[str] = None
    hourly_rates: Optional[Dict[str, float]] = None


class SlotIn(BaseModel):
    date: str
    start_time: str = "09:00"
    end_time: str = "12:00"
    is_open: bool = True
    comment: Optional[str] = None


class ReservationIn(BaseModel):
    terrain_id: str
    date: str
    start_time: str = "09:00"
    end_time: str = "12:00"
    category: str = "SEANCE_SIMPLE"
    purpose: str = ""
    description: Optional[str] = None
    resource: Optional[str] = None
    is_free: bool = False
    expected_people: Optional[int] = None
    activity_id: Optional[str] = None
    event_id: Optional[str] = None
    project_id: Optional[str] = None
    task_id: Optional[str] = None
    professional_id: Optional[str] = None


@router.get("/terrains/meta")
async def terrains_meta(user: dict = Depends(require("terrain.view"))):
    return {"statuses": TERRAIN_STATUSES, "categories": RESERVATION_CATEGORIES,
            "category_labels": CATEGORY_LABELS, "default_rates": DEFAULT_RATES,
            "reservation_statuses": RESERVATION_STATUSES, "is_manager": await is_manager(user)}


@router.get("/terrains")
async def list_terrains(user: dict = Depends(require("terrain.view"))):
    manager = await is_manager(user)
    query = {"status": {"$ne": "ARCHIVE"}} if manager else {"status": "DISPONIBLE"}
    items = await db.terrains.find(query, {"_id": 0}).sort("name", 1).to_list(200)
    today = iso(now_utc())[:10]
    for terrain in items:
        terrain["activities"] = await db.activities.find(
            {"terrain_id": terrain["terrain_id"], "date": {"$gte": today},
             "status": {"$in": ["PLANNED", "ACTIVE", "FULL"]}},
            {"_id": 0, "activity_id": 1, "title": 1, "date": 1, "category": 1}).sort("date", 1).to_list(20)
        if user["role"] == ROLE_MEMBER and not manager:
            for hidden in ("document_file_ids", "access_notes", "responsible_id"):
                terrain.pop(hidden, None)
        else:
            terrain["slots"] = await db.terrain_slots.find(
                {"terrain_id": terrain["terrain_id"], "date": {"$gte": today}},
                {"_id": 0}).sort("date", 1).to_list(60)
            terrain["confirmed_reservations"] = await db.terrain_reservations.find(
                {"terrain_id": terrain["terrain_id"], "date": {"$gte": today}, "status": "CONFIRMED"},
                {"_id": 0, "date": 1, "start_time": 1, "end_time": 1, "category": 1}).to_list(60)
    return {"items": items, "total": len(items), "is_manager": manager,
            "can_reserve": "terrain.reserve" in (user.get("permissions") or []) or manager}


@router.post("/terrains")
async def create_terrain(payload: TerrainIn, admin: dict = Depends(require_admin)):
    if payload.status not in TERRAIN_STATUSES:
        raise HTTPException(status_code=400, detail="Statut de terrain invalide")
    doc = {"terrain_id": new_id("ter"), **payload.model_dump(),
           "created_by": admin["user_id"], "created_at": iso(now_utc()), "updated_at": iso(now_utc())}
    await db.terrains.insert_one(dict(doc))
    await log_action(admin, "CREATE", "terrain", doc["terrain_id"], new_value={"name": payload.name})
    return doc


@router.put("/terrains/{terrain_id}")
async def update_terrain(terrain_id: str, payload: TerrainUpdate, admin: dict = Depends(require_admin)):
    terrain = await db.terrains.find_one({"terrain_id": terrain_id}, {"_id": 0})
    if not terrain:
        raise HTTPException(status_code=404, detail="Terrain introuvable")
    updates = payload.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="Aucune modification fournie")
    if "status" in updates and updates["status"] not in TERRAIN_STATUSES:
        raise HTTPException(status_code=400, detail="Statut de terrain invalide")
    updates["updated_at"] = iso(now_utc())
    await db.terrains.update_one({"terrain_id": terrain_id}, {"$set": updates})
    await log_action(admin, "UPDATE", "terrain", terrain_id, new_value=updates)
    return await db.terrains.find_one({"terrain_id": terrain_id}, {"_id": 0})


@router.post("/terrains/{terrain_id}/slots")
async def create_slot(terrain_id: str, payload: SlotIn, admin: dict = Depends(require("terrain.validate"))):
    if not await db.terrains.find_one({"terrain_id": terrain_id}):
        raise HTTPException(status_code=404, detail="Terrain introuvable")
    doc = {"slot_id": new_id("slt"), "terrain_id": terrain_id, **payload.model_dump(),
           "created_by": admin["user_id"], "created_at": iso(now_utc())}
    await db.terrain_slots.insert_one(dict(doc))
    await log_action(admin, "CREATE", "terrain", terrain_id, new_value={"slot": payload.date})
    return doc


@router.delete("/terrains/slots/{slot_id}")
async def delete_slot(slot_id: str, admin: dict = Depends(require("terrain.validate"))):
    res = await db.terrain_slots.delete_one({"slot_id": slot_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Créneau introuvable")
    return {"ok": True}


@router.get("/terrain-reservations")
async def list_reservations(status: Optional[str] = None, terrain_id: Optional[str] = None,
                           user: dict = Depends(require("terrain.view"))):
    manager = await is_manager(user)
    query = {} if manager else {"requested_by": user["user_id"]}
    if status:
        query["status"] = status
    if terrain_id:
        query["terrain_id"] = terrain_id
    items = await db.terrain_reservations.find(query, {"_id": 0}).sort("date", -1).to_list(300)
    return {"items": items, "total": len(items), "is_manager": manager,
            "pending_count": await db.terrain_reservations.count_documents({"status": "PENDING"})
            if manager else 0}


def duration_hours(start: str, end: str) -> float:
    def minutes(value: str) -> int:
        hour, _, minute = value.partition(":")
        return int(hour) * 60 + int(minute or 0)
    return max(minutes(end) - minutes(start), 0) / 60


@router.post("/terrain-reservations")
async def request_reservation(payload: ReservationIn, user: dict = Depends(require("terrain.reserve"))):
    terrain = await db.terrains.find_one({"terrain_id": payload.terrain_id}, {"_id": 0})
    if not terrain:
        raise HTTPException(status_code=404, detail="Terrain introuvable")
    if terrain["status"] != "DISPONIBLE":
        raise HTTPException(status_code=400, detail="Ce terrain n'est pas disponible à la réservation")
    if payload.category not in RESERVATION_CATEGORIES:
        raise HTTPException(status_code=400, detail="Catégorie de réservation invalide")
    if payload.date < iso(now_utc())[:10]:
        raise HTTPException(status_code=400, detail="La date demandée est déjà passée")
    clash = await db.terrain_reservations.find_one({
        "terrain_id": payload.terrain_id, "date": payload.date, "status": "CONFIRMED",
        "start_time": {"$lt": payload.end_time}, "end_time": {"$gt": payload.start_time}})
    if clash:
        raise HTTPException(status_code=400, detail="Ce créneau est déjà réservé sur ce terrain")
    hours = duration_hours(payload.start_time, payload.end_time)
    if hours <= 0:
        raise HTTPException(status_code=400, detail="L'heure de fin doit suivre l'heure de début")
    rate = float((terrain.get("hourly_rates") or {}).get(payload.category) or 0)
    amount = 0.0 if payload.is_free else round(rate * hours, 2)
    doc = {"reservation_id": new_id("res"), **payload.model_dump(), "status": "PENDING",
           "hours": hours, "hourly_rate": rate, "amount": amount,
           "payment_status": "FREE" if amount == 0 else "EXPECTED", "transaction_id": None,
           "requested_by": user["user_id"], "requested_by_name": await display_name(user["user_id"]),
           "terrain_name": terrain["name"], "review_comment": None, "validated_by": None,
           "created_at": iso(now_utc()), "updated_at": iso(now_utc())}
    await db.terrain_reservations.insert_one(dict(doc))
    await log_action(user, "CREATE", "terrain", doc["reservation_id"],
                     new_value={"terrain": terrain["name"], "date": payload.date})
    await notify_bureau(type="TERRAIN_REQUEST", title="Demande de réservation de terrain",
                        message=f"{doc['requested_by_name']} demande « {terrain['name']} » "
                                f"le {payload.date} de {payload.start_time} à {payload.end_time}.",
                        level="ACTION", resource_type="terrain_reservation",
                        resource_id=doc["reservation_id"], link="/terrains")
    return doc


@router.post("/terrain-reservations/{reservation_id}/review")
async def review_reservation(reservation_id: str, body: dict,
                             admin: dict = Depends(require("terrain.validate"))):
    reservation = await db.terrain_reservations.find_one({"reservation_id": reservation_id}, {"_id": 0})
    if not reservation:
        raise HTTPException(status_code=404, detail="Demande introuvable")
    decision = body.get("decision")
    if decision not in ("CONFIRM", "REFUSE"):
        raise HTTPException(status_code=400, detail="Décision invalide")
    status = "CONFIRMED" if decision == "CONFIRM" else "REFUSED"
    if decision == "REFUSE" and not body.get("comment"):
        raise HTTPException(status_code=400, detail="Merci d'indiquer le motif du refus")
    updates = {"status": status, "review_comment": body.get("comment"),
               "validated_by": admin["user_id"], "updated_at": iso(now_utc())}
    if status == "CONFIRMED" and (reservation.get("amount") or 0) > 0 \
            and not reservation.get("transaction_id"):
        transaction_id = new_id("trx")
        await db.transactions.insert_one({
            "transaction_id": transaction_id, "direction": "IN", "date": reservation["date"],
            "amount": reservation["amount"], "category": "ACTIVITE",
            "description": f"Location terrain — {reservation['terrain_name']} — "
                           f"{reservation['requested_by_name']} ({CATEGORY_LABELS.get(reservation['category'])})",
            "payment_method": "AUTRE", "activity_id": reservation.get("activity_id"),
            "event_id": reservation.get("event_id"), "project_id": None,
            "professional_id": reservation["requested_by"], "member_id": None,
            "receipt_file_id": None, "status": "PROVISIONAL", "created_by": admin["user_id"],
            "created_by_name": await display_name(admin["user_id"]),
            "created_at": iso(now_utc()), "updated_at": iso(now_utc())})
        updates["transaction_id"] = transaction_id
        updates["payment_status"] = "EXPECTED"
    await db.terrain_reservations.update_one({"reservation_id": reservation_id}, {"$set": updates})
    await log_action(admin, "REVIEW", "terrain", reservation_id, new_value={"status": status})
    await notify(reservation["requested_by"], type="TERRAIN_REVIEWED",
                 title="Réservation confirmée" if status == "CONFIRMED" else "Réservation refusée",
                 message=body.get("comment") or
                 f"« {reservation['terrain_name']} » le {reservation['date']} : décision enregistrée.",
                 level="SUCCESS" if status == "CONFIRMED" else "WARNING",
                 resource_type="terrain_reservation", resource_id=reservation_id, link="/terrains")
    return await db.terrain_reservations.find_one({"reservation_id": reservation_id}, {"_id": 0})


@router.post("/terrain-reservations/{reservation_id}/paid")
async def mark_reservation_paid(reservation_id: str, admin: dict = Depends(require("finance.validate"))):
    reservation = await db.terrain_reservations.find_one({"reservation_id": reservation_id}, {"_id": 0})
    if not reservation:
        raise HTTPException(status_code=404, detail="Réservation introuvable")
    if (reservation.get("amount") or 0) <= 0:
        raise HTTPException(status_code=400, detail="Cette réservation est gratuite")
    if reservation.get("payment_status") == "PAID":
        raise HTTPException(status_code=400, detail="Cette location est déjà encaissée")
    if reservation.get("transaction_id"):
        await db.transactions.update_one({"transaction_id": reservation["transaction_id"]},
                                         {"$set": {"status": "RECORDED", "updated_at": iso(now_utc())}})
    await db.terrain_reservations.update_one({"reservation_id": reservation_id},
                                             {"$set": {"payment_status": "PAID",
                                                       "updated_at": iso(now_utc())}})
    await log_action(admin, "PAY", "terrain", reservation_id, new_value={"amount": reservation["amount"]})
    await notify(reservation["requested_by"], type="TERRAIN_PAID", title="Location encaissée",
                 message=f"{reservation['terrain_name']} — {reservation['amount']:.2f} € enregistrés.",
                 level="SUCCESS", link="/terrains")
    return {"ok": True, "payment_status": "PAID"}


@router.get("/calendar/unified")
async def unified_calendar(user: dict = Depends(active_user)):
    """Agenda partagé filtré par rôle : réservations, activités, événements, formations."""
    manager = await is_manager(user)
    today = iso(now_utc())[:10]
    items = []

    query = {"status": "CONFIRMED", "date": {"$gte": today}}
    if not manager:
        query["requested_by"] = user["user_id"]
    if manager or user["role"] == ROLE_PRO:
        async for r in db.terrain_reservations.find(query, {"_id": 0}):
            items.append({"kind": "TERRAIN", "id": r["reservation_id"], "origin": "PLATFORM",
                          "title": r.get("purpose") or CATEGORY_LABELS.get(r["category"], "Réservation"),
                          "subtitle": f"{r['terrain_name']} · {r['requested_by_name']}",
                          "description": r.get("description"), "resource": r.get("resource"),
                          "category": CATEGORY_LABELS.get(r["category"]),
                          "date": r["date"], "start_time": r.get("start_time"),
                          "end_time": r.get("end_time"), "link": "/terrains"})

    mine = set()
    if not manager:
        async for p in db.participations.find({"user_id": user["user_id"]}, {"_id": 0}):
            mine.add(p.get("activity_id") or p.get("event_id"))

    async for a in db.activities.find({"date": {"$gte": today},
                                       "status": {"$in": ["PLANNED", "ACTIVE", "FULL"]}}, {"_id": 0}):
        if not manager and user["role"] == ROLE_MEMBER and a["activity_id"] not in mine:
            continue
        items.append({"kind": "ACTIVITY", "id": a["activity_id"], "origin": "PLATFORM",
                      "title": a["title"], "subtitle": a.get("location") or "Activité",
                      "date": a["date"], "start_time": a.get("start_time"), "link": "/activities"})

    async for e in db.events.find({"start_date": {"$gte": today},
                                   "status": {"$in": ["PLANNED", "CONFIRMED"]}}, {"_id": 0}):
        if not manager and user["role"] == ROLE_MEMBER and e["event_id"] not in mine:
            continue
        items.append({"kind": "EVENT", "id": e["event_id"], "origin": "PLATFORM",
                      "title": e["title"], "subtitle": e.get("location") or "Événement",
                      "date": e["start_date"][:10], "link": f"/events/{e['event_id']}"})

    async for f in db.formations.find({"date": {"$gte": today},
                                       "status": {"$in": ["PLANNED", "LIVE"]}}, {"_id": 0}):
        items.append({"kind": "FORMATION", "id": f["formation_id"], "origin": "PLATFORM",
                      "title": f["title"], "subtitle": f.get("speaker_name") or "Session en ligne",
                      "date": f["date"], "start_time": f.get("start_time"), "link": "/formations"})

    items.sort(key=lambda x: (x.get("date") or "", x.get("start_time") or ""))
    return {"items": items, "total": len(items), "is_manager": manager,
            "google_sync": {"enabled": False,
                            "message": "Synchronisation Google Calendar bientôt disponible"}}


@router.delete("/terrain-reservations/{reservation_id}")
async def cancel_reservation(reservation_id: str, user: dict = Depends(require("terrain.view"))):
    reservation = await db.terrain_reservations.find_one({"reservation_id": reservation_id}, {"_id": 0})
    if not reservation:
        raise HTTPException(status_code=404, detail="Demande introuvable")
    if reservation["requested_by"] != user["user_id"] and not await is_manager(user):
        raise HTTPException(status_code=403, detail="Vous ne pouvez pas annuler cette demande")
    await db.terrain_reservations.update_one({"reservation_id": reservation_id},
                                             {"$set": {"status": "CANCELLED", "updated_at": iso(now_utc())}})
    await log_action(user, "CANCEL", "terrain", reservation_id)
    return {"ok": True}
