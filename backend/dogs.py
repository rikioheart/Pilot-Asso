"""Suivi des chiens : fiche, professionnel référent, suivi de cas, comptes-rendus coopératifs."""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from rbac import ROLE_ADMIN, ROLE_PRO
from deps import (db, iso, now_utc, new_id, active_user, require, log_action,
                  notify, notify_bureau, display_name)
from content import is_manager
from storage import file_meta

router = APIRouter(prefix="/api")

SEXES = ["MALE", "FEMELLE"]
INTERVENTION_TYPES = ["EDUCATION", "COMPORTEMENT", "VETERINAIRE", "OSTEOPATHIE", "TOILETTAGE",
                      "SPORT", "BALADE", "ATELIER", "AUTRE"]
BEHAVIOR_CATEGORIES = ["SOCIABILISATION", "REACTIVITE", "PEUR", "MARCHE_EN_LAISSE", "RAPPEL",
                       "PROPRETE", "SEPARATION", "AUTRE"]


class DogIn(BaseModel):
    name: str = Field(min_length=1)
    owner_id: Optional[str] = None
    breed: Optional[str] = None
    birth_date: Optional[str] = None
    age: Optional[str] = None
    sex: Optional[str] = None
    photo_file_id: Optional[str] = None
    behavior_context: Optional[str] = None
    behavior_category: Optional[str] = None
    history: Optional[str] = None
    general_notes: Optional[str] = None


class DogUpdate(BaseModel):
    name: Optional[str] = None
    breed: Optional[str] = None
    birth_date: Optional[str] = None
    age: Optional[str] = None
    sex: Optional[str] = None
    photo_file_id: Optional[str] = None
    behavior_context: Optional[str] = None
    behavior_category: Optional[str] = None
    history: Optional[str] = None
    general_notes: Optional[str] = None
    referent_pro_id: Optional[str] = None
    pro_team_ids: Optional[List[str]] = None
    activity_ids: Optional[List[str]] = None
    event_ids: Optional[List[str]] = None
    status: Optional[str] = None


class CaseIn(BaseModel):
    problem: str = Field(min_length=3)
    objectives: List[str] = []
    behavior_category: Optional[str] = None


class StepIn(BaseModel):
    label: str = Field(min_length=2)
    progress: int = Field(ge=0, le=100)
    comment: Optional[str] = None
    visible_to_owner: bool = False


class ReportIn(BaseModel):
    date: Optional[str] = None
    intervention_type: str = "AUTRE"
    observations: str = Field(min_length=3)
    progress_step: Optional[str] = None
    progress: Optional[int] = None
    activity_id: Optional[str] = None
    event_id: Optional[str] = None
    visible_to_owner: bool = False


class CommentIn(BaseModel):
    message: str = Field(min_length=2)
    visible_to_owner: bool = False


class OwnerNoteIn(BaseModel):
    message: str = Field(min_length=2)
    mood: Optional[str] = None


async def dog_access(dog_id: str, user: dict) -> tuple:
    """Retourne (chien, est_proprietaire, est_pro_intervenant, est_bureau)."""
    dog = await db.dogs.find_one({"dog_id": dog_id}, {"_id": 0})
    if not dog:
        raise HTTPException(status_code=404, detail="Fiche chien introuvable")
    manager = await is_manager(user)
    owner = dog.get("owner_id") == user["user_id"]
    team = user["user_id"] in (dog.get("pro_team_ids") or []) or \
        dog.get("referent_pro_id") == user["user_id"]
    if not (manager or owner or team):
        raise HTTPException(status_code=403, detail="Ce dossier ne vous est pas accessible")
    return dog, owner, team, manager


@router.get("/dogs/meta")
async def dogs_meta(user: dict = Depends(active_user)):
    return {"sexes": SEXES, "intervention_types": INTERVENTION_TYPES,
            "behavior_categories": BEHAVIOR_CATEGORIES}


