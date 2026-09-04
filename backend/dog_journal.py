"""Prompt 8D Lot A — Carnet de suivi du chien (modèle configurable, jauges, photos)."""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from deps import db, iso, now_utc, new_id, active_user, notify, display_name
from dogs import dog_access
from settings_api import get_setting, DEFAULT_DOG_JOURNAL_TEMPLATE
from storage import file_meta

router = APIRouter(prefix="/api")


class ToggleIn(BaseModel):
    enabled: bool


class OwnerSectionsIn(BaseModel):
    owner_write_sections: List[str]


class EntryIn(BaseModel):
    text: Optional[str] = None
    label: Optional[str] = None
    target: Optional[int] = None
    file_id: Optional[str] = None
    caption: Optional[str] = None


class ProgressIn(BaseModel):
    done: Optional[int] = None
    delta: Optional[int] = None


async def _template():
    return await get_setting("dog_journal_template", DEFAULT_DOG_JOURNAL_TEMPLATE)


async def _ensure_journal(dog_id: str) -> dict:
    j = await db.dog_journals.find_one({"dog_id": dog_id}, {"_id": 0})
    if not j:
        j = {"dog_id": dog_id, "enabled_by_owner": False, "enabled_by_bureau": False,
             "owner_write_sections": [], "entries": {},
             "created_at": iso(now_utc()), "updated_at": iso(now_utc())}
        await db.dog_journals.insert_one(dict(j))
    return j


def _section(template: dict, section_id: str):
    return next((s for s in template["sections"] if s["section_id"] == section_id), None)


async def _hydrate_photos(entries: dict):
    for items in (entries or {}).values():
        for it in items or []:
            if it.get("file_id"):
                it["file"] = await file_meta(it["file_id"])


async def _assert_can_write(j: dict, section_id: str, owner, team, manager) -> None:
    if manager or team:
        if not j["enabled_by_bureau"]:
            raise HTTPException(status_code=400, detail="Activez le carnet côté Bureau pour le remplir")
        return
    if not (j["enabled_by_owner"] and j["enabled_by_bureau"]):
        raise HTTPException(status_code=400, detail="Le carnet n'est pas activé pour ce chien")
    if owner and section_id in (j.get("owner_write_sections") or []):
        return
    raise HTTPException(status_code=403, detail="Vous ne pouvez pas écrire dans cette section")


@router.get("/dogs/{dog_id}/journal")
async def get_journal(dog_id: str, user: dict = Depends(active_user)):
    dog, owner, team, manager = await dog_access(dog_id, user)
    template = await _template()
    j = await _ensure_journal(dog_id)
    entries = j.get("entries") or {}
    await _hydrate_photos(entries)
    active = j["enabled_by_owner"] and j["enabled_by_bureau"]
    return {"template": template, "is_owner": owner, "can_write_all": manager or team, "is_manager": manager,
            "active": active,
            "journal": {"enabled_by_owner": j["enabled_by_owner"], "enabled_by_bureau": j["enabled_by_bureau"],
                        "active": active, "owner_write_sections": j.get("owner_write_sections") or [],
                        "entries": entries}}


@router.put("/dogs/{dog_id}/journal/enable")
async def toggle_enable(dog_id: str, payload: ToggleIn, user: dict = Depends(active_user)):
    dog, owner, team, manager = await dog_access(dog_id, user)
    if manager:
        field = "enabled_by_bureau"
    elif owner:
        field = "enabled_by_owner"
    else:
        raise HTTPException(status_code=403, detail="Seuls le propriétaire et le Bureau activent le carnet")
    await _ensure_journal(dog_id)
    await db.dog_journals.update_one({"dog_id": dog_id},
                                     {"$set": {field: payload.enabled, "updated_at": iso(now_utc())}})
    return {"ok": True, field: payload.enabled}


@router.put("/dogs/{dog_id}/journal/owner-sections")
async def set_owner_sections(dog_id: str, payload: OwnerSectionsIn, user: dict = Depends(active_user)):
    dog, owner, team, manager = await dog_access(dog_id, user)
    if not manager:
        raise HTTPException(status_code=403, detail="Réservé au Bureau")
    template = await _template()
    valid = {s["section_id"] for s in template["sections"]}
    secs = [s for s in payload.owner_write_sections if s in valid]
    await _ensure_journal(dog_id)
    await db.dog_journals.update_one({"dog_id": dog_id},
                                     {"$set": {"owner_write_sections": secs, "updated_at": iso(now_utc())}})
    return {"owner_write_sections": secs}


