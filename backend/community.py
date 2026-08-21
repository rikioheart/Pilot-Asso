"""Phase 5 — Réseaux sociaux (planification), jeux-concours, calendrier de l'Avent, fil d'actualité."""
import random
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

import rbac
from rbac import ROLE_ADMIN, ROLE_PRO
from deps import (db, iso, now_utc, new_id, active_user, require, require_admin,
                  log_action, notify, notify_bureau, display_name)
from content import manager_user, is_manager, allowed_access

router = APIRouter(prefix="/api")

NETWORKS = ["FACEBOOK", "INSTAGRAM", "TIKTOK", "YOUTUBE", "LINKEDIN", "X", "NEWSLETTER"]
POST_STATUSES = ["IDEA", "DRAFT", "TO_VALIDATE", "SCHEDULED", "PUBLISHED", "CANCELLED"]
CONTEST_STATUSES = ["DRAFT", "OPEN", "CLOSED", "DRAWN", "ARCHIVED"]
BOX_KINDS = ["MESSAGE", "ASTUCE", "CADEAU", "CODE_PROMO", "LIEN", "MINI_JEU"]


# ---------------------------------------------------------------- Réseaux sociaux (planification)
class PostIn(BaseModel):
    title: str = Field(min_length=2)
    content: str = ""
    networks: List[str] = []
    hashtags: List[str] = []
    scheduled_date: Optional[str] = None
    scheduled_time: Optional[str] = None
    media_file_ids: List[str] = []
    article_id: Optional[str] = None
    project_id: Optional[str] = None
    task_id: Optional[str] = None
    assigned_user_id: Optional[str] = None
    notes: Optional[str] = None


class PostUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    networks: Optional[List[str]] = None
    hashtags: Optional[List[str]] = None
    scheduled_date: Optional[str] = None
    scheduled_time: Optional[str] = None
    media_file_ids: Optional[List[str]] = None
    article_id: Optional[str] = None
    task_id: Optional[str] = None
    assigned_user_id: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = None


@router.get("/social/meta")
async def social_meta(user: dict = Depends(require("social.view"))):
    return {"networks": NETWORKS, "statuses": POST_STATUSES, "is_manager": await is_manager(user)}


@router.get("/social/posts")
async def list_posts(status: Optional[str] = None, network: Optional[str] = None, limit: int = 200,
                     user: dict = Depends(require("social.view"))):
    filters = []
    if status:
        filters.append({"status": status})
    if network:
        filters.append({"networks": network})
    query = {"$and": filters} if filters else {}
    items = await db.social_posts.find(query, {"_id": 0}).sort(
        [("scheduled_date", 1), ("created_at", -1)]).limit(limit).to_list(limit)
    return {"items": items, "total": len(items), "is_manager": await is_manager(user)}


@router.post("/social/posts")
async def create_post(payload: PostIn, user: dict = Depends(require("social.manage"))):
    bad = [n for n in payload.networks if n not in NETWORKS]
    if bad:
        raise HTTPException(status_code=400, detail=f"Réseau inconnu : {', '.join(bad)}")
    doc = {
        "post_id": new_id("pst"), **payload.model_dump(), "status": "DRAFT",
        "published_at": None, "reminder_sent": False,
        "created_by": user["user_id"], "created_by_name": await display_name(user["user_id"]),
        "created_at": iso(now_utc()), "updated_at": iso(now_utc()),
    }
    await db.social_posts.insert_one(doc)
    await log_action(user, "CREATE", "social", doc["post_id"], new_value={"title": payload.title})
    if payload.task_id:
        await db.tasks.update_one({"task_id": payload.task_id}, {"$set": {"social_post_id": doc["post_id"]}})
    if payload.assigned_user_id and payload.assigned_user_id != user["user_id"]:
        await notify(payload.assigned_user_id, type="SOCIAL_ASSIGNED", title="Publication à préparer",
                     message=f"« {payload.title} » vous est confiée.", level="ACTION",
                     resource_type="social_post", resource_id=doc["post_id"], link="/social")
    return {k: v for k, v in doc.items() if k != "_id"}