@router.get("/dogs")
async def list_dogs(owner_id: Optional[str] = None, q: Optional[str] = None,
                    user: dict = Depends(active_user)):
    manager = await is_manager(user)
    if manager:
        query = {"status": {"$ne": "ARCHIVED"}}
        if owner_id:
            query["owner_id"] = owner_id
    elif user["role"] == ROLE_PRO:
        query = {"$or": [{"referent_pro_id": user["user_id"]},
                         {"pro_team_ids": user["user_id"]}], "status": {"$ne": "ARCHIVED"}}
    else:
        query = {"owner_id": user["user_id"], "status": {"$ne": "ARCHIVED"}}
    if q:
        query["name"] = {"$regex": q, "$options": "i"}
    dogs = await db.dogs.find(query, {"_id": 0}).sort("name", 1).to_list(300)
    for dog in dogs:
        if not dog.get("owner_name"):
            dog["owner_name"] = await display_name(dog.get("owner_id"))
        dog["referent_name"] = await display_name(dog["referent_pro_id"]) \
            if dog.get("referent_pro_id") else None
        case = await db.dog_cases.find_one({"dog_id": dog["dog_id"], "status": "OPEN"}, {"_id": 0})
        dog["progress"] = (case or {}).get("progress", 0)
        dog["problem"] = (case or {}).get("problem")
        dog["photo"] = await file_meta(dog.get("photo_file_id"))
    return {"items": dogs, "total": len(dogs), "is_manager": manager,
            "can_create": manager or user["role"] != ROLE_PRO}


@router.post("/dogs")
async def create_dog(payload: DogIn, user: dict = Depends(active_user)):
    manager = await is_manager(user)
    owner_id = payload.owner_id or user["user_id"]
    if owner_id != user["user_id"] and not manager:
        raise HTTPException(status_code=403, detail="Seul le Bureau peut créer une fiche pour un autre membre")
    if payload.sex and payload.sex not in SEXES:
        raise HTTPException(status_code=400, detail="Sexe invalide")
    if not await db.users.find_one({"user_id": owner_id}):
        raise HTTPException(status_code=404, detail="Propriétaire introuvable")
    doc = {"dog_id": new_id("dog"), **payload.model_dump(exclude={"owner_id"}),
           "owner_id": owner_id, "owner_name": await display_name(owner_id),
           "referent_pro_id": None, "pro_team_ids": [], "activity_ids": [], "event_ids": [],
           "status": "ACTIVE", "created_by": user["user_id"],
           "created_at": iso(now_utc()), "updated_at": iso(now_utc())}
    await db.dogs.insert_one(dict(doc))
    await log_action(user, "CREATE", "dogs", doc["dog_id"], new_value={"name": payload.name})
    return doc


@router.get("/dogs/{dog_id}")
async def get_dog(dog_id: str, user: dict = Depends(active_user)):
    dog, owner, team, manager = await dog_access(dog_id, user)
    dog["owner_name"] = dog.get("owner_name") or await display_name(dog["owner_id"])
    dog["referent_name"] = await display_name(dog["referent_pro_id"]) if dog.get("referent_pro_id") else None
    dog["photo"] = await file_meta(dog.get("photo_file_id"))
    dog["team"] = [{"user_id": uid, "name": await display_name(uid)}
                   for uid in (dog.get("pro_team_ids") or [])]

    cases = await db.dog_cases.find({"dog_id": dog_id}, {"_id": 0}).sort("created_at", -1).to_list(20)
    for case in cases:
        steps = await db.dog_steps.find({"case_id": case["case_id"]}, {"_id": 0}) \
            .sort("created_at", 1).to_list(100)
        case["steps"] = [s for s in steps if s.get("visible_to_owner")] if owner and not manager else steps

    report_query = {"dog_id": dog_id}
    if owner and not (manager or team):
        report_query["visible_to_owner"] = True
    reports = await db.dog_reports.find(report_query, {"_id": 0}).sort("date", -1).to_list(200)
    for report in reports:
        comments = await db.dog_comments.find({"report_id": report["report_id"]}, {"_id": 0}) \
            .sort("created_at", 1).to_list(100)
        report["comments"] = [c for c in comments if c.get("visible_to_owner")] \
            if owner and not (manager or team) else comments

    notes = await db.dog_owner_notes.find({"dog_id": dog_id}, {"_id": 0}) \
        .sort("created_at", -1).to_list(200)
    activities = await db.activities.find(
        {"activity_id": {"$in": dog.get("activity_ids") or []}},
        {"_id": 0, "activity_id": 1, "title": 1, "date": 1}).to_list(50)
    return {"dog": dog, "cases": cases, "reports": reports, "owner_notes": notes,
            "activities": activities, "is_owner": owner, "is_team": team, "is_manager": manager,
            "can_write_pro": manager or team}


