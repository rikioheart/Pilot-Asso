"""Phase 5 — Blog & contenus, formations & lives, bibliothèque PDF / produits numériques."""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

import rbac
from rbac import ROLE_ADMIN, ROLE_PRO
from deps import (db, iso, now_utc, new_id, active_user, require, require_admin,
                  log_action, notify, notify_bureau, display_name)
from storage import file_meta

router = APIRouter(prefix="/api")

ARTICLE_STATUSES = ["DRAFT", "PENDING_REVIEW", "PUBLISHED", "REJECTED", "ARCHIVED"]
ARTICLE_CATEGORIES = ["CONSEIL", "TEMOIGNAGE", "ACTUALITE", "EDUCATION", "SANTE", "PREVENTION",
                      "COULISSES", "PARTENAIRE", "AUTRE"]
FORMATION_FORMATS = ["FORMATION", "LIVE", "INTERVIEW", "WEBINAIRE", "ATELIER_EN_LIGNE"]
FORMATION_STATUSES = ["DRAFT", "PLANNED", "LIVE", "DONE", "CANCELLED", "ARCHIVED"]
LIBRARY_KINDS = ["PDF", "GUIDE", "FICHE_PRATIQUE", "MODELE", "PRODUIT_NUMERIQUE", "AUDIO", "VIDEO"]
ACCESS_LEVELS = ["MEMBERS", "PROFESSIONALS", "BUREAU", "PUBLIC"]


async def manager_user(user: dict = Depends(active_user)) -> dict:
    profile = await db.profiles.find_one({"user_id": user["user_id"]}, {"_id": 0, "function_badges": 1})
    if not rbac.is_manager(user, profile):
        raise HTTPException(status_code=403, detail="Réservé au Bureau ou à un représentant mandaté")
    return user


async def is_manager(user: dict) -> bool:
    profile = await db.profiles.find_one({"user_id": user["user_id"]}, {"_id": 0, "function_badges": 1})
    return rbac.is_manager(user, profile)


def allowed_access(user: dict) -> List[str]:
    if user["role"] == ROLE_ADMIN:
        return ACCESS_LEVELS
    if user["role"] == ROLE_PRO:
        return ["PROFESSIONALS", "MEMBERS", "PUBLIC"]
    return ["MEMBERS", "PUBLIC"]


# ---------------------------------------------------------------- Blog & contenus
class ArticleIn(BaseModel):
    title: str = Field(min_length=3)
    excerpt: Optional[str] = None
    body: str = ""
    category: str = "AUTRE"
    tags: List[str] = []
    cover_file_id: Optional[str] = None
    access_level: str = "MEMBERS"
    project_id: Optional[str] = None


class ArticleUpdate(BaseModel):
    title: Optional[str] = None
    excerpt: Optional[str] = None
    body: Optional[str] = None
    category: Optional[str] = None
    tags: Optional[List[str]] = None
    cover_file_id: Optional[str] = None
    access_level: Optional[str] = None
    status: Optional[str] = None
    is_pinned: Optional[bool] = None


class ReviewIn(BaseModel):
    decision: str
    comment: Optional[str] = None


@router.get("/content/meta")
async def content_meta(user: dict = Depends(active_user)):
    return {"article_statuses": ARTICLE_STATUSES, "article_categories": ARTICLE_CATEGORIES,
            "formation_formats": FORMATION_FORMATS, "formation_statuses": FORMATION_STATUSES,
            "library_kinds": LIBRARY_KINDS, "access_levels": ACCESS_LEVELS,
            "is_manager": await is_manager(user)}


@router.get("/articles")
async def list_articles(status: Optional[str] = None, category: Optional[str] = None, tag: Optional[str] = None,
                        q: Optional[str] = None, mine: bool = False, limit: int = 100,
                        user: dict = Depends(require("content.view"))):
    manager = await is_manager(user)
    filters = []
    if manager:
        if status:
            filters.append({"status": status})
    elif mine:
        filters.append({"author_id": user["user_id"]})
        if status:
            filters.append({"status": status})
    else:
        filters.append({"status": "PUBLISHED", "access_level": {"$in": allowed_access(user)}})
    if category:
        filters.append({"category": category})
    if tag:
        filters.append({"tags": tag})
    if q:
        filters.append({"$or": [{"title": {"$regex": q, "$options": "i"}},
                                {"excerpt": {"$regex": q, "$options": "i"}}]})
    query = {"$and": filters} if filters else {}
    items = await db.articles.find(query, {"_id": 0, "body": 0}).sort(
        [("is_pinned", -1), ("published_at", -1), ("created_at", -1)]).limit(limit).to_list(limit)
    tags = await db.articles.distinct("tags", {"status": "PUBLISHED"})
    return {"items": items, "total": len(items), "tags": sorted(t for t in tags if t), "is_manager": manager}