@router.put("/social/posts/{post_id}")
async def update_post(post_id: str, payload: PostUpdate, user: dict = Depends(require("social.manage"))):
    post = await db.social_posts.find_one({"post_id": post_id}, {"_id": 0})
    if not post:
        raise HTTPException(status_code=404, detail="Publication introuvable")
    updates = payload.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="Aucune modification fournie")
    if "status" in updates:
        if updates["status"] not in POST_STATUSES:
            raise HTTPException(status_code=400, detail="Statut de publication invalide")
        if updates["status"] == "SCHEDULED" and not (updates.get("scheduled_date") or post.get("scheduled_date")):
            raise HTTPException(status_code=400, detail="Indiquez une date de publication prévue")
        if updates["status"] == "PUBLISHED":
            updates["published_at"] = iso(now_utc())
    if "networks" in updates:
        bad = [n for n in updates["networks"] if n not in NETWORKS]
        if bad:
            raise HTTPException(status_code=400, detail=f"Réseau inconnu : {', '.join(bad)}")
    updates["updated_at"] = iso(now_utc())
    await db.social_posts.update_one({"post_id": post_id}, {"$set": updates})
    await log_action(user, "UPDATE", "social", post_id, new_value=updates)
    if updates.get("status") == "TO_VALIDATE":
        await notify_bureau(type="SOCIAL_TO_VALIDATE", title="Publication à valider",
                            message=f"« {post['title']} » attend le feu vert du Bureau.", level="ACTION",
                            resource_type="social_post", resource_id=post_id, link="/social")
    return await db.social_posts.find_one({"post_id": post_id}, {"_id": 0})


@router.post("/social/posts/{post_id}/task")
async def create_task_from_post(post_id: str, body: dict, user: dict = Depends(require("social.manage"))):
    post = await db.social_posts.find_one({"post_id": post_id}, {"_id": 0})
    if not post:
        raise HTTPException(status_code=404, detail="Publication introuvable")
    project_id = body.get("project_id") or post.get("project_id")
    if not project_id:
        raise HTTPException(status_code=400, detail="Choisissez le projet auquel rattacher la tâche")
    if not await db.projects.find_one({"project_id": project_id}):
        raise HTTPException(status_code=404, detail="Projet introuvable")
    task = {
        "task_id": new_id("tsk"), "project_id": project_id, "parent_task_id": None,
        "title": f"Publier : {post['title']}",
        "description": (post.get("content") or "")[:500],
        "status": "TODO", "priority": "NORMAL", "category": "COMMUNICATION",
        "assigned_user_id": post.get("assigned_user_id"), "created_by": user["user_id"],
        "deadline": post.get("scheduled_date"), "estimated_hours": None, "actual_hours": None,
        "is_volunteer_task": False, "depends_on": [], "validation_proof": None, "proof_comment": None,
        "submitted_at": None, "submitted_by": None, "validated_at": None, "validated_by": None,
        "completed_at": None, "social_post_id": post_id,
        "created_at": iso(now_utc()), "updated_at": iso(now_utc()),
    }
    await db.tasks.insert_one(task)
    await db.social_posts.update_one({"post_id": post_id}, {"$set": {"task_id": task["task_id"],
                                                                    "project_id": project_id}})
    await log_action(user, "CREATE", "tasks", task["task_id"], new_value={"from_social_post": post_id})
    if task["assigned_user_id"]:
        await notify(task["assigned_user_id"], type="TASK_ASSIGNED", title="Nouvelle tâche de communication",
                     message=f"« {task['title']} » vous est attribuée.", level="ACTION",
                     resource_type="task", resource_id=task["task_id"], link=f"/projects/{project_id}")
    return {k: v for k, v in task.items() if k != "_id"}