@router.put("/dogs/{dog_id}")
async def update_dog(dog_id: str, payload: DogUpdate, user: dict = Depends(active_user)):
    dog, owner, team, manager = await dog_access(dog_id, user)
    updates = payload.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="Aucune modification fournie")
    if "pro_team_ids" in updates and not manager:
        raise HTTPException(status_code=403,
                            detail="Seul le Bureau définit les professionnels intervenant sur le dossier")
    if "referent_pro_id" in updates and not (manager or owner):
        raise HTTPException(status_code=403, detail="Seul le propriétaire ou le Bureau désigne le référent")
    if "status" in updates and not manager:
        raise HTTPException(status_code=403, detail="Seul le Bureau archive une fiche")
    if not (owner or manager) and set(updates) - {"referent_pro_id"}:
        raise HTTPException(status_code=403, detail="Vous ne pouvez pas modifier cette fiche")
    if updates.get("referent_pro_id"):
        referent = await db.users.find_one({"user_id": updates["referent_pro_id"]}, {"_id": 0, "role": 1})
        if not referent or referent["role"] not in (ROLE_PRO, ROLE_ADMIN):
            raise HTTPException(status_code=400, detail="Le référent doit être un professionnel")
        team_ids = set(dog.get("pro_team_ids") or []) | {updates["referent_pro_id"]}
        updates["pro_team_ids"] = list(team_ids)
    updates["updated_at"] = iso(now_utc())
    await db.dogs.update_one({"dog_id": dog_id}, {"$set": updates})
    await log_action(user, "UPDATE", "dogs", dog_id, new_value=updates)
    if updates.get("referent_pro_id") and updates["referent_pro_id"] != dog.get("referent_pro_id"):
        await notify(updates["referent_pro_id"], type="DOG_REFERENT",
                     title="Vous êtes référent d'un chien",
                     message=f"{dog['name']} ({dog.get('owner_name')}) vous est confié comme référent.",
                     level="INFO", resource_type="dog", resource_id=dog_id, link="/dogs")
    return await db.dogs.find_one({"dog_id": dog_id}, {"_id": 0})


@router.post("/dogs/{dog_id}/owner-notes")
async def add_owner_note(dog_id: str, payload: OwnerNoteIn, user: dict = Depends(active_user)):
    dog, owner, team, manager = await dog_access(dog_id, user)
    if not (owner or manager):
        raise HTTPException(status_code=403, detail="Seul le propriétaire consigne ses observations")
    doc = {"note_id": new_id("dnt"), "dog_id": dog_id, "message": payload.message,
           "mood": payload.mood, "author_id": user["user_id"],
           "author_name": await display_name(user["user_id"]), "created_at": iso(now_utc())}
    await db.dog_owner_notes.insert_one(dict(doc))
    await log_action(user, "CREATE", "dogs", dog_id, new_value={"owner_note": True})
    return doc


@router.post("/dogs/{dog_id}/cases")
async def create_case(dog_id: str, payload: CaseIn, user: dict = Depends(active_user)):
    dog, owner, team, manager = await dog_access(dog_id, user)
    if not (manager or team):
        raise HTTPException(status_code=403, detail="Seuls les professionnels intervenants et le Bureau "
                                                   "ouvrent un suivi de cas")
    doc = {"case_id": new_id("cas"), "dog_id": dog_id, "problem": payload.problem,
           "objectives": payload.objectives, "behavior_category": payload.behavior_category,
           "progress": 0, "status": "OPEN", "created_by": user["user_id"],
           "created_by_name": await display_name(user["user_id"]),
           "created_at": iso(now_utc()), "updated_at": iso(now_utc())}
    await db.dog_cases.insert_one(dict(doc))
    await log_action(user, "CREATE", "dogs", dog_id, new_value={"case": payload.problem[:60]})
    await notify(dog["owner_id"], type="DOG_CASE", title="Un suivi a été ouvert pour votre chien",
                 message=f"{dog['name']} : le travail commence, vous serez tenu informé.",
                 level="INFO", resource_type="dog", resource_id=dog_id, link="/dogs")
    return doc


