"""Prompt 3 — Lot A : archivage récupérable et suppression définitive tracés."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from deps import db, iso, now_utc, active_user, require_admin, log_action
from content import is_manager

router = APIRouter(prefix="/api")

ENTITIES = {
    "activities": {"collection": "activities", "id_field": "activity_id", "title_field": "title",
                   "label": "Activité", "archived": "ARCHIVED", "restored": "PLANNED"},
    "events": {"collection": "events", "id_field": "event_id", "title_field": "title",
               "label": "Événement", "archived": "ARCHIVED", "restored": "PLANNED"},
    "partners": {"collection": "partners", "id_field": "partner_id", "title_field": "name",
                 "label": "Partenaire", "archived": "ARCHIVE", "restored": "DISCUSSION"},
    "advantages": {"collection": "advantages", "id_field": "advantage_id", "title_field": "title",
                   "label": "Avantage", "archived": "ARCHIVED", "restored": "ACTIVE"},
    "terrains": {"collection": "terrains", "id_field": "terrain_id", "title_field": "name",
                 "label": "Terrain", "archived": "ARCHIVE", "restored": "DISPONIBLE"},
}


class ReasonIn(BaseModel):
    reason: str = Field(min_length=3)
    confirm_label: Optional[str] = None


def spec(entity: str) -> dict:
    if entity not in ENTITIES:
        raise HTTPException(status_code=400, detail="Type d'élément inconnu")
    return ENTITIES[entity]


async def fetch(entity: str, record_id: str) -> dict:
    conf = spec(entity)
    doc = await db[conf["collection"]].find_one({conf["id_field"]: record_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail=f"{conf['label']} introuvable")
    return doc


@router.get("/records/{entity}")
async def list_records(entity: str, archived: bool = False, user: dict = Depends(active_user)):
    if not await is_manager(user):
        raise HTTPException(status_code=403, detail="Réservé au Bureau")
    conf = spec(entity)
    query = {"status": conf["archived"]} if archived else {"status": {"$ne": conf["archived"]}}
    items = await db[conf["collection"]].find(query, {"_id": 0}).sort("updated_at", -1).to_list(200)
    return {"items": [{"id": i[conf["id_field"]], "title": i.get(conf["title_field"]),
                       "status": i.get("status"), "archive_reason": i.get("archive_reason")}
                      for i in items],
            "total": len(items), "label": conf["label"]}


@router.post("/records/{entity}/{record_id}/archive")
async def archive_record(entity: str, record_id: str, payload: ReasonIn,
                         admin: dict = Depends(require_admin)):
    conf = spec(entity)
    doc = await fetch(entity, record_id)
    await db[conf["collection"]].update_one(
        {conf["id_field"]: record_id},
        {"$set": {"status": conf["archived"], "archive_reason": payload.reason,
                  "archived_by": admin["user_id"], "archived_at": iso(now_utc()),
                  "previous_status": doc.get("status"), "updated_at": iso(now_utc())}})
    await log_action(admin, "ARCHIVE", entity, record_id,
                     old_value={"status": doc.get("status"), "titre": doc.get(conf["title_field"])},
                     new_value={"status": conf["archived"], "motif": payload.reason})
    return {"ok": True, "status": conf["archived"], "message": f"{conf['label']} archivé(e), récupérable."}


@router.post("/records/{entity}/{record_id}/restore")
async def restore_record(entity: str, record_id: str, admin: dict = Depends(require_admin)):
    conf = spec(entity)
    doc = await fetch(entity, record_id)
    if doc.get("status") != conf["archived"]:
        raise HTTPException(status_code=400, detail=f"Ce{'t' if entity == 'events' else ''} "
                                                    f"{conf['label'].lower()} n'est pas archivé(e)")
    target = doc.get("previous_status") or conf["restored"]
    if target == conf["archived"]:
        target = conf["restored"]
    await db[conf["collection"]].update_one(
        {conf["id_field"]: record_id},
        {"$set": {"status": target, "updated_at": iso(now_utc())},
         "$unset": {"archive_reason": "", "archived_by": "", "archived_at": ""}})
    await log_action(admin, "RESTORE", entity, record_id, new_value={"status": target})
    return {"ok": True, "status": target, "message": f"{conf['label']} restauré(e)."}


@router.delete("/records/{entity}/{record_id}")
async def delete_record(entity: str, record_id: str, reason: str,
                        admin: dict = Depends(require_admin)):
    if len(reason or "") < 3:
        raise HTTPException(status_code=400, detail="Merci d'indiquer le motif de la suppression définitive")
    conf = spec(entity)
    doc = await fetch(entity, record_id)
    await db[conf["collection"]].delete_one({conf["id_field"]: record_id})
    await log_action(admin, "DELETE", entity, record_id,
                     old_value={"titre": doc.get(conf["title_field"]), "status": doc.get("status")},
                     new_value={"motif": reason, "definitif": True})
    return {"ok": True, "message": f"{conf['label']} supprimé(e) définitivement."}
