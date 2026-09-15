"""Suivi des chiens : fiche, professionnel référent, suivi de cas, comptes-rendus coopératifs."""
from datetime import datetime
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
OBJECTIVE_STATUSES = ["EN_COURS", "ATTEINT", "ABANDONNE"]


class ObjectiveIn(BaseModel):
    title: str
    notes: Optional[str] = ""
    start_date: Optional[str] = None


class ObjectiveUpdate(BaseModel):
    title: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = None
    achieved_date: Optional[str] = None


class ObjectiveNoteIn(BaseModel):
    message: str


class SessionReportIn(BaseModel):
    text: str
    date: Optional[str] = None


class ReactionIn(BaseModel):
    message: str


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
    coordinator = user.get("access_level") == "PRO_COORDINATEUR"
    if not (manager or owner or team or coordinator):
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
    if owner_id and owner_id == user["user_id"]:
        query = {"owner_id": user["user_id"], "status": {"$ne": "ARCHIVED"}}
    elif manager:
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
            "can_create": True}


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


@router.delete("/dogs/{dog_id}")
async def delete_dog(dog_id: str, user: dict = Depends(active_user)):
    dog, owner, team, manager = await dog_access(dog_id, user)
    if not (owner or manager):
        raise HTTPException(status_code=403,
                            detail="Seuls le propriétaire et le Bureau peuvent supprimer cette fiche")
    await db.dogs.delete_one({"dog_id": dog_id})
    await db.dog_journals.delete_many({"dog_id": dog_id})
    cases = await db.dog_cases.find({"dog_id": dog_id}, {"_id": 0, "case_id": 1}).to_list(200)
    case_ids = [c["case_id"] for c in cases]
    if case_ids:
        await db.dog_steps.delete_many({"case_id": {"$in": case_ids}})
    await db.dog_cases.delete_many({"dog_id": dog_id})
    reports = await db.dog_reports.find({"dog_id": dog_id}, {"_id": 0, "report_id": 1}).to_list(500)
    report_ids = [r["report_id"] for r in reports]
    if report_ids:
        await db.dog_comments.delete_many({"report_id": {"$in": report_ids}})
    await db.dog_reports.delete_many({"dog_id": dog_id})
    await db.dog_owner_notes.delete_many({"dog_id": dog_id})
    await db.dog_objectives.delete_many({"dog_id": dog_id})
    await log_action(user, "DELETE", "dogs", dog_id, old_value={"name": dog.get("name")})
    return {"ok": True}


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


# ---------------------------------------------------------------------------
# Prompt 12 — Objectifs et progression (modèle dédié, indépendant du suivi de cas)
# ---------------------------------------------------------------------------
def _today():
    return iso(now_utc())[:10]


async def _get_objective(dog_id: str, objective_id: str):
    obj = await db.dog_objectives.find_one({"objective_id": objective_id, "dog_id": dog_id}, {"_id": 0})
    if not obj:
        raise HTTPException(status_code=404, detail="Objectif introuvable")
    return obj


