"""Prompt 8C — Commentaires unifiés sur les tâches, événements et activités."""
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from rbac import ROLE_ADMIN, ROLE_PRO
from deps import db, iso, now_utc, new_id, active_user, log_action, notify, display_name

router = APIRouter(prefix="/api")

ELEMENT_COLLECTIONS = {
    "task": ("tasks", "task_id"),
    "event": ("events", "event_id"),
    "activity": ("activities", "activity_id"),
}
COMMENT_VISIBILITIES = ["TOUS", "PROS_BUREAU"]


class CommentIn(BaseModel):
    element_type: str
    element_id: str
    text: str = Field(min_length=1, max_length=4000)
    visibility: str = "TOUS"
    mentions: List[str] = []


async def _load_element(element_type: str, element_id: str) -> dict:
    if element_type not in ELEMENT_COLLECTIONS:
        raise HTTPException(status_code=400, detail="Type d'élément non pris en charge")
    coll, key = ELEMENT_COLLECTIONS[element_type]
    doc = await db[coll].find_one({key: element_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Élément introuvable")
    return doc


def _element_link(element_type: str, element: dict, element_id: str) -> str:
    if element_type == "task":
        return f"/projects/{element.get('project_id')}"
    if element_type == "event":
        return f"/events/{element_id}"
    return "/activities"


def _is_pro_or_bureau(user: dict) -> bool:
    return user["role"] in (ROLE_ADMIN, ROLE_PRO)


def _can_see_comment(user: dict, c: dict) -> bool:
    if c.get("visibility") == "PROS_BUREAU":
        return (_is_pro_or_bureau(user) or c["author_id"] == user["user_id"]
                or user["user_id"] in (c.get("mentions") or []))
    return True


@router.get("/comments/mentionable")
async def mentionable(element_type: str, element_id: str, user: dict = Depends(active_user)):
    """Personnes que l'on peut mentionner : participants, organisateurs, équipe projet."""
    element = await _load_element(element_type, element_id)
    ids = set()
    if element_type in ("event", "activity"):
        field = "event_id" if element_type == "event" else "activity_id"
        async for p in db.participations.find({field: element_id}, {"_id": 0, "user_id": 1}):
            ids.add(p["user_id"])
        ids.add(element.get("organizer_id"))
        ids.add(element.get("created_by"))
        for pid in element.get("professional_ids") or []:
            ids.add(pid)
    else:
        ids.add(element.get("created_by"))
        ids.add(element.get("assigned_user_id"))
        async for t in db.project_teams.find({"project_id": element.get("project_id")},
                                             {"_id": 0, "user_id": 1}):
            ids.add(t["user_id"])
    ids.discard(None)
    ids.discard(user["user_id"])
    out = [{"user_id": uid, "display_name": await display_name(uid)} for uid in ids]
    out.sort(key=lambda x: x["display_name"].lower())
    return {"items": out}


@router.get("/comments")
async def list_comments(element_type: str, element_id: str,
                        skip: int = 0, limit: int = Query(20, ge=1, le=100),
                        user: dict = Depends(active_user)):
    await _load_element(element_type, element_id)
    q = {"element_type": element_type, "element_id": element_id, "deleted": {"$ne": True}}
    raw = await db.comments.find(q, {"_id": 0}).sort("created_at", 1).to_list(1000)
    visible = [c for c in raw if _can_see_comment(user, c)]
    return {"items": visible[skip:skip + limit], "total": len(visible),
            "can_moderate": user["role"] == ROLE_ADMIN}


@router.post("/comments")
async def create_comment(payload: CommentIn, user: dict = Depends(active_user)):
    element = await _load_element(payload.element_type, payload.element_id)
    if payload.visibility not in COMMENT_VISIBILITIES:
        raise HTTPException(status_code=400, detail="Visibilité invalide")
    if payload.visibility == "PROS_BUREAU" and not _is_pro_or_bureau(user):
        raise HTTPException(status_code=403, detail="Visibilité réservée aux professionnels et au Bureau")
    doc = {
        "comment_id": new_id("cmt"),
        "element_type": payload.element_type, "element_id": payload.element_id,
        "author_id": user["user_id"], "author_name": await display_name(user["user_id"]),
        "author_role": user["role"], "text": payload.text.strip(), "visibility": payload.visibility,
        "mentions": list(dict.fromkeys(payload.mentions or [])),
        "deleted": False, "created_at": iso(now_utc()),
    }
    await db.comments.insert_one(doc)
    link = _element_link(payload.element_type, element, payload.element_id)
    title_el = element.get("title") or "un élément"
    for uid in doc["mentions"]:
        if uid == user["user_id"]:
            continue
        await notify(uid, type="COMMENT_MENTION", title=f"{doc['author_name']} vous a mentionné",
                     message=f"« {title_el} » : {doc['text'][:140]}", level="ACTION",
                     resource_type=payload.element_type, resource_id=payload.element_id, link=link)
    await log_action(user, "COMMENT", "comments", doc["comment_id"],
                     new_value={"element": f"{payload.element_type}:{payload.element_id}"})
    return {k: v for k, v in doc.items() if k != "_id"}


@router.delete("/comments/{comment_id}")
async def delete_comment(comment_id: str, user: dict = Depends(active_user)):
    c = await db.comments.find_one({"comment_id": comment_id}, {"_id": 0})
    if not c or c.get("deleted"):
        raise HTTPException(status_code=404, detail="Commentaire introuvable")
    if user["role"] != ROLE_ADMIN and c["author_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Vous ne pouvez pas supprimer ce commentaire")
    await db.comments.update_one({"comment_id": comment_id},
                                 {"$set": {"deleted": True, "deleted_at": iso(now_utc())}})
    await log_action(user, "DELETE", "comments", comment_id)
    return {"ok": True}