@router.post("/articles")
async def create_article(payload: ArticleIn, user: dict = Depends(require("content.create"))):
    if payload.category not in ARTICLE_CATEGORIES:
        raise HTTPException(status_code=400, detail="Catégorie d'article invalide")
    if payload.access_level not in ACCESS_LEVELS:
        raise HTTPException(status_code=400, detail="Niveau d'accès invalide")
    doc = {
        "article_id": new_id("art"), **payload.model_dump(), "status": "DRAFT",
        "author_id": user["user_id"], "author_name": await display_name(user["user_id"]),
        "is_pinned": False, "views": 0, "published_at": None,
        "review_comment": None, "reviewed_by": None,
        "created_at": iso(now_utc()), "updated_at": iso(now_utc()),
    }
    await db.articles.insert_one(doc)
    await log_action(user, "CREATE", "articles", doc["article_id"], new_value={"title": payload.title})
    return {k: v for k, v in doc.items() if k != "_id"}


async def _get_article(article_id: str, user: dict, manager: bool) -> dict:
    article = await db.articles.find_one({"article_id": article_id}, {"_id": 0})
    if not article:
        raise HTTPException(status_code=404, detail="Article introuvable")
    if not manager and article["author_id"] != user["user_id"]:
        if article["status"] != "PUBLISHED" or article["access_level"] not in allowed_access(user):
            raise HTTPException(status_code=403, detail="Cet article ne vous est pas accessible")
    return article


@router.get("/articles/{article_id}")
async def get_article(article_id: str, user: dict = Depends(require("content.view"))):
    manager = await is_manager(user)
    article = await _get_article(article_id, user, manager)
    if article["status"] == "PUBLISHED":
        await db.articles.update_one({"article_id": article_id}, {"$inc": {"views": 1}})
    article["cover"] = await file_meta(article.get("cover_file_id"))
    article["can_edit"] = manager or article["author_id"] == user["user_id"]
    article["can_validate"] = manager
    return article


@router.put("/articles/{article_id}")
async def update_article(article_id: str, payload: ArticleUpdate, user: dict = Depends(require("content.view"))):
    manager = await is_manager(user)
    article = await _get_article(article_id, user, manager)
    is_author = article["author_id"] == user["user_id"]
    if not manager and not is_author:
        raise HTTPException(status_code=403, detail="Vous ne pouvez pas modifier cet article")
    updates = payload.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="Aucune modification fournie")
    if "status" in updates:
        if updates["status"] not in ARTICLE_STATUSES:
            raise HTTPException(status_code=400, detail="Statut d'article invalide")
        if not manager and updates["status"] not in ("DRAFT", "PENDING_REVIEW"):
            raise HTTPException(status_code=403, detail="Seul le Bureau publie ou archive un article")
        if updates["status"] == "PUBLISHED" and not article.get("published_at"):
            updates["published_at"] = iso(now_utc())
    if ("is_pinned" in updates or "access_level" in updates) and not manager:
        raise HTTPException(status_code=403, detail="Seul le Bureau gère la mise en avant et l'accès")
    if not manager and article["status"] == "PUBLISHED":
        raise HTTPException(status_code=403, detail="Un article publié ne peut être modifié que par le Bureau")
    updates["updated_at"] = iso(now_utc())
    await db.articles.update_one({"article_id": article_id}, {"$set": updates})
    await log_action(user, "UPDATE", "articles", article_id,
                     old_value={k: article.get(k) for k in updates}, new_value=updates)
    if updates.get("status") == "PENDING_REVIEW":
        await notify_bureau(type="ARTICLE_TO_REVIEW", title="Article à relire",
                            message=f"{article['author_name']} propose « {article['title']} » à la publication.",
                            level="ACTION", resource_type="article", resource_id=article_id, link="/blog")
    if updates.get("status") == "PUBLISHED" and article["status"] != "PUBLISHED":
        await notify(article["author_id"], type="ARTICLE_PUBLISHED", title="Article publié",
                     message=f"« {article['title']} » est en ligne. Merci pour votre contribution !",
                     level="SUCCESS", resource_type="article", resource_id=article_id, link="/blog")
    return await db.articles.find_one({"article_id": article_id}, {"_id": 0})