@router.get("/dogs/{dog_id}/objectives")
async def list_objectives(dog_id: str, user: dict = Depends(active_user)):
    dog, owner, team, manager = await dog_access(dog_id, user)
    objs = await db.dog_objectives.find({"dog_id": dog_id}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return {"objectives": objs, "can_edit_pro": bool(manager or team), "is_owner": owner}


@router.post("/dogs/{dog_id}/objectives")
async def create_objective(dog_id: str, payload: ObjectiveIn, user: dict = Depends(active_user)):
    dog, owner, team, manager = await dog_access(dog_id, user)
    if not (manager or team):
        raise HTTPException(status_code=403,
                            detail="Seuls les professionnels rattachés définissent les objectifs")
    now = iso(now_utc())
    doc = {"objective_id": new_id("obj"), "dog_id": dog_id, "title": payload.title.strip(),
           "notes": payload.notes or "", "status": "EN_COURS",
           "start_date": payload.start_date or _today(), "achieved_date": None,
           "status_history": [{"status": "EN_COURS", "at": now, "by": user["user_id"],
                               "by_name": await display_name(user["user_id"])}],
           "session_reports": [], "owner_notes": [],
           "created_by": user["user_id"], "created_by_name": await display_name(user["user_id"]),
           "created_at": now, "updated_at": now}
    await db.dog_objectives.insert_one(dict(doc))
    await log_action(user, "CREATE", "dogs", dog_id, new_value={"objective": doc["title"][:60]})
    await notify(dog["owner_id"], type="DOG_OBJECTIVE", title="Un nouvel objectif pour votre chien",
                 message=f"{dog['name']} : « {doc['title']} » — le travail se met en route.",
                 level="INFO", resource_type="dog", resource_id=dog_id, link="/dogs")
    return doc


@router.put("/dogs/{dog_id}/objectives/{objective_id}")
async def update_objective(dog_id: str, objective_id: str, payload: ObjectiveUpdate,
                           user: dict = Depends(active_user)):
    dog, owner, team, manager = await dog_access(dog_id, user)
    if not (manager or team):
        raise HTTPException(status_code=403,
                            detail="Seuls les professionnels rattachés mettent à jour un objectif")
    obj = await _get_objective(dog_id, objective_id)
    now = iso(now_utc())
    updates = {"updated_at": now}
    if payload.title is not None:
        updates["title"] = payload.title.strip()
    if payload.notes is not None:
        updates["notes"] = payload.notes
    push = None
    if payload.status is not None and payload.status != obj["status"]:
        if payload.status not in OBJECTIVE_STATUSES:
            raise HTTPException(status_code=400, detail="Statut invalide")
        updates["status"] = payload.status
        updates["achieved_date"] = (payload.achieved_date or _today()) if payload.status == "ATTEINT" else None
        push = {"status_history": {"status": payload.status, "at": now, "by": user["user_id"],
                                   "by_name": await display_name(user["user_id"])}}
    elif payload.achieved_date is not None:
        updates["achieved_date"] = payload.achieved_date
    ops = {"$set": updates}
    if push:
        ops["$push"] = push
    await db.dog_objectives.update_one({"objective_id": objective_id}, ops)
    if push:
        atteint = payload.status == "ATTEINT"
        await notify(dog["owner_id"], type="DOG_OBJECTIVE", title="Progression d'un objectif",
                     message=f"{dog['name']} : « {obj['title']} » est "
                             f"{'atteint, bravo !' if atteint else 'mis à jour.'}",
                     level="SUCCESS" if atteint else "INFO",
                     resource_type="dog", resource_id=dog_id, link="/dogs")
    await log_action(user, "UPDATE", "dogs", dog_id, new_value={"objective": objective_id})
    return await _get_objective(dog_id, objective_id)


@router.post("/dogs/{dog_id}/objectives/{objective_id}/notes")
async def add_objective_note(dog_id: str, objective_id: str, payload: ObjectiveNoteIn,
                             user: dict = Depends(active_user)):
    dog, owner, team, manager = await dog_access(dog_id, user)
    if not (owner or manager):
        raise HTTPException(status_code=403, detail="Cet espace de notes est réservé au propriétaire")
    await _get_objective(dog_id, objective_id)
    note = {"note_id": new_id("onote"), "message": payload.message, "author_id": user["user_id"],
            "author_name": await display_name(user["user_id"]), "created_at": iso(now_utc())}
    await db.dog_objectives.update_one({"objective_id": objective_id},
                                       {"$push": {"owner_notes": note}, "$set": {"updated_at": iso(now_utc())}})
    return note


@router.post("/dogs/{dog_id}/objectives/{objective_id}/reports")
async def add_objective_report(dog_id: str, objective_id: str, payload: SessionReportIn,
                               user: dict = Depends(active_user)):
    dog, owner, team, manager = await dog_access(dog_id, user)
    if not (manager or team):
        raise HTTPException(status_code=403,
                            detail="Seuls les professionnels rédigent un compte-rendu de séance")
    await _get_objective(dog_id, objective_id)
    rep = {"report_id": new_id("srep"), "text": payload.text, "date": payload.date or _today(),
           "author_id": user["user_id"], "author_name": await display_name(user["user_id"]),
           "created_at": iso(now_utc()), "comments": []}
    await db.dog_objectives.update_one({"objective_id": objective_id},
                                       {"$push": {"session_reports": rep}, "$set": {"updated_at": iso(now_utc())}})
    await notify(dog["owner_id"], type="DOG_SESSION", title="Compte-rendu de séance",
                 message=f"{dog['name']} : un retour de séance vous a été partagé.",
                 level="INFO", resource_type="dog", resource_id=dog_id, link="/dogs")
    return rep


@router.post("/dogs/{dog_id}/objectives/{objective_id}/reports/{report_id}/react")
async def react_objective_report(dog_id: str, objective_id: str, report_id: str, payload: ReactionIn,
                                 user: dict = Depends(active_user)):
    dog, owner, team, manager = await dog_access(dog_id, user)
    if not (owner or team or manager):
        raise HTTPException(status_code=403, detail="Accès refusé")
    await _get_objective(dog_id, objective_id)
    comment = {"comment_id": new_id("react"), "message": payload.message, "author_id": user["user_id"],
               "author_name": await display_name(user["user_id"]), "created_at": iso(now_utc())}
    res = await db.dog_objectives.update_one(
        {"objective_id": objective_id},
        {"$push": {"session_reports.$[r].comments": comment}, "$set": {"updated_at": iso(now_utc())}},
        array_filters=[{"r.report_id": report_id}])
    if not res.modified_count:
        raise HTTPException(status_code=404, detail="Compte-rendu introuvable")
    return comment


@router.get("/pilotage")
async def pilotage(user: dict = Depends(active_user)):
    if not (user.get("role") == ROLE_ADMIN or user.get("access_level") == "PRO_COORDINATEUR"):
        raise HTTPException(status_code=403,
                            detail="Vue de pilotage réservée à la coordination et au Bureau")
    dogs = await db.dogs.find({"status": {"$ne": "ARCHIVED"}}, {"_id": 0}).to_list(1000)
    today = now_utc().date()
    month_prefix = iso(now_utc())[:7]
    rows, obj_en_cours, obj_atteints = [], 0, 0
    for d in dogs:
        did = d["dog_id"]
        last = None
        rep = await db.dog_reports.find({"dog_id": did}, {"_id": 0, "date": 1}).sort("date", -1).limit(1).to_list(1)
        if rep:
            last = rep[0].get("date")
        step = await db.dog_steps.find({"dog_id": did}, {"_id": 0, "date": 1}).sort("date", -1).limit(1).to_list(1)
        if step and step[0].get("date") and (not last or step[0]["date"] > last):
            last = step[0]["date"]
        objs = await db.dog_objectives.find(
            {"dog_id": did}, {"_id": 0, "status": 1, "achieved_date": 1, "session_reports": 1}).to_list(200)
        for o in objs:
            if o.get("status") == "EN_COURS":
                obj_en_cours += 1
            if o.get("status") == "ATTEINT" and (o.get("achieved_date") or "")[:7] == month_prefix:
                obj_atteints += 1
            for sr in o.get("session_reports") or []:
                if sr.get("date") and (not last or sr["date"] > last):
                    last = sr["date"]
        days = None
        if last:
            try:
                days = (today - datetime.fromisoformat(last[:10]).date()).days
            except (ValueError, TypeError):
                days = None
        team_ids = list({*(d.get("pro_team_ids") or []),
                         *([d["referent_pro_id"]] if d.get("referent_pro_id") else [])})
        rows.append({
            "dog_id": did, "name": d["name"],
            "owner_name": d.get("owner_name") or await display_name(d["owner_id"]),
            "referent_name": await display_name(d["referent_pro_id"]) if d.get("referent_pro_id") else None,
            "team_names": [await display_name(t) for t in team_ids], "team_count": len(team_ids),
            "last_intervention": last, "days_since": days,
            "stale": last is None or (days is not None and days > 21), "shared": len(team_ids) > 1,
        })
    rows.sort(key=lambda r: (r["days_since"] if r["days_since"] is not None else 99999), reverse=True)
    return {"rows": rows,
            "counters": {"active_dogs": len(dogs), "objectives_en_cours": obj_en_cours,
                         "objectives_atteints_mois": obj_atteints}}


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
