"""Prompt 8D Lot B — Fil d'actualité de l'association + mise en avant épinglée."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from deps import db, iso, now_utc, new_id, active_user, require_admin, log_action
from storage import file_meta

router = APIRouter(prefix="/api")

NEWS_CATEGORIES = ["ANNONCE", "ACTIVITE", "MEMBRE", "EVENEMENT", "RESULTAT"]
HIGHLIGHT_TYPES = ["CHIEN_SEMAINE", "REUSSITE"]


class NewsIn(BaseModel):
    title: str = Field(min_length=2, max_length=160)
    body: Optional[str] = Field(default=None, max_length=1000)
    category: str = "ANNONCE"
    publish_at: Optional[str] = None
    pinned: bool = False
    highlight_type: Optional[str] = None
    photo_file_id: Optional[str] = None


class NewsUpdate(BaseModel):
    title: Optional[str] = None
    body: Optional[str] = None
    category: Optional[str] = None
    publish_at: Optional[str] = None
    pinned: Optional[bool] = None
    highlight_type: Optional[str] = None
    photo_file_id: Optional[str] = None


async def _hydrate(item: dict) -> dict:
    if item.get("photo_file_id"):
        item["photo"] = await file_meta(item["photo_file_id"])
    return item


@router.get("/news")
async def list_news(limit: int = Query(20, ge=1, le=50), user: dict = Depends(active_user)):
    now = iso(now_utc())
    q = {"publish_at": {"$lte": now}}
    items = await db.news.find(q, {"_id": 0}).sort("publish_at", -1).to_list(limit)
    for it in items:
        await _hydrate(it)
    highlight = next((it for it in items if it.get("pinned") and it.get("highlight_type")), None)
    return {"items": items, "highlight": highlight}


@router.get("/news/all")
async def list_all_news(admin: dict = Depends(require_admin)):
    """Vue Bureau : inclut les publications programmées à venir."""
    items = await db.news.find({}, {"_id": 0}).sort("publish_at", -1).to_list(100)
    now = iso(now_utc())
    for it in items:
        await _hydrate(it)
        it["scheduled"] = it.get("publish_at", "") > now
    return {"items": items, "categories": NEWS_CATEGORIES, "highlight_types": HIGHLIGHT_TYPES}


@router.post("/news")
async def create_news(payload: NewsIn, admin: dict = Depends(require_admin)):
    if payload.category not in NEWS_CATEGORIES:
        raise HTTPException(status_code=400, detail="Catégorie d'actualité invalide")
    if payload.highlight_type and payload.highlight_type not in HIGHLIGHT_TYPES:
        raise HTTPException(status_code=400, detail="Type de mise en avant invalide")
    now = iso(now_utc())
    pinned = bool(payload.pinned and payload.highlight_type)
    if pinned:
        await db.news.update_many({"pinned": True}, {"$set": {"pinned": False}})
    doc = {"news_id": new_id("news"), "title": payload.title.strip(), "body": (payload.body or "").strip(),
           "category": payload.category, "publish_at": payload.publish_at or now, "pinned": pinned,
           "highlight_type": payload.highlight_type if pinned else None,
           "photo_file_id": payload.photo_file_id, "created_by": admin["user_id"], "created_at": now}
    await db.news.insert_one(dict(doc))
    await log_action(admin, "CREATE", "news", doc["news_id"], new_value={"title": doc["title"]})
    return await _hydrate({k: v for k, v in doc.items() if k != "_id"})


@router.put("/news/{news_id}")
async def update_news(news_id: str, payload: NewsUpdate, admin: dict = Depends(require_admin)):
    item = await db.news.find_one({"news_id": news_id}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Actualité introuvable")
    updates = payload.model_dump(exclude_none=True)
    if updates.get("category") and updates["category"] not in NEWS_CATEGORIES:
        raise HTTPException(status_code=400, detail="Catégorie invalide")
    if updates.get("highlight_type") and updates["highlight_type"] not in HIGHLIGHT_TYPES:
        raise HTTPException(status_code=400, detail="Type de mise en avant invalide")
    if updates.get("pinned"):
        await db.news.update_many({"pinned": True, "news_id": {"$ne": news_id}}, {"$set": {"pinned": False}})
    await db.news.update_one({"news_id": news_id}, {"$set": updates})
    await log_action(admin, "UPDATE", "news", news_id, new_value=updates)
    return await _hydrate({**item, **updates})


@router.delete("/news/{news_id}")
async def delete_news(news_id: str, admin: dict = Depends(require_admin)):
    res = await db.news.delete_one({"news_id": news_id})
    if not res.deleted_count:
        raise HTTPException(status_code=404, detail="Actualité introuvable")
    await log_action(admin, "DELETE", "news", news_id)
    return {"ok": True}