@router.post("/dogs/{dog_id}/cases/{case_id}/steps")
async def add_step(dog_id: str, case_id: str, payload: StepIn, user: dict = Depends(active_user)):
    dog, owner, team, manager = await dog_access(dog_id, user)
    if not (manager or team):
        raise HTTPException(status_code=403, detail="Réservé aux professionnels intervenants et au Bureau")
    case = await db.dog_cases.find_one({"case_id": case_id, "dog_id": dog_id}, {"_id": 0})
    if not case:
        raise HTTPException(status_code=404, detail="Suivi de cas introuvable")
    doc = {"step_id": new_id("stp"), "case_id": case_id, "dog_id": dog_id, "label": payload.label,
           "progress": payload.progress, "comment": payload.comment,
           "visible_to_owner": payload.visible_to_owner, "author_id": user["user_id"],
           "author_name": await display_name(user["user_id"]),
           "date": iso(now_utc())[:10], "created_at": iso(now_utc())}
    await db.dog_steps.insert_one(dict(doc))
    await db.dog_cases.update_one({"case_id": case_id},
                                  {"$set": {"progress": payload.progress, "updated_at": iso(now_utc())}})
    await log_action(user, "CREATE", "dogs", dog_id, new_value={"step": payload.label[:60]})
    if payload.visible_to_owner:
        await notify(dog["owner_id"], type="DOG_PROGRESS", title="Nouvelle étape franchie",
                     message=f"{dog['name']} : {payload.label} ({payload.progress} %).",
                     level="SUCCESS", resource_type="dog", resource_id=dog_id, link="/dogs")
    return doc


@router.post("/dogs/{dog_id}/reports")
async def add_report(dog_id: str, payload: ReportIn, user: dict = Depends(active_user)):
    dog, owner, team, manager = await dog_access(dog_id, user)
    if not (manager or team):
        raise HTTPException(status_code=403, detail="Seuls les professionnels intervenants et le Bureau "
                                                   "saisissent un compte-rendu")
    if payload.intervention_type not in INTERVENTION_TYPES:
        raise HTTPException(status_code=400, detail="Type d'intervention invalide")
    doc = {"report_id": new_id("rpt"), "dog_id": dog_id,
           "date": payload.date or iso(now_utc())[:10],
           "intervention_type": payload.intervention_type, "observations": payload.observations,
           "progress_step": payload.progress_step, "progress": payload.progress,
           "activity_id": payload.activity_id, "event_id": payload.event_id,
           "visible_to_owner": payload.visible_to_owner, "author_id": user["user_id"],
           "author_name": await display_name(user["user_id"]),
           "created_at": iso(now_utc()), "updated_at": iso(now_utc())}
    await db.dog_reports.insert_one(dict(doc))
    await log_action(user, "CREATE", "dogs", dog_id, new_value={"report": payload.intervention_type})
    for pro_id in set((dog.get("pro_team_ids") or []) + ([dog["referent_pro_id"]]
                                                          if dog.get("referent_pro_id") else [])):
        if pro_id != user["user_id"]:
            await notify(pro_id, type="DOG_REPORT", title="Nouveau compte-rendu",
                         message=f"{dog['name']} ({dog.get('owner_name')}) : "
                                 f"{doc['author_name']} a partagé ses observations.",
                         level="INFO", resource_type="dog", resource_id=dog_id, link="/dogs")
    if payload.visible_to_owner:
        await notify(dog["owner_id"], type="DOG_REPORT_SHARED", title="Un retour vous a été partagé",
                     message=f"{dog['name']} : un compte-rendu de séance est disponible.",
                     level="INFO", resource_type="dog", resource_id=dog_id, link="/dogs")
    return doc


@router.put("/dogs/{dog_id}/reports/{report_id}")
async def update_report(dog_id: str, report_id: str, body: dict, user: dict = Depends(active_user)):
    dog, owner, team, manager = await dog_access(dog_id, user)
    report = await db.dog_reports.find_one({"report_id": report_id, "dog_id": dog_id}, {"_id": 0})
    if not report:
        raise HTTPException(status_code=404, detail="Compte-rendu introuvable")
    if not (manager or report["author_id"] == user["user_id"]):
        raise HTTPException(status_code=403, detail="Vous ne pouvez pas modifier ce compte-rendu")
    updates = {k: v for k, v in body.items()
               if k in ("observations", "progress_step", "progress", "visible_to_owner")}
    if not updates:
        raise HTTPException(status_code=400, detail="Aucune modification fournie")
    updates["updated_at"] = iso(now_utc())
    await db.dog_reports.update_one({"report_id": report_id}, {"$set": updates})
    await log_action(user, "UPDATE", "dogs", dog_id, new_value=updates)
    return await db.dog_reports.find_one({"report_id": report_id}, {"_id": 0})