@router.post("/articles/{article_id}/review")
async def review_article(article_id: str, payload: ReviewIn, user: dict = Depends(manager_user)):
    article = await db.articles.find_one({"article_id": article_id}, {"_id": 0})
    if not article:
        raise HTTPException(status_code=404, detail="Article introuvable")
    if payload.decision not in ("PUBLISH", "REQUEST_CHANGES", "REJECT"):
        raise HTTPException(status_code=400, detail="Décision invalide")
    if payload.decision == "REQUEST_CHANGES" and not payload.comment:
        raise HTTPException(status_code=400, detail="Merci d'expliquer la modification demandée")
    status = {"PUBLISH": "PUBLISHED", "REQUEST_CHANGES": "DRAFT", "REJECT": "REJECTED"}[payload.decision]
    updates = {"status": status, "review_comment": payload.comment, "reviewed_by": user["user_id"],
               "updated_at": iso(now_utc())}
    if status == "PUBLISHED":
        updates["published_at"] = article.get("published_at") or iso(now_utc())
    await db.articles.update_one({"article_id": article_id}, {"$set": updates})
    await log_action(user, "REVIEW", "articles", article_id, new_value={"status": status})
    titles = {"PUBLISHED": "Article publié", "DRAFT": "Modification demandée", "REJECTED": "Article refusé"}
    await notify(article["author_id"], type="ARTICLE_REVIEWED", title=titles[status],
                 message=payload.comment or f"« {article['title']} » : décision du Bureau enregistrée.",
                 level="SUCCESS" if status == "PUBLISHED" else "WARNING",
                 resource_type="article", resource_id=article_id, link="/blog")
    return await db.articles.find_one({"article_id": article_id}, {"_id": 0})