@router.delete("/social/posts/{post_id}")
async def cancel_post(post_id: str, user: dict = Depends(require("social.manage"))):
    res = await db.social_posts.update_one({"post_id": post_id},
                                           {"$set": {"status": "CANCELLED", "updated_at": iso(now_utc())}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Publication introuvable")
    await log_action(user, "CANCEL", "social", post_id)
    return {"ok": True}


# ---------------------------------------------------------------- Jeux-concours
class ContestIn(BaseModel):
    title: str = Field(min_length=3)
    description: Optional[str] = None
    rules: str = ""
    prize: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    draw_date: Optional[str] = None
    winners_count: int = 1
    max_participants: Optional[int] = None
    question: Optional[str] = None
    cover_file_id: Optional[str] = None
    access_level: str = "MEMBERS"


class ContestUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    rules: Optional[str] = None
    prize: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    draw_date: Optional[str] = None
    winners_count: Optional[int] = None
    max_participants: Optional[int] = None
    question: Optional[str] = None
    cover_file_id: Optional[str] = None
    access_level: Optional[str] = None
    status: Optional[str] = None


@router.get("/contests")
async def list_contests(status: Optional[str] = None, limit: int = 100,
                        user: dict = Depends(require("contests.view"))):
    manager = await is_manager(user)
    filters = [] if manager else [{"status": {"$in": ["OPEN", "CLOSED", "DRAWN"]},
                                   "access_level": {"$in": allowed_access(user)}}]
    if status:
        filters.append({"status": status})
    query = {"$and": filters} if filters else {}
    items = await db.contests.find(query, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
    for c in items:
        c["participants_count"] = await db.contest_participants.count_documents({"contest_id": c["contest_id"]})
        c["is_participating"] = bool(await db.contest_participants.find_one(
            {"contest_id": c["contest_id"], "user_id": user["user_id"]}))
        if not manager:
            c.pop("participant_notes", None)
    return {"items": items, "total": len(items), "is_manager": manager}


@router.post("/contests")
async def create_contest(payload: ContestIn, user: dict = Depends(manager_user)):
    doc = {
        "contest_id": new_id("cts"), **payload.model_dump(), "status": "DRAFT",
        "winners": [], "drawn_at": None, "drawn_by": None,
        "created_by": user["user_id"], "created_by_name": await display_name(user["user_id"]),
        "created_at": iso(now_utc()), "updated_at": iso(now_utc()),
    }
    await db.contests.insert_one(doc)
    await log_action(user, "CREATE", "contests", doc["contest_id"], new_value={"title": payload.title})
    return {k: v for k, v in doc.items() if k != "_id"}


@router.put("/contests/{contest_id}")
async def update_contest(contest_id: str, payload: ContestUpdate, user: dict = Depends(manager_user)):
    contest = await db.contests.find_one({"contest_id": contest_id}, {"_id": 0})
    if not contest:
        raise HTTPException(status_code=404, detail="Jeu-concours introuvable")
    updates = payload.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="Aucune modification fournie")
    if "status" in updates and updates["status"] not in CONTEST_STATUSES:
        raise HTTPException(status_code=400, detail="Statut de jeu-concours invalide")
    if updates.get("status") == "OPEN" and not (updates.get("rules") or contest.get("rules")):
        raise HTTPException(status_code=400, detail="Un règlement est obligatoire avant l'ouverture")
    updates["updated_at"] = iso(now_utc())
    await db.contests.update_one({"contest_id": contest_id}, {"$set": updates})
    await log_action(user, "UPDATE", "contests", contest_id, new_value=updates)
    if updates.get("status") == "OPEN" and contest["status"] != "OPEN":
        async for u in db.users.find({"status": "ACTIVE"}, {"_id": 0, "user_id": 1}):
            await notify(u["user_id"], type="CONTEST_OPEN", title="Nouveau jeu-concours",
                         message=f"« {contest['title']} » est ouvert. Bonne chance !", level="INFO",
                         resource_type="contest", resource_id=contest_id, link="/contests")
    return await db.contests.find_one({"contest_id": contest_id}, {"_id": 0})


@router.get("/contests/{contest_id}/participants")
async def contest_participants(contest_id: str, user: dict = Depends(manager_user)):
    items = await db.contest_participants.find({"contest_id": contest_id}, {"_id": 0}) \
        .sort("created_at", 1).to_list(1000)
    return {"items": items, "total": len(items)}


@router.post("/contests/{contest_id}/participate")
async def participate(contest_id: str, body: dict, user: dict = Depends(require("contests.participate"))):
    contest = await db.contests.find_one({"contest_id": contest_id}, {"_id": 0})
    if not contest:
        raise HTTPException(status_code=404, detail="Jeu-concours introuvable")
    if contest["status"] != "OPEN":
        raise HTTPException(status_code=400, detail="Ce jeu-concours n'est pas ouvert aux participations")
    if contest["access_level"] not in allowed_access(user) and user["role"] != ROLE_ADMIN:
        raise HTTPException(status_code=403, detail="Ce jeu-concours ne vous est pas accessible")
    today = iso(now_utc())[:10]
    if contest.get("end_date") and contest["end_date"] < today:
        raise HTTPException(status_code=400, detail="Les participations sont closes")
    if await db.contest_participants.find_one({"contest_id": contest_id, "user_id": user["user_id"]}):
        raise HTTPException(status_code=400, detail="Vous participez déjà à ce jeu-concours")
    count = await db.contest_participants.count_documents({"contest_id": contest_id})
    if contest.get("max_participants") and count >= contest["max_participants"]:
        raise HTTPException(status_code=400, detail="Le nombre maximum de participants est atteint")
    if not body.get("accept_rules"):
        raise HTTPException(status_code=400, detail="Vous devez accepter le règlement pour participer")
    doc = {"participation_id": new_id("cpt"), "contest_id": contest_id, "user_id": user["user_id"],
           "user_name": await display_name(user["user_id"]), "answer": body.get("answer"),
           "accepted_rules_at": iso(now_utc()), "is_winner": False, "created_at": iso(now_utc())}
    await db.contest_participants.insert_one(doc)
    await log_action(user, "PARTICIPATE", "contests", contest_id)
    await notify(user["user_id"], type="CONTEST_PARTICIPATION", title="Participation enregistrée",
                 message=f"Votre participation à « {contest['title']} » est bien enregistrée.", level="SUCCESS",
                 resource_type="contest", resource_id=contest_id, link="/contests")
    return {k: v for k, v in doc.items() if k != "_id"}


@router.post("/contests/{contest_id}/draw")
async def draw_contest(contest_id: str, user: dict = Depends(manager_user)):
    contest = await db.contests.find_one({"contest_id": contest_id}, {"_id": 0})
    if not contest:
        raise HTTPException(status_code=404, detail="Jeu-concours introuvable")
    if contest["status"] == "DRAWN":
        raise HTTPException(status_code=400, detail="Le tirage a déjà été effectué")
    participants = await db.contest_participants.find({"contest_id": contest_id}, {"_id": 0}).to_list(2000)
    if not participants:
        raise HTTPException(status_code=400, detail="Aucun participant : le tirage est impossible")
    count = min(contest.get("winners_count") or 1, len(participants))
    winners = random.sample(participants, count)
    winner_ids = [w["user_id"] for w in winners]
    await db.contest_participants.update_many({"contest_id": contest_id, "user_id": {"$in": winner_ids}},
                                              {"$set": {"is_winner": True}})
    await db.contests.update_one({"contest_id": contest_id}, {"$set": {
        "status": "DRAWN", "winners": [{"user_id": w["user_id"], "user_name": w["user_name"]} for w in winners],
        "drawn_at": iso(now_utc()), "drawn_by": user["user_id"], "updated_at": iso(now_utc())}})
    await log_action(user, "DRAW", "contests", contest_id, new_value={"winners": winner_ids})
    for w in winners:
        await notify(w["user_id"], type="CONTEST_WON", title="Vous avez gagné !",
                     message=f"Félicitations ! Vous remportez « {contest.get('prize') or contest['title']} ».",
                     level="SUCCESS", resource_type="contest", resource_id=contest_id, link="/contests")
    for p in participants:
        if p["user_id"] not in winner_ids:
            await notify(p["user_id"], type="CONTEST_RESULT", title="Résultat du jeu-concours",
                         message=f"Le tirage de « {contest['title']} » a eu lieu. Merci d'avoir participé !",
                         level="INFO", resource_type="contest", resource_id=contest_id, link="/contests")
    return await db.contests.find_one({"contest_id": contest_id}, {"_id": 0})


# ---------------------------------------------------------------- Calendrier de l'Avent
class CalendarIn(BaseModel):
    year: int
    title: str = "Calendrier de l'Avent"
    description: Optional[str] = None


class BoxIn(BaseModel):
    day: int = Field(ge=1, le=25)
    title: str = Field(min_length=1)
    content: str = ""
    kind: str = "MESSAGE"
    reward: Optional[str] = None
    promo_code: Optional[str] = None
    link: Optional[str] = None
    file_id: Optional[str] = None
    is_published: bool = True


@router.get("/advent")
async def get_advent(year: Optional[int] = None, user: dict = Depends(require("advent.view"))):
    manager = await is_manager(user)
    query = {"year": year} if year else {}
    if not manager:
        query["status"] = "ACTIVE"
    calendar = await db.advent_calendars.find_one(query, {"_id": 0}, sort=[("year", -1)])
    if not calendar:
        return {"calendar": None, "boxes": [], "is_manager": manager}
    boxes = await db.advent_boxes.find({"calendar_id": calendar["calendar_id"]}, {"_id": 0}) \
        .sort("day", 1).to_list(25)
    opened = {o["day"] async for o in db.advent_openings.find(
        {"calendar_id": calendar["calendar_id"], "user_id": user["user_id"]}, {"_id": 0, "day": 1})}
    today = now_utc()
    for box in boxes:
        unlocked = calendar.get("preview_unlocked") or manager or (
            today.year == calendar["year"] and today.month == 12 and today.day >= box["day"])
        box["is_unlocked"] = bool(unlocked and box.get("is_published"))
        box["is_opened"] = box["day"] in opened
        if not box["is_unlocked"]:
            for hidden in ("content", "reward", "promo_code", "link", "file_id"):
                box[hidden] = None
    calendar["opened_count"] = len(opened)
    return {"calendar": calendar, "boxes": boxes, "is_manager": manager}


@router.post("/advent")
async def create_calendar(payload: CalendarIn, user: dict = Depends(manager_user)):
    if await db.advent_calendars.find_one({"year": payload.year}):
        raise HTTPException(status_code=400, detail="Un calendrier existe déjà pour cette année")
    doc = {"calendar_id": new_id("adv"), **payload.model_dump(), "status": "DRAFT",
           "preview_unlocked": False, "created_by": user["user_id"],
           "created_at": iso(now_utc()), "updated_at": iso(now_utc())}
    await db.advent_calendars.insert_one(doc)
    await log_action(user, "CREATE", "advent", doc["calendar_id"], new_value={"year": payload.year})
    return {k: v for k, v in doc.items() if k != "_id"}


@router.put("/advent/{calendar_id}")
async def update_calendar(calendar_id: str, body: dict, user: dict = Depends(manager_user)):
    allowed = {k: v for k, v in body.items()
               if k in ("title", "description", "status", "preview_unlocked")}
    if not allowed:
        raise HTTPException(status_code=400, detail="Aucune modification fournie")
    if "status" in allowed and allowed["status"] not in ("DRAFT", "ACTIVE", "ARCHIVED"):
        raise HTTPException(status_code=400, detail="Statut invalide")
    allowed["updated_at"] = iso(now_utc())
    res = await db.advent_calendars.update_one({"calendar_id": calendar_id}, {"$set": allowed})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Calendrier introuvable")
    await log_action(user, "UPDATE", "advent", calendar_id, new_value=allowed)
    return await db.advent_calendars.find_one({"calendar_id": calendar_id}, {"_id": 0})


@router.put("/advent/{calendar_id}/boxes/{day}")
async def upsert_box(calendar_id: str, day: int, payload: BoxIn, user: dict = Depends(manager_user)):
    if not await db.advent_calendars.find_one({"calendar_id": calendar_id}):
        raise HTTPException(status_code=404, detail="Calendrier introuvable")
    if payload.kind not in BOX_KINDS:
        raise HTTPException(status_code=400, detail="Type de case invalide")
    if day != payload.day:
        raise HTTPException(status_code=400, detail="Jour incohérent")
    data = {**payload.model_dump(), "calendar_id": calendar_id, "updated_at": iso(now_utc())}
    existing = await db.advent_boxes.find_one({"calendar_id": calendar_id, "day": day})
    if existing:
        await db.advent_boxes.update_one({"box_id": existing["box_id"]}, {"$set": data})
        box_id = existing["box_id"]
    else:
        box_id = new_id("box")
        await db.advent_boxes.insert_one({"box_id": box_id, **data, "created_at": iso(now_utc())})
    await log_action(user, "UPSERT", "advent", box_id, new_value={"day": day})
    return await db.advent_boxes.find_one({"box_id": box_id}, {"_id": 0})


@router.post("/advent/{calendar_id}/open/{day}")
async def open_box(calendar_id: str, day: int, user: dict = Depends(require("advent.view"))):
    calendar = await db.advent_calendars.find_one({"calendar_id": calendar_id}, {"_id": 0})
    if not calendar:
        raise HTTPException(status_code=404, detail="Calendrier introuvable")
    manager = await is_manager(user)
    if calendar["status"] != "ACTIVE" and not manager:
        raise HTTPException(status_code=403, detail="Ce calendrier n'est pas encore ouvert")
    box = await db.advent_boxes.find_one({"calendar_id": calendar_id, "day": day}, {"_id": 0})
    if not box or not box.get("is_published"):
        raise HTTPException(status_code=404, detail="Cette case n'est pas encore préparée")
    today = now_utc()
    unlocked = calendar.get("preview_unlocked") or manager or (
        today.year == calendar["year"] and today.month == 12 and today.day >= day)
    if not unlocked:
        raise HTTPException(status_code=403, detail=f"Patience : la case {day} s'ouvrira le {day} décembre")
    if not await db.advent_openings.find_one({"calendar_id": calendar_id, "day": day, "user_id": user["user_id"]}):
        await db.advent_openings.insert_one({
            "opening_id": new_id("opn"), "calendar_id": calendar_id, "day": day,
            "user_id": user["user_id"], "opened_at": iso(now_utc())})
    box["is_unlocked"] = True
    box["is_opened"] = True
    return box


# ---------------------------------------------------------------- Fil d'actualité & engagement
@router.get("/feed")
async def feed(limit: int = 14, user: dict = Depends(active_user)):
    access = allowed_access(user)
    items = []
    highlight = None
    articles = await db.articles.find(
        {"status": "PUBLISHED", "access_level": {"$in": access}}, {"_id": 0, "body": 0}) \
        .sort([("is_pinned", -1), ("published_at", -1)]).limit(6).to_list(6)
    for a in articles:
        entry = {"kind": "ARTICLE", "id": a["article_id"], "title": a["title"],
                 "subtitle": a.get("excerpt") or a.get("category"), "date": a.get("published_at"),
                 "cover_file_id": a.get("cover_file_id"), "link": "/blog", "is_pinned": a.get("is_pinned")}
        if a.get("is_pinned") and not highlight:
            highlight = entry
        else:
            items.append(entry)
    if rbac.has_permission(user, "events.view"):
        async for e in db.events.find({"status": {"$in": ["PLANNED", "CONFIRMED"]},
                                       "start_date": {"$gte": iso(now_utc())[:10]}},
                                      {"_id": 0}).sort("start_date", 1).limit(4):
            items.append({"kind": "EVENT", "id": e["event_id"], "title": e["title"],
                          "subtitle": e.get("location") or "Événement", "date": e.get("start_date"),
                          "link": f"/events/{e['event_id']}"})
    if rbac.has_permission(user, "activities.view"):
        async for a in db.activities.find({"status": {"$in": ["PLANNED", "ACTIVE"]},
                                           "date": {"$gte": iso(now_utc())[:10]}},
                                          {"_id": 0}).sort("date", 1).limit(4):
            items.append({"kind": "ACTIVITY", "id": a["activity_id"], "title": a["title"],
                          "subtitle": a.get("location") or a.get("category"), "date": a.get("date"),
                          "link": "/activities"})
    if rbac.has_permission(user, "formations.view"):
        async for f in db.formations.find({"status": {"$in": ["PLANNED", "LIVE", "DONE"]},
                                           "access_level": {"$in": access}},
                                          {"_id": 0}).sort("date", -1).limit(3):
            items.append({"kind": "FORMATION", "id": f["formation_id"], "title": f["title"],
                          "subtitle": f.get("speaker_name") or f["format"], "date": f.get("date"),
                          "link": "/formations"})
    async for c in db.contests.find({"status": "OPEN", "access_level": {"$in": access}}, {"_id": 0}).limit(2):
        items.append({"kind": "CONTEST", "id": c["contest_id"], "title": c["title"],
                      "subtitle": c.get("prize") or "Jeu-concours", "date": c.get("end_date"),
                      "link": "/contests"})
    if user["role"] == ROLE_ADMIN:
        async for p in db.profiles.find({}, {"_id": 0}).sort("created_at", -1).limit(3):
            items.append({"kind": "MEMBER", "id": p["user_id"], "title": p.get("display_name") or "Nouveau membre",
                          "subtitle": "Nouveau membre", "date": p.get("created_at"),
                          "link": "/admin/members"})
    items.sort(key=lambda x: x.get("date") or "", reverse=True)
    return {"highlight": highlight, "items": items[:limit]}


PROFILE_FIELDS = [("first_name", "Prénom"), ("last_name", "Nom"), ("phone", "Téléphone"),
                  ("city", "Ville"), ("department", "Département"), ("bio", "Présentation"),
                  ("avatar", "Photo de profil")]


@router.get("/me/engagement")
async def engagement(user: dict = Depends(active_user)):
    profile = await db.profiles.find_one({"user_id": user["user_id"]}, {"_id": 0}) or {}
    missing = [label for field, label in PROFILE_FIELDS if not profile.get(field)]
    percent = round((len(PROFILE_FIELDS) - len(missing)) / len(PROFILE_FIELDS) * 100)
    card = await db.loyalty_cards.find_one({"user_id": user["user_id"]}, {"_id": 0})
    loyalty = None
    if card:
        rewards = await db.loyalty_rules.find({"kind": "REWARD", "is_active": True}, {"_id": 0}) \
            .sort("threshold", 1).to_list(50)
        next_reward = next((r for r in rewards if (r.get("threshold") or 0) > card["total_points"]), None)
        loyalty = {"total_points": card["total_points"], "next_reward": next_reward,
                   "progress": round(card["total_points"] / next_reward["threshold"] * 100)
                   if next_reward else 100}
    return {
        "profile_completion": {"percent": percent, "missing": missing},
        "loyalty": loyalty,
        "badges": profile.get("function_badges") or [],
        "avatar": profile.get("avatar"),
        "cover_file_id": profile.get("cover_file_id"),
        "display_name": profile.get("display_name"),
        "first_name": profile.get("first_name"),
        "is_manager": await is_manager(user),
        "unread_notifications": await db.notifications.count_documents(
            {"recipient_id": user["user_id"], "is_read": False}),
    }