@router.post("/dogs/{dog_id}/reports/{report_id}/comments")
async def add_comment(dog_id: str, report_id: str, payload: CommentIn, user: dict = Depends(active_user)):
    dog, owner, team, manager = await dog_access(dog_id, user)
    if not (manager or team):
        raise HTTPException(status_code=403, detail="Espace de coopération réservé aux professionnels "
                                                   "intervenants et au Bureau")
    if not await db.dog_reports.find_one({"report_id": report_id, "dog_id": dog_id}):
        raise HTTPException(status_code=404, detail="Compte-rendu introuvable")
    doc = {"comment_id": new_id("cmt"), "report_id": report_id, "dog_id": dog_id,
           "message": payload.message, "visible_to_owner": payload.visible_to_owner,
           "author_id": user["user_id"], "author_name": await display_name(user["user_id"]),
           "created_at": iso(now_utc())}
    await db.dog_comments.insert_one(dict(doc))
    await log_action(user, "CREATE", "dogs", dog_id, new_value={"comment": True})
    return doc


@router.put("/dogs/{dog_id}/comments/{comment_id}")
async def toggle_comment_visibility(dog_id: str, comment_id: str, body: dict,
                                    user: dict = Depends(active_user)):
    dog, owner, team, manager = await dog_access(dog_id, user)
    comment = await db.dog_comments.find_one({"comment_id": comment_id}, {"_id": 0})
    if not comment:
        raise HTTPException(status_code=404, detail="Commentaire introuvable")
    if not (manager or comment["author_id"] == user["user_id"]):
        raise HTTPException(status_code=403, detail="Vous ne pouvez pas modifier ce commentaire")
    visible = bool(body.get("visible_to_owner"))
    await db.dog_comments.update_one({"comment_id": comment_id},
                                     {"$set": {"visible_to_owner": visible}})
    return {"ok": True, "visible_to_owner": visible}


@router.post("/dogs/{dog_id}/link")
async def link_dog(dog_id: str, body: dict, user: dict = Depends(active_user)):
    dog, owner, team, manager = await dog_access(dog_id, user)
    if not (manager or team or owner):
        raise HTTPException(status_code=403, detail="Accès refusé")
    activity_id, event_id = body.get("activity_id"), body.get("event_id")
    if activity_id:
        if not await db.activities.find_one({"activity_id": activity_id}):
            raise HTTPException(status_code=404, detail="Activité introuvable")
        await db.dogs.update_one({"dog_id": dog_id}, {"$addToSet": {"activity_ids": activity_id}})
    elif event_id:
        if not await db.events.find_one({"event_id": event_id}):
            raise HTTPException(status_code=404, detail="Événement introuvable")
        await db.dogs.update_one({"dog_id": dog_id}, {"$addToSet": {"event_ids": event_id}})
    else:
        raise HTTPException(status_code=400, detail="Choisissez une activité ou un événement")
    await log_action(user, "LINK", "dogs", dog_id, new_value=body)
    return {"ok": True}


@router.get("/dogs-stats")
async def dogs_stats(user: dict = Depends(require("stats.view"))):
    total = await db.dogs.count_documents({"status": {"$ne": "ARCHIVED"}})
    followed = len(await db.dog_cases.distinct("dog_id", {"status": "OPEN"}))
    by_type = {}
    async for report in db.dog_reports.find({}, {"_id": 0, "intervention_type": 1}):
        by_type[report["intervention_type"]] = by_type.get(report["intervention_type"], 0) + 1
    by_category = {}
    async for case in db.dog_cases.find({}, {"_id": 0, "behavior_category": 1, "progress": 1}):
        key = case.get("behavior_category") or "AUTRE"
        entry = by_category.setdefault(key, {"count": 0, "sum": 0})
        entry["count"] += 1
        entry["sum"] += case.get("progress") or 0
    return {
        "dogs_total": total, "dogs_followed": followed,
        "reports_total": await db.dog_reports.count_documents({}),
        "by_intervention": [{"type": k, "count": v} for k, v in
                            sorted(by_type.items(), key=lambda x: -x[1])],
        "by_behavior": [{"category": k, "count": v["count"],
                         "average_progress": round(v["sum"] / v["count"])}
                        for k, v in sorted(by_category.items(), key=lambda x: -x[1]["count"])],
    }