@router.post("/dogs/{dog_id}/journal/sections/{section_id}/entries")
async def add_entry(dog_id: str, section_id: str, payload: EntryIn, user: dict = Depends(active_user)):
    dog, owner, team, manager = await dog_access(dog_id, user)
    template = await _template()
    section = _section(template, section_id)
    if not section:
        raise HTTPException(status_code=404, detail="Section introuvable")
    j = await _ensure_journal(dog_id)
    await _assert_can_write(j, section_id, owner, team, manager)
    now = iso(now_utc())
    entry = {"entry_id": new_id("jen"), "author_id": user["user_id"],
             "author_name": await display_name(user["user_id"]), "author_role": user["role"],
             "by_owner": bool(owner and not (manager or team)), "created_at": now}
    if section["kind"] == "OBJECTIVES":
        if not payload.label:
            raise HTTPException(status_code=400, detail="Libellé de l'objectif requis")
        entry.update({"label": payload.label[:120], "target": max(int(payload.target or 1), 1), "done": 0})
    elif section["kind"] == "PHOTOS":
        if not payload.file_id:
            raise HTTPException(status_code=400, detail="Photo requise")
        entry.update({"file_id": payload.file_id, "caption": (payload.caption or "")[:200]})
    else:
        if not payload.text:
            raise HTTPException(status_code=400, detail="Texte requis")
        entry.update({"text": payload.text[:4000]})
    await db.dog_journals.update_one({"dog_id": dog_id},
                                     {"$push": {f"entries.{section_id}": entry}, "$set": {"updated_at": now}})
    if (manager or team) and dog.get("owner_id"):
        await notify(dog["owner_id"], type="DOG_JOURNAL", title=f"Carnet de {dog['name']} mis à jour",
                     message=f"Nouvelle entrée dans « {section['label']} ».", level="INFO",
                     resource_type="dog", resource_id=dog_id, link="/dogs")
    if entry.get("file_id"):
        entry["file"] = await file_meta(entry["file_id"])
    return entry


@router.delete("/dogs/{dog_id}/journal/sections/{section_id}/entries/{entry_id}")
async def delete_entry(dog_id: str, section_id: str, entry_id: str, user: dict = Depends(active_user)):
    dog, owner, team, manager = await dog_access(dog_id, user)
    j = await _ensure_journal(dog_id)
    items = (j.get("entries") or {}).get(section_id) or []
    target = next((it for it in items if it.get("entry_id") == entry_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="Entrée introuvable")
    if not (manager or team or (owner and target.get("by_owner"))):
        raise HTTPException(status_code=403, detail="Suppression non autorisée")
    await db.dog_journals.update_one({"dog_id": dog_id},
                                     {"$pull": {f"entries.{section_id}": {"entry_id": entry_id}},
                                      "$set": {"updated_at": iso(now_utc())}})
    return {"ok": True}


@router.put("/dogs/{dog_id}/journal/sections/{section_id}/objectives/{entry_id}/progress")
async def objective_progress(dog_id: str, section_id: str, entry_id: str, payload: ProgressIn,
                             user: dict = Depends(active_user)):
    dog, owner, team, manager = await dog_access(dog_id, user)
    if not (manager or team):
        raise HTTPException(status_code=403, detail="Seuls le Bureau et les professionnels valident les séances")
    j = await _ensure_journal(dog_id)
    items = (j.get("entries") or {}).get(section_id) or []
    obj = next((it for it in items if it.get("entry_id") == entry_id), None)
    if not obj:
        raise HTTPException(status_code=404, detail="Objectif introuvable")
    target = obj.get("target") or 1
    done = obj.get("done") or 0
    if payload.done is not None:
        done = payload.done
    elif payload.delta is not None:
        done = done + payload.delta
    done = max(0, min(done, target))
    await db.dog_journals.update_one({"dog_id": dog_id, f"entries.{section_id}.entry_id": entry_id},
                                     {"$set": {f"entries.{section_id}.$.done": done,
                                               "updated_at": iso(now_utc())}})
    return {"entry_id": entry_id, "done": done, "target": target}
