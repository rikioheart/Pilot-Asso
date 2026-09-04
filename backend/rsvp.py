"""Prompt 8D Lot C — Participation à 3 états (Je participe / Peut-être / Pas possible).

« Je participe » sur une activité/événement crée l'inscription existante (compte dans la capacité,
éligible aux tampons). « Peut-être » / « Pas possible » sont de simples réponses sans consommer de place.
Sur les tâches et créneaux terrain, les 3 états sont de simples réponses.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from rbac import ROLE_ADMIN, ROLE_PRO
from deps import db, iso, now_utc, new_id, active_user, display_name, notify

router = APIRouter(prefix="/api")

RSVP_STATES = ["PARTICIPE", "PEUT_ETRE", "PAS_POSSIBLE"]
ELEMENTS = {
    "activity": ("activities", "activity_id"),
    "event": ("events", "event_id"),
    "task": ("tasks", "task_id"),
    "terrain_slot": ("terrain_slots", "slot_id"),
}
ROLE_BUCKET = {ROLE_ADMIN: "BUREAU", ROLE_PRO: "PRO", "PARTICULIER": "MEMBRE"}


class RsvpIn(BaseModel):
    element_type: str
    element_id: str
    state: str


async def _load(element_type: str, element_id: str) -> dict:
    if element_type not in ELEMENTS:
        raise HTTPException(status_code=400, detail="Type d'élément non pris en charge")
    coll, key = ELEMENTS[element_type]
    doc = await db[coll].find_one({key: element_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Élément introuvable")
    return doc


def _bucket(role: str) -> str:
    return ROLE_BUCKET.get(role, "MEMBRE")


async def _sync_participation(element_type: str, element_id: str, doc: dict, user: dict, joining: bool):
    """Synchronise l'inscription existante pour l'état PARTICIPE (activités/événements)."""
    if element_type not in ("activity", "event"):
        return
    field = "activity_id" if element_type == "activity" else "event_id"
    query = {field: element_id, "user_id": user["user_id"]}
    if joining:
        if await db.participations.find_one(query):
            return
        count = await db.participations.count_documents(
            {field: element_id, "registration_status": {"$in": ["CONFIRMED", "PENDING"]}})
        if doc.get("capacity") and count >= doc["capacity"]:
            raise HTTPException(status_code=400, detail="Complet : plus de place disponible")
        await db.participations.insert_one({
            "participation_id": new_id("prt"), "user_id": user["user_id"],
            "activity_id": element_id if element_type == "activity" else doc.get("activity_id"),
            "event_id": element_id if element_type == "event" else doc.get("event_id"),
            "role": "PARTICIPANT", "registration_status": "CONFIRMED",
            "registered_at": iso(now_utc()), "attendance_status": "UNKNOWN",
            "comment": None, "validated_by": None, "validated_at": None})
    else:
        await db.participations.delete_one(query)


@router.post("/rsvp")
async def set_rsvp(payload: RsvpIn, user: dict = Depends(active_user)):
    if payload.state not in RSVP_STATES:
        raise HTTPException(status_code=400, detail="État de participation invalide")
    doc = await _load(payload.element_type, payload.element_id)
    await _sync_participation(payload.element_type, payload.element_id, doc, user, payload.state == "PARTICIPE")
    now = iso(now_utc())
    await db.rsvps.update_one(
        {"element_type": payload.element_type, "element_id": payload.element_id, "user_id": user["user_id"]},
        {"$set": {"state": payload.state, "role": user["role"], "updated_at": now},
         "$setOnInsert": {"rsvp_id": new_id("rsvp"),
                          "display_name": await display_name(user["user_id"])}}, upsert=True)
    return {"ok": True, "state": payload.state}


@router.delete("/rsvp")
async def clear_rsvp(element_type: str, element_id: str, user: dict = Depends(active_user)):
    doc = await _load(element_type, element_id)
    await _sync_participation(element_type, element_id, doc, user, False)
    await db.rsvps.delete_one({"element_type": element_type, "element_id": element_id, "user_id": user["user_id"]})
    return {"ok": True}


@router.get("/rsvp/summary")
async def rsvp_summary(element_type: str, element_id: str, user: dict = Depends(active_user)):
    await _load(element_type, element_id)
    can_detail = user["role"] in (ROLE_ADMIN, ROLE_PRO)
    responders = {s: [] for s in RSVP_STATES}
    seen = set()
    my_state = None

    if element_type in ("activity", "event"):
        field = "activity_id" if element_type == "activity" else "event_id"
        async for p in db.participations.find({field: element_id}, {"_id": 0}):
            uid = p["user_id"]
            u = await db.users.find_one({"user_id": uid}, {"_id": 0, "role": 1})
            responders["PARTICIPE"].append({"user_id": uid, "display_name": await display_name(uid),
                                            "role": (u or {}).get("role", "PARTICULIER")})
            seen.add(uid)
            if uid == user["user_id"]:
                my_state = "PARTICIPE"

    async for r in db.rsvps.find({"element_type": element_type, "element_id": element_id}, {"_id": 0}):
        if r["user_id"] in seen:
            if r["user_id"] == user["user_id"] and not my_state:
                my_state = r["state"]
            continue
        responders[r["state"]].append({"user_id": r["user_id"],
                                        "display_name": r.get("display_name") or "Un membre",
                                        "role": r.get("role", "PARTICULIER")})
        if r["user_id"] == user["user_id"]:
            my_state = r["state"]

    counts = {}
    for state, people in responders.items():
        by_role = {"BUREAU": 0, "PRO": 0, "MEMBRE": 0}
        for p in people:
            by_role[_bucket(p["role"])] += 1
        counts[state] = {"total": len(people), "by_role": by_role}

    result = {"counts": counts, "my_state": my_state, "can_detail": can_detail}
    if can_detail:
        result["responders"] = responders
    return result