@router.delete("/articles/{article_id}")
async def archive_article(article_id: str, admin: dict = Depends(require_admin)):
    res = await db.articles.update_one({"article_id": article_id},
                                       {"$set": {"status": "ARCHIVED", "updated_at": iso(now_utc())}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Article introuvable")
    await log_action(admin, "ARCHIVE", "articles", article_id)
    return {"ok": True}


# ---------------------------------------------------------------- Formations & lives
class FormationIn(BaseModel):
    title: str = Field(min_length=3)
    description: Optional[str] = None
    format: str = "FORMATION"
    speaker_name: Optional[str] = None
    speaker_user_id: Optional[str] = None
    date: Optional[str] = None
    start_time: Optional[str] = None
    duration_minutes: Optional[int] = None
    location: Optional[str] = None
    live_link: Optional[str] = None
    capacity: Optional[int] = None
    tags: List[str] = []
    cover_file_id: Optional[str] = None
    access_level: str = "MEMBERS"
    project_id: Optional[str] = None


class FormationUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    format: Optional[str] = None
    speaker_name: Optional[str] = None
    date: Optional[str] = None
    start_time: Optional[str] = None
    duration_minutes: Optional[int] = None
    location: Optional[str] = None
    live_link: Optional[str] = None
    capacity: Optional[int] = None
    tags: Optional[List[str]] = None
    cover_file_id: Optional[str] = None
    access_level: Optional[str] = None
    status: Optional[str] = None
    replay_url: Optional[str] = None
    replay_file_id: Optional[str] = None
    notes: Optional[str] = None


@router.get("/formations")
async def list_formations(format: Optional[str] = None, status: Optional[str] = None,
                          upcoming: bool = False, q: Optional[str] = None, limit: int = 100,
                          user: dict = Depends(require("formations.view"))):
    manager = await is_manager(user)
    filters = []
    if not manager:
        filters.append({"status": {"$in": ["PLANNED", "LIVE", "DONE"]},
                        "access_level": {"$in": allowed_access(user)}})
    if status:
        filters.append({"status": status})
    if format:
        filters.append({"format": format})
    if upcoming:
        filters.append({"date": {"$gte": iso(now_utc())[:10]}})
    if q:
        filters.append({"title": {"$regex": q, "$options": "i"}})
    query = {"$and": filters} if filters else {}
    items = await db.formations.find(query, {"_id": 0}).sort("date", -1).limit(limit).to_list(limit)
    ids = [f["formation_id"] for f in items]
    mine = {r["formation_id"] async for r in db.formation_registrations.find(
        {"user_id": user["user_id"], "formation_id": {"$in": ids}}, {"_id": 0, "formation_id": 1})}
    for f in items:
        f["registered_count"] = await db.formation_registrations.count_documents(
            {"formation_id": f["formation_id"], "status": "CONFIRMED"})
        f["is_registered"] = f["formation_id"] in mine
    return {"items": items, "total": len(items), "is_manager": manager}


@router.post("/formations")
async def create_formation(payload: FormationIn, user: dict = Depends(require("formations.create"))):
    if payload.format not in FORMATION_FORMATS:
        raise HTTPException(status_code=400, detail="Format de session invalide")
    if payload.access_level not in ACCESS_LEVELS:
        raise HTTPException(status_code=400, detail="Niveau d'accès invalide")
    manager = await is_manager(user)
    doc = {
        "formation_id": new_id("frm"), **payload.model_dump(),
        "status": "PLANNED" if manager else "DRAFT",
        "replay_url": None, "replay_file_id": None, "notes": None,
        "created_by": user["user_id"], "created_by_name": await display_name(user["user_id"]),
        "created_at": iso(now_utc()), "updated_at": iso(now_utc()),
    }
    await db.formations.insert_one(doc)
    await log_action(user, "CREATE", "formations", doc["formation_id"], new_value={"title": payload.title})
    if not manager:
        await notify_bureau(type="FORMATION_PROPOSED", title="Nouvelle session proposée",
                            message=f"{doc['created_by_name']} propose « {payload.title} ».", level="ACTION",
                            resource_type="formation", resource_id=doc["formation_id"], link="/formations")
    return {k: v for k, v in doc.items() if k != "_id"}


@router.put("/formations/{formation_id}")
async def update_formation(formation_id: str, payload: FormationUpdate,
                           user: dict = Depends(require("formations.view"))):
    formation = await db.formations.find_one({"formation_id": formation_id}, {"_id": 0})
    if not formation:
        raise HTTPException(status_code=404, detail="Session introuvable")
    manager = await is_manager(user)
    if not manager and formation["created_by"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Vous ne gérez pas cette session")
    updates = payload.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="Aucune modification fournie")
    if "status" in updates:
        if updates["status"] not in FORMATION_STATUSES:
            raise HTTPException(status_code=400, detail="Statut de session invalide")
        if not manager:
            raise HTTPException(status_code=403, detail="Seul le Bureau change le statut d'une session")
    if "access_level" in updates and not manager:
        raise HTTPException(status_code=403, detail="Seul le Bureau modifie le niveau d'accès")
    updates["updated_at"] = iso(now_utc())
    await db.formations.update_one({"formation_id": formation_id}, {"$set": updates})
    await log_action(user, "UPDATE", "formations", formation_id, new_value=updates)
    if "replay_url" in updates or "replay_file_id" in updates:
        async for r in db.formation_registrations.find({"formation_id": formation_id}, {"_id": 0, "user_id": 1}):
            await notify(r["user_id"], type="REPLAY_AVAILABLE", title="Replay disponible",
                         message=f"Le replay de « {formation['title']} » est en ligne.", level="SUCCESS",
                         resource_type="formation", resource_id=formation_id, link="/formations")
    return await db.formations.find_one({"formation_id": formation_id}, {"_id": 0})


@router.post("/formations/{formation_id}/register")
async def register_formation(formation_id: str, user: dict = Depends(require("formations.view"))):
    formation = await db.formations.find_one({"formation_id": formation_id}, {"_id": 0})
    if not formation:
        raise HTTPException(status_code=404, detail="Session introuvable")
    if formation["status"] not in ("PLANNED", "LIVE"):
        raise HTTPException(status_code=400, detail="Les inscriptions ne sont pas ouvertes")
    if formation["access_level"] not in allowed_access(user) and user["role"] != ROLE_ADMIN:
        raise HTTPException(status_code=403, detail="Cette session ne vous est pas accessible")
    if await db.formation_registrations.find_one({"formation_id": formation_id, "user_id": user["user_id"]}):
        raise HTTPException(status_code=400, detail="Vous êtes déjà inscrit à cette session")
    count = await db.formation_registrations.count_documents({"formation_id": formation_id, "status": "CONFIRMED"})
    if formation.get("capacity") and count >= formation["capacity"]:
        raise HTTPException(status_code=400, detail="Cette session est complète")
    doc = {"registration_id": new_id("frg"), "formation_id": formation_id, "user_id": user["user_id"],
           "user_name": await display_name(user["user_id"]), "status": "CONFIRMED", "attended": None,
           "replay_watched": False, "registered_at": iso(now_utc())}
    await db.formation_registrations.insert_one(doc)
    await log_action(user, "REGISTER", "formations", formation_id)
    await notify(user["user_id"], type="REGISTRATION_CONFIRMED", title="Inscription confirmée",
                 message=f"Vous êtes inscrit à « {formation['title']} ».", level="SUCCESS",
                 resource_type="formation", resource_id=formation_id, link="/formations")
    return {k: v for k, v in doc.items() if k != "_id"}


@router.delete("/formations/{formation_id}/register")
async def unregister_formation(formation_id: str, user: dict = Depends(require("formations.view"))):
    res = await db.formation_registrations.delete_one({"formation_id": formation_id, "user_id": user["user_id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Vous n'êtes pas inscrit à cette session")
    return {"ok": True}


@router.get("/formations/{formation_id}/registrations")
async def formation_registrations(formation_id: str, user: dict = Depends(manager_user)):
    items = await db.formation_registrations.find({"formation_id": formation_id}, {"_id": 0}).to_list(500)
    return {"items": items, "total": len(items)}


@router.post("/formations/{formation_id}/attendance")
async def formation_attendance(formation_id: str, body: dict, user: dict = Depends(manager_user)):
    if body.get("attended") is None or not body.get("user_id"):
        raise HTTPException(status_code=400, detail="Participant ou présence manquant")
    res = await db.formation_registrations.update_one(
        {"formation_id": formation_id, "user_id": body["user_id"]},
        {"$set": {"attended": bool(body["attended"]), "validated_by": user["user_id"]}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Inscription introuvable")
    await log_action(user, "ATTENDANCE", "formations", formation_id, new_value=body)
    return {"ok": True}


# ---------------------------------------------------------------- Bibliothèque PDF / produits numériques
class LibraryIn(BaseModel):
    title: str = Field(min_length=2)
    description: Optional[str] = None
    kind: str = "PDF"
    content_type: str = "FILE"
    file_id: Optional[str] = None
    external_url: Optional[str] = None
    external_platform: Optional[str] = None
    cover_file_id: Optional[str] = None
    tags: List[str] = []
    access_level: str = "MEMBERS"
    public_price: Optional[float] = None
    member_price: Optional[float] = None
    author_credit: Optional[str] = None


class LibraryUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    kind: Optional[str] = None
    content_type: Optional[str] = None
    file_id: Optional[str] = None
    external_url: Optional[str] = None
    external_platform: Optional[str] = None
    cover_file_id: Optional[str] = None
    tags: Optional[List[str]] = None
    access_level: Optional[str] = None
    public_price: Optional[float] = None
    member_price: Optional[float] = None
    author_credit: Optional[str] = None
    status: Optional[str] = None


@router.get("/library")
async def list_library(kind: Optional[str] = None, tag: Optional[str] = None, q: Optional[str] = None,
                       limit: int = 100, user: dict = Depends(require("library.view"))):
    manager = await is_manager(user)
    filters = [] if manager else [{"status": "ACTIVE", "access_level": {"$in": allowed_access(user)}}]
    if kind:
        filters.append({"kind": kind})
    if tag:
        filters.append({"tags": tag})
    if q:
        filters.append({"title": {"$regex": q, "$options": "i"}})
    query = {"$and": filters} if filters else {}
    items = await db.library_items.find(query, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
    for item in items:
        item["file"] = await file_meta(item.get("file_id"))
    tags = await db.library_items.distinct("tags", {"status": "ACTIVE"})
    return {"items": items, "total": len(items), "tags": sorted(t for t in tags if t), "is_manager": manager}


@router.post("/library")
async def create_library_item(payload: LibraryIn, user: dict = Depends(require("library.upload"))):
    if payload.kind not in LIBRARY_KINDS:
        raise HTTPException(status_code=400, detail="Type de ressource invalide")
    if payload.access_level not in ACCESS_LEVELS:
        raise HTTPException(status_code=400, detail="Niveau d'accès invalide")
    if payload.content_type not in ("FILE", "EXTERNAL_LINK"):
        raise HTTPException(status_code=400, detail="Type de contenu invalide")
    if payload.content_type == "FILE":
        if not await file_meta(payload.file_id):
            raise HTTPException(status_code=400, detail="Fichier introuvable : envoyez d'abord le document")
    elif not (payload.external_url or "").startswith("http"):
        raise HTTPException(status_code=400,
                            detail="Indiquez le lien externe (YouTube privé, Zoom, Meet…) pour ce contenu")
    manager = await is_manager(user)
    doc = {
        "item_id": new_id("lib"), **payload.model_dump(),
        "status": "ACTIVE" if manager else "PENDING_REVIEW",
        "download_count": 0, "created_by": user["user_id"],
        "created_by_name": await display_name(user["user_id"]),
        "created_at": iso(now_utc()), "updated_at": iso(now_utc()),
    }
    await db.library_items.insert_one(doc)
    await log_action(user, "CREATE", "library", doc["item_id"], new_value={"title": payload.title})
    if not manager:
        await notify_bureau(type="LIBRARY_TO_REVIEW", title="Nouvelle ressource à valider",
                            message=f"{doc['created_by_name']} a déposé « {payload.title} ».", level="ACTION",
                            resource_type="library", resource_id=doc["item_id"], link="/library")
    return {k: v for k, v in doc.items() if k != "_id"}


@router.put("/library/{item_id}")
async def update_library_item(item_id: str, payload: LibraryUpdate, user: dict = Depends(require("library.view"))):
    item = await db.library_items.find_one({"item_id": item_id}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Ressource introuvable")
    manager = await is_manager(user)
    if not manager and item["created_by"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Vous ne gérez pas cette ressource")
    updates = payload.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="Aucune modification fournie")
    if ("status" in updates or "access_level" in updates) and not manager:
        raise HTTPException(status_code=403, detail="Seul le Bureau gère le statut et l'accès")
    if "status" in updates and updates["status"] not in ("ACTIVE", "PENDING_REVIEW", "ARCHIVED"):
        raise HTTPException(status_code=400, detail="Statut invalide")
    updates["updated_at"] = iso(now_utc())
    await db.library_items.update_one({"item_id": item_id}, {"$set": updates})
    await log_action(user, "UPDATE", "library", item_id, new_value=updates)
    return await db.library_items.find_one({"item_id": item_id}, {"_id": 0})


@router.post("/library/{item_id}/download")
async def register_download(item_id: str, user: dict = Depends(require("library.view"))):
    item = await db.library_items.find_one({"item_id": item_id}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Ressource introuvable")
    manager = await is_manager(user)
    if not manager and (item["status"] != "ACTIVE" or item["access_level"] not in allowed_access(user)):
        raise HTTPException(status_code=403, detail="Cette ressource ne vous est pas accessible")
    await db.library_items.update_one({"item_id": item_id}, {"$inc": {"download_count": 1}})
    await db.library_downloads.insert_one({
        "download_id": new_id("dwl"), "item_id": item_id, "item_title": item["title"],
        "user_id": user["user_id"], "user_name": await display_name(user["user_id"]),
        "action": "DOWNLOAD" if item.get("content_type", "FILE") == "FILE" else "OPEN_LINK",
        "created_at": iso(now_utc())})
    return {"file_id": item.get("file_id"), "external_url": item.get("external_url"),
            "download_count": item["download_count"] + 1}


@router.post("/library/{item_id}/view")
async def trace_view(item_id: str, user: dict = Depends(require("library.view"))):
    item = await db.library_items.find_one({"item_id": item_id}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Ressource introuvable")
    if not await is_manager(user) and (item["status"] != "ACTIVE"
                                       or item["access_level"] not in allowed_access(user)):
        raise HTTPException(status_code=403, detail="Cette ressource ne vous est pas accessible")
    await db.library_downloads.insert_one({
        "download_id": new_id("dwl"), "item_id": item_id, "item_title": item["title"],
        "user_id": user["user_id"], "user_name": await display_name(user["user_id"]),
        "action": "VIEW", "created_at": iso(now_utc())})
    return {"ok": True}


@router.get("/library/access-log")
async def library_access_log(item_id: Optional[str] = None, limit: int = 300,
                             user: dict = Depends(manager_user)):
    query = {"item_id": item_id} if item_id else {}
    items = await db.library_downloads.find(query, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
    return {"items": items, "total": len(items)}


@router.delete("/library/{item_id}")
async def archive_library_item(item_id: str, admin: dict = Depends(require_admin)):
    res = await db.library_items.update_one({"item_id": item_id},
                                            {"$set": {"status": "ARCHIVED", "updated_at": iso(now_utc())}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Ressource introuvable")
    await log_action(admin, "ARCHIVE", "library", item_id)
    return {"ok": True}
