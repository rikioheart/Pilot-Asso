"""Phase 2 — Projets, sous-projets, tâches, sous-tâches, équipes, validation, historique, aide."""
from typing import List, Optional
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

import rbac
from rbac import ROLE_ADMIN, ROLE_PRO, ROLE_MEMBER
from deps import (db, iso, now_utc, new_id, active_user, require, require_admin,
                  log_action, notify, notify_bureau, display_name)

router = APIRouter(prefix="/api")

PROJECT_STATUSES = ["IDEA", "TO_REVIEW", "PLANNED", "IN_PROGRESS", "WAITING", "BLOCKED",
                    "PENDING_VALIDATION", "COMPLETED", "ARCHIVED"]
TASK_STATUSES = ["TODO", "IN_PROGRESS", "WAITING", "PENDING_VALIDATION", "COMPLETED",
                 "BLOCKED", "CANCELLED", "ARCHIVED"]
PROJECT_CATEGORIES = ["EVENEMENT", "FORMATION", "PEDAGOGIE", "PREVENTION", "COMMUNICATION", "BLOG",
                      "PARTENARIAT", "TERRAIN", "GOUVERNANCE", "CAMPAGNE", "AUTRE"]
PROJECT_ROLES = ["OWNER", "COORDINATOR", "CONTRIBUTOR", "VOLUNTEER", "EXPERT", "REVIEWER"]
VISIBILITY_MODES = ["INTERNAL_ONLY", "BUREAU", "PROJECT_TEAM", "PROFESSIONALS", "MEMBERS", "PUBLIC", "CUSTOM"]
HELP_SKILLS = ["communication", "redaction", "terrain", "logistique", "evenementiel", "informatique",
               "photographie", "prospection", "administratif", "pedagogie", "autre"]

TEMPLATES = {
    "JOURNEE_THEMATIQUE": {
        "label": "Journée thématique",
        "category": "EVENEMENT",
        "tasks": ["Trouver les professionnels", "Définir le thème", "Définir la date", "Trouver le lieu",
                  "Établir le budget", "Communication", "Ouvrir les inscriptions", "Préparer le matériel",
                  "Réalisation", "Bilan"],
    },
    "ARTICLE_BLOG": {
        "label": "Article de blog",
        "category": "BLOG",
        "tasks": ["Idée", "Recherche", "Plan", "Rédaction", "Relecture", "Visuel", "Publication", "Promotion"],
    },
    "FORMATION": {
        "label": "Formation",
        "category": "FORMATION",
        "tasks": ["Choisir le sujet", "Trouver l'intervenant", "Construire le programme", "Créer les supports",
                  "Fixer la date", "Trouver le lieu", "Inscriptions", "Communication", "Bilan"],
    },
    "EVENEMENT": {
        "label": "Événement",
        "category": "EVENEMENT",
        "tasks": ["Organisation", "Intervenants", "Partenaires", "Communication", "Participants",
                  "Matériel", "Finances", "Bilan"],
    },
}


# ---------------------------------------------------------------- Modèles
class ProjectIn(BaseModel):
    title: str = Field(min_length=2)
    description: Optional[str] = None
    category: str = "AUTRE"
    status: str = "IDEA"
    priority: str = "NORMAL"
    start_date: Optional[str] = None
    deadline: Optional[str] = None
    visibility: str = "MEMBERS"
    parent_project_id: Optional[str] = None
    owner_id: Optional[str] = None
    template: Optional[str] = None


class ProjectUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    start_date: Optional[str] = None
    deadline: Optional[str] = None
    visibility: Optional[str] = None
    owner_id: Optional[str] = None
    completion_percentage: Optional[int] = None


class TeamIn(BaseModel):
    member_id: str
    role_in_project: str = "CONTRIBUTOR"
    participation_level: str = "REGULIER"


class TaskIn(BaseModel):
    project_id: str
    title: str = Field(min_length=2)
    description: Optional[str] = None
    parent_task_id: Optional[str] = None
    priority: str = "NORMAL"
    deadline: Optional[str] = None
    assigned_user_id: Optional[str] = None
    is_volunteer_task: bool = False
    visibility: str = "PROJECT_TEAM"
    blocked_by_task_id: Optional[str] = None
    google_forms_url: Optional[str] = None


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[str] = None
    deadline: Optional[str] = None
    assigned_user_id: Optional[str] = None
    is_volunteer_task: Optional[bool] = None
    status: Optional[str] = None
    blocked_by_task_id: Optional[str] = None
    visibility: Optional[str] = None
    google_forms_url: Optional[str] = None


class SubmitIn(BaseModel):
    proof: Optional[str] = None
    comment: Optional[str] = None


class ValidateIn(BaseModel):
    decision: str  # ACCEPT | CHANGES
    comment: Optional[str] = None


class CommentIn(BaseModel):
    comment: str = Field(min_length=1)


class HelpIn(BaseModel):
    type: str = "NEEDS_HELP"  # NEEDS_HELP | CAN_HELP
    message: str = Field(min_length=1)
    skills: List[str] = []
    context_type: Optional[str] = None
    context_id: Optional[str] = None


# ---------------------------------------------------------------- Contexte / visibilité
async def team_role(project_id: str, user_id: str) -> Optional[str]:
    doc = await db.project_teams.find_one({"project_id": project_id, "member_id": user_id, "status": "ACTIVE"})
    return doc["role_in_project"] if doc else None


async def visible_project_filter(user: dict) -> dict:
    if user["role"] == ROLE_ADMIN:
        return {}
    allowed = ["MEMBERS", "PUBLIC"] if user["role"] == ROLE_MEMBER else ["PROFESSIONALS", "MEMBERS", "PUBLIC"]
    team_ids = [t["project_id"] async for t in db.project_teams.find(
        {"member_id": user["user_id"], "status": "ACTIVE"}, {"_id": 0, "project_id": 1})]
    return {"$or": [{"visibility": {"$in": allowed}}, {"project_id": {"$in": team_ids}},
                    {"owner_id": user["user_id"]}]}


async def get_visible_project(project_id: str, user: dict) -> dict:
    project = await db.projects.find_one({"project_id": project_id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="Projet introuvable")
    if user["role"] == ROLE_ADMIN:
        return project
    allowed = ["MEMBERS", "PUBLIC"] if user["role"] == ROLE_MEMBER else ["PROFESSIONALS", "MEMBERS", "PUBLIC"]
    if project["visibility"] in allowed or project["owner_id"] == user["user_id"] \
            or await team_role(project_id, user["user_id"]):
        return project
    raise HTTPException(status_code=403, detail="Ce projet ne vous est pas visible")


async def assert_can_manage_project(project: dict, user: dict):
    if user["role"] == ROLE_ADMIN:
        return
    if not rbac.has_permission(user, "projects.edit"):
        raise HTTPException(status_code=403, detail="Permission requise : projects.edit")
    role = await team_role(project["project_id"], user["user_id"])
    if project["owner_id"] != user["user_id"] and role not in ("OWNER", "COORDINATOR"):
        raise HTTPException(status_code=403, detail="Vous n'êtes pas coordinateur de ce projet")


async def assert_can_manage_tasks(project: dict, user: dict):
    if user["role"] == ROLE_ADMIN:
        return
    if not rbac.has_permission(user, "tasks.create"):
        raise HTTPException(status_code=403, detail="Permission requise : tasks.create")
    role = await team_role(project["project_id"], user["user_id"])
    if project["owner_id"] != user["user_id"] and role not in ("OWNER", "COORDINATOR"):
        raise HTTPException(status_code=403, detail="Vous n'êtes pas coordinateur de ce projet")


async def task_history(task_id: str, user: dict, action: str, old_value=None, new_value=None, comment=None):
    await db.task_history.insert_one({
        "history_id": new_id("th"), "task_id": task_id, "user_id": user["user_id"],
        "user_name": await display_name(user["user_id"]), "action": action,
        "old_value": old_value, "new_value": new_value, "comment": comment, "timestamp": iso(now_utc()),
    })


async def refresh_progress(project_id: str):
    total = await db.tasks.count_documents({"project_id": project_id, "status": {"$nin": ["CANCELLED", "ARCHIVED"]}})
    done = await db.tasks.count_documents({"project_id": project_id, "status": "COMPLETED"})
    pct = int(round(done * 100 / total)) if total else 0
    await db.projects.update_one({"project_id": project_id},
                                 {"$set": {"completion_percentage": pct, "updated_at": iso(now_utc())}})
    return pct


# ---------------------------------------------------------------- Projets
@router.get("/projects/meta/templates")
async def list_templates(user: dict = Depends(active_user)):
    return {"templates": [{"key": k, **v} for k, v in TEMPLATES.items()],
            "categories": PROJECT_CATEGORIES, "statuses": PROJECT_STATUSES,
            "visibility_modes": VISIBILITY_MODES, "project_roles": PROJECT_ROLES}


@router.get("/projects")
async def list_projects(status: Optional[str] = None, category: Optional[str] = None,
                        q: Optional[str] = None, mine: bool = False, overdue: bool = False,
                        include_archived: bool = False, limit: int = 200,
                        user: dict = Depends(require("projects.view"))):
    query = await visible_project_filter(user)
    filters = []
    if query:
        filters.append(query)
    if status:
        filters.append({"status": status})
    elif not include_archived:
        filters.append({"status": {"$ne": "ARCHIVED"}})
    if category:
        filters.append({"category": category})
    if q:
        filters.append({"title": {"$regex": q, "$options": "i"}})
    if overdue:
        filters.append({"deadline": {"$lt": iso(now_utc()), "$ne": None}})
        filters.append({"status": {"$nin": ["COMPLETED", "ARCHIVED"]}})
    if mine:
        team_ids = [t["project_id"] async for t in db.project_teams.find(
            {"member_id": user["user_id"], "status": "ACTIVE"}, {"_id": 0, "project_id": 1})]
        filters.append({"$or": [{"owner_id": user["user_id"]}, {"project_id": {"$in": team_ids}}]})
    final = {"$and": filters} if filters else {}
    items = await db.projects.find(final, {"_id": 0}).sort("updated_at", -1).limit(limit).to_list(limit)
    owner_ids = list({p["owner_id"] for p in items if p.get("owner_id")})
    names = {p["user_id"]: p.get("display_name") async for p in db.profiles.find(
        {"user_id": {"$in": owner_ids}}, {"_id": 0, "user_id": 1, "display_name": 1})}
    for p in items:
        p["owner_name"] = names.get(p.get("owner_id"))
        p["open_tasks"] = await db.tasks.count_documents(
            {"project_id": p["project_id"], "status": {"$in": ["TODO", "IN_PROGRESS", "WAITING", "BLOCKED"]}})
    return {"items": items, "total": len(items)}


@router.post("/projects")
async def create_project(payload: ProjectIn, user: dict = Depends(require("projects.create"))):
    if payload.status not in PROJECT_STATUSES:
        raise HTTPException(status_code=400, detail="Statut de projet invalide")
    if payload.visibility not in VISIBILITY_MODES:
        raise HTTPException(status_code=400, detail="Mode de visibilité invalide")
    owner_id = payload.owner_id if (payload.owner_id and user["role"] == ROLE_ADMIN) else user["user_id"]
    project_id = new_id("prj")
    doc = {
        "project_id": project_id, "title": payload.title,
        "slug": payload.title.lower().replace(" ", "-")[:60],
        "description": payload.description, "category": payload.category, "status": payload.status,
        "priority": payload.priority, "start_date": payload.start_date, "deadline": payload.deadline,
        "completion_percentage": 0, "owner_id": owner_id, "visibility": payload.visibility,
        "parent_project_id": payload.parent_project_id, "mindmap_node_id": None,
        "budget_reference": None, "linked_partner_ids": [], "linked_event_ids": [], "linked_activity_ids": [],
        "needs_help": False, "template": payload.template,
        "created_by": user["user_id"], "created_at": iso(now_utc()), "updated_at": iso(now_utc()),
        "archived_at": None,
    }
    await db.projects.insert_one(doc)
    await db.project_teams.insert_one({
        "team_id": new_id("tm"), "project_id": project_id, "member_id": owner_id,
        "role_in_project": "OWNER", "participation_level": "PILOTE",
        "joined_at": iso(now_utc()), "status": "ACTIVE"})
    if payload.template and payload.template in TEMPLATES:
        for title in TEMPLATES[payload.template]["tasks"]:
            await db.tasks.insert_one(_blank_task(project_id, title, user["user_id"]))
    await log_action(user, "CREATE", "projects", project_id, new_value={"title": payload.title})
    await refresh_progress(project_id)
    return await db.projects.find_one({"project_id": project_id}, {"_id": 0})


def _blank_task(project_id: str, title: str, created_by: str) -> dict:
    return {
        "task_id": new_id("tsk"), "project_id": project_id, "parent_task_id": None, "title": title,
        "description": None, "status": "TODO", "priority": "NORMAL", "assigned_user_id": None,
        "assigned_team_id": None, "created_by": created_by, "deadline": None, "completed_at": None,
        "submitted_at": None, "submitted_by": None, "validated_at": None, "validated_by": None,
        "rejection_reason": None, "proof": None, "attachments": [], "comments": [],
        "visibility": "PROJECT_TEAM", "is_volunteer_task": False, "needs_help": False,
        "blocked_by_task_id": None, "created_at": iso(now_utc()), "updated_at": iso(now_utc()),
    }


@router.get("/projects/{project_id}")
async def get_project(project_id: str, user: dict = Depends(require("projects.view"))):
    project = await get_visible_project(project_id, user)
    tasks = await db.tasks.find({"project_id": project_id}, {"_id": 0}).sort("created_at", 1).to_list(500)
    if user["role"] != ROLE_ADMIN and not await team_role(project_id, user["user_id"]) \
            and project["owner_id"] != user["user_id"]:
        tasks = [t for t in tasks if t["is_volunteer_task"] or t["assigned_user_id"] == user["user_id"]]
    team = await db.project_teams.find({"project_id": project_id, "status": "ACTIVE"}, {"_id": 0}).to_list(100)
    member_ids = [t["member_id"] for t in team] + [t["assigned_user_id"] for t in tasks if t.get("assigned_user_id")]
    profiles = {p["user_id"]: p async for p in db.profiles.find(
        {"user_id": {"$in": list(set(member_ids))}}, {"_id": 0, "user_id": 1, "display_name": 1, "membership_type": 1})}
    for m in team:
        m["display_name"] = (profiles.get(m["member_id"]) or {}).get("display_name")
    for t in tasks:
        t["assignee_name"] = (profiles.get(t.get("assigned_user_id")) or {}).get("display_name")
    sub_projects = await db.projects.find({"parent_project_id": project_id}, {"_id": 0}).to_list(50)
    project["owner_name"] = (profiles.get(project["owner_id"]) or {}).get("display_name") \
        or await display_name(project["owner_id"])
    return {"project": project, "tasks": tasks, "team": team, "sub_projects": sub_projects,
            "my_team_role": await team_role(project_id, user["user_id"])}


@router.put("/projects/{project_id}")
async def update_project(project_id: str, payload: ProjectUpdate, user: dict = Depends(active_user)):
    project = await get_visible_project(project_id, user)
    await assert_can_manage_project(project, user)
    updates = payload.model_dump(exclude_none=True)
    if "status" in updates and updates["status"] not in PROJECT_STATUSES:
        raise HTTPException(status_code=400, detail="Statut de projet invalide")
    if "visibility" in updates and updates["visibility"] not in VISIBILITY_MODES:
        raise HTTPException(status_code=400, detail="Mode de visibilité invalide")
    if "visibility" in updates and user["role"] != ROLE_ADMIN:
        raise HTTPException(status_code=403, detail="Seul le Bureau modifie la visibilité")
    if not updates:
        raise HTTPException(status_code=400, detail="Aucune modification fournie")
    updates["updated_at"] = iso(now_utc())
    await db.projects.update_one({"project_id": project_id}, {"$set": updates})
    await log_action(user, "UPDATE", "projects", project_id,
                     old_value={k: project.get(k) for k in updates}, new_value=updates)
    return await db.projects.find_one({"project_id": project_id}, {"_id": 0})


@router.post("/projects/{project_id}/archive")
async def archive_project(project_id: str, user: dict = Depends(require("projects.archive"))):
    project = await get_visible_project(project_id, user)
    await assert_can_manage_project(project, user)
    await db.projects.update_one({"project_id": project_id},
                                 {"$set": {"status": "ARCHIVED", "archived_at": iso(now_utc()),
                                           "updated_at": iso(now_utc())}})
    await log_action(user, "ARCHIVE", "projects", project_id)
    return {"ok": True}


@router.delete("/projects/{project_id}")
async def delete_project(project_id: str, admin: dict = Depends(require_admin)):
    project = await db.projects.find_one({"project_id": project_id})
    if not project:
        raise HTTPException(status_code=404, detail="Projet introuvable")
    await db.projects.delete_one({"project_id": project_id})
    await db.tasks.delete_many({"project_id": project_id})
    await db.project_teams.delete_many({"project_id": project_id})
    await log_action(admin, "DELETE", "projects", project_id, old_value={"title": project["title"]})
    return {"ok": True}


@router.post("/projects/{project_id}/team")
async def add_team_member(project_id: str, payload: TeamIn, user: dict = Depends(active_user)):
    project = await get_visible_project(project_id, user)
    await assert_can_manage_project(project, user)
    if payload.role_in_project not in PROJECT_ROLES:
        raise HTTPException(status_code=400, detail="Rôle projet invalide")
    member = await db.users.find_one({"user_id": payload.member_id, "status": "ACTIVE"})
    if not member:
        raise HTTPException(status_code=404, detail="Membre introuvable ou inactif")
    if await db.project_teams.find_one({"project_id": project_id, "member_id": payload.member_id, "status": "ACTIVE"}):
        raise HTTPException(status_code=400, detail="Ce membre fait déjà partie de l'équipe")
    await db.project_teams.insert_one({
        "team_id": new_id("tm"), "project_id": project_id, "member_id": payload.member_id,
        "role_in_project": payload.role_in_project, "participation_level": payload.participation_level,
        "joined_at": iso(now_utc()), "status": "ACTIVE"})
    await log_action(user, "ADD_MEMBER", "projects", project_id, new_value={"member_id": payload.member_id})
    await notify(payload.member_id, type="NEW_COLLABORATIVE_PROJECT", title="Vous rejoignez un projet",
                 message=f"{project['title']} — rôle : {payload.role_in_project}", level="INFO",
                 resource_type="project", resource_id=project_id, link=f"/projects/{project_id}")
    return {"ok": True}


@router.delete("/projects/{project_id}/team/{member_id}")
async def remove_team_member(project_id: str, member_id: str, user: dict = Depends(active_user)):
    project = await get_visible_project(project_id, user)
    await assert_can_manage_project(project, user)
    if member_id == project["owner_id"]:
        raise HTTPException(status_code=400, detail="Le responsable ne peut pas être retiré")
    await db.project_teams.update_one({"project_id": project_id, "member_id": member_id},
                                     {"$set": {"status": "INACTIVE"}})
    await log_action(user, "REMOVE_MEMBER", "projects", project_id, old_value={"member_id": member_id})
    return {"ok": True}


async def _notify_concerned(project_id: str, author: dict, *, title: str, message: str, link: str, extra=None):
    """Notifie les membres concernés par le projet (équipe active + responsables) hors auteur."""
    ids = {t["member_id"] async for t in db.project_teams.find(
        {"project_id": project_id, "status": "ACTIVE"}, {"_id": 0, "member_id": 1})}
    project = await db.projects.find_one({"project_id": project_id}, {"_id": 0, "owner_id": 1, "created_by": 1,
                                                                    "referent_id": 1})
    for k in ("owner_id", "created_by", "referent_id"):
        if project and project.get(k):
            ids.add(project[k])
    ids.update([e for e in (extra or []) if e])
    ids.discard(author["user_id"])
    async for u in db.users.find({"user_id": {"$in": list(ids)}, "status": "ACTIVE", "role": {"$ne": ROLE_ADMIN}},
                                 {"_id": 0, "user_id": 1}):
        await notify(u["user_id"], type="HELP_REQUEST", title=title, message=message, level="ACTION",
                     resource_type="project", resource_id=project_id, link=link)


@router.post("/projects/{project_id}/join-request")
async def request_join(project_id: str, payload: CommentIn, user: dict = Depends(active_user)):
    project = await get_visible_project(project_id, user)
    name = await display_name(user["user_id"])
    await notify_bureau(type="VOLUNTEER_REQUEST", title="Demande pour rejoindre un projet",
                        message=f"{name} souhaite rejoindre « {project['title']} » : {payload.comment}",
                        level="ACTION", resource_type="project", resource_id=project_id,
                        link=f"/projects/{project_id}")
    await _notify_concerned(project_id, user, title="Proposition sur un projet",
                            message=f"{name} propose de rejoindre « {project['title']} » : {payload.comment}",
                            link=f"/projects/{project_id}")
    await log_action(user, "JOIN_REQUEST", "projects", project_id, comment=payload.comment)
    return {"ok": True}


# ---------------------------------------------------------------- Tâches
@router.get("/tasks")
async def list_tasks(project_id: Optional[str] = None, status: Optional[str] = None, mine: bool = False,
                     overdue: bool = False, volunteer: bool = False, limit: int = 300,
                     user: dict = Depends(require("tasks.view"))):
    filters = []
    if project_id:
        await get_visible_project(project_id, user)
        filters.append({"project_id": project_id})
    if status:
        filters.append({"status": status})
    else:
        filters.append({"status": {"$nin": ["ARCHIVED", "CANCELLED"]}})
    if mine:
        filters.append({"assigned_user_id": user["user_id"]})
    if volunteer:
        filters.append({"is_volunteer_task": True})
    if overdue:
        filters.append({"deadline": {"$lt": iso(now_utc()), "$ne": None}})
        filters.append({"status": {"$nin": ["COMPLETED", "ARCHIVED", "CANCELLED"]}})
    if user["role"] != ROLE_ADMIN:
        visible = await db.projects.find(await visible_project_filter(user), {"_id": 0, "project_id": 1}).to_list(500)
        pids = [p["project_id"] for p in visible]
        scope = [{"assigned_user_id": user["user_id"]}]
        if user["role"] == ROLE_PRO:
            scope.append({"project_id": {"$in": pids}})
        else:
            scope.append({"project_id": {"$in": pids}, "is_volunteer_task": True})
        filters.append({"$or": scope})
    query = {"$and": filters} if filters else {}
    items = await db.tasks.find(query, {"_id": 0}).sort("deadline", 1).limit(limit).to_list(limit)
    pids = list({t["project_id"] for t in items})
    projects = {p["project_id"]: p["title"] async for p in db.projects.find(
        {"project_id": {"$in": pids}}, {"_id": 0, "project_id": 1, "title": 1})}
    uids = list({t["assigned_user_id"] for t in items if t.get("assigned_user_id")})
    names = {p["user_id"]: p.get("display_name") async for p in db.profiles.find(
        {"user_id": {"$in": uids}}, {"_id": 0, "user_id": 1, "display_name": 1})}
    blocked_ids = list({t["blocked_by_task_id"] for t in items if t.get("blocked_by_task_id")})
    blockers = {t["task_id"]: t["title"] async for t in db.tasks.find(
        {"task_id": {"$in": blocked_ids}}, {"_id": 0, "task_id": 1, "title": 1})}
    for t in items:
        t["project_title"] = projects.get(t["project_id"])
        t["assignee_name"] = names.get(t.get("assigned_user_id"))
        t["blocked_by_title"] = blockers.get(t.get("blocked_by_task_id"))
    return {"items": items, "total": len(items)}


@router.get("/tasks/pending-validation")
async def pending_validation(admin: dict = Depends(require("tasks.validate"))):
    items = await db.tasks.find({"status": "PENDING_VALIDATION"}, {"_id": 0}).sort("submitted_at", 1).to_list(200)
    pids = list({t["project_id"] for t in items})
    projects = {p["project_id"]: p["title"] async for p in db.projects.find(
        {"project_id": {"$in": pids}}, {"_id": 0, "project_id": 1, "title": 1})}
    for t in items:
        t["project_title"] = projects.get(t["project_id"])
        t["submitted_by_name"] = await display_name(t.get("submitted_by") or t.get("assigned_user_id") or "")
    return {"items": items, "total": len(items)}


@router.post("/tasks")
async def create_task(payload: TaskIn, user: dict = Depends(active_user)):
    project = await get_visible_project(payload.project_id, user)
    await assert_can_manage_tasks(project, user)
    doc = _blank_task(payload.project_id, payload.title, user["user_id"])
    doc.update({
        "description": payload.description, "parent_task_id": payload.parent_task_id,
        "priority": payload.priority, "deadline": payload.deadline,
        "assigned_user_id": payload.assigned_user_id, "is_volunteer_task": payload.is_volunteer_task,
        "visibility": payload.visibility, "blocked_by_task_id": payload.blocked_by_task_id,
        "google_forms_url": payload.google_forms_url,
    })
    await db.tasks.insert_one(doc)
    await task_history(doc["task_id"], user, "CREATE", new_value={"title": payload.title})
    await log_action(user, "CREATE", "tasks", doc["task_id"], new_value={"title": payload.title})
    await refresh_progress(payload.project_id)
    if payload.assigned_user_id:
        await notify(payload.assigned_user_id, type="TASK_ASSIGNED", title="Nouvelle tâche attribuée",
                     message=f"{payload.title} — projet {project['title']}", level="ACTION",
                     resource_type="task", resource_id=doc["task_id"], link=f"/projects/{payload.project_id}")
    return {k: v for k, v in doc.items() if k != "_id"}


async def _get_task(task_id: str) -> dict:
    task = await db.tasks.find_one({"task_id": task_id}, {"_id": 0})
    if not task:
        raise HTTPException(status_code=404, detail="Tâche introuvable")
    return task


@router.put("/tasks/{task_id}")
async def update_task(task_id: str, payload: TaskUpdate, user: dict = Depends(active_user)):
    task = await _get_task(task_id)
    project = await get_visible_project(task["project_id"], user)
    updates = payload.model_dump(exclude_none=True)
    if "status" in updates and updates["status"] not in TASK_STATUSES:
        raise HTTPException(status_code=400, detail="Statut de tâche invalide")
    is_assignee = task["assigned_user_id"] == user["user_id"]
    self_allowed = {"status"} if is_assignee else set()
    if not set(updates).issubset(self_allowed):
        await assert_can_manage_tasks(project, user)
    if is_assignee and set(updates) == {"status"} and user["role"] != ROLE_ADMIN:
        if updates["status"] not in ["IN_PROGRESS", "WAITING", "BLOCKED", "TODO"]:
            raise HTTPException(status_code=403, detail="Utilisez « Soumettre » pour faire valider la tâche")
    if not updates:
        raise HTTPException(status_code=400, detail="Aucune modification fournie")
    updates["updated_at"] = iso(now_utc())
    await db.tasks.update_one({"task_id": task_id}, {"$set": updates})
    await task_history(task_id, user, "UPDATE", old_value={k: task.get(k) for k in updates}, new_value=updates)
    await log_action(user, "UPDATE", "tasks", task_id, new_value=updates)
    await refresh_progress(task["project_id"])
    if updates.get("assigned_user_id") and updates["assigned_user_id"] != task.get("assigned_user_id"):
        await notify(updates["assigned_user_id"], type="TASK_ASSIGNED", title="Nouvelle tâche attribuée",
                     message=f"{task['title']} — projet {project['title']}", level="ACTION",
                     resource_type="task", resource_id=task_id, link=f"/projects/{task['project_id']}")
    return await _get_task(task_id)


@router.post("/tasks/{task_id}/claim")
async def claim_task(task_id: str, user: dict = Depends(require("tasks.submit"))):
    task = await _get_task(task_id)
    await get_visible_project(task["project_id"], user)
    if not task["is_volunteer_task"]:
        raise HTTPException(status_code=403, detail="Cette tâche n'est pas ouverte au bénévolat")
    if task["assigned_user_id"] and task["assigned_user_id"] != user["user_id"]:
        raise HTTPException(status_code=400, detail="Cette tâche est déjà prise par un autre membre")
    await db.tasks.update_one({"task_id": task_id}, {"$set": {
        "assigned_user_id": user["user_id"], "status": "IN_PROGRESS", "updated_at": iso(now_utc())}})
    await task_history(task_id, user, "CLAIM", new_value={"assigned_user_id": user["user_id"]})
    await log_action(user, "CLAIM", "tasks", task_id)
    name = await display_name(user["user_id"])
    await notify_bureau(type="TASK_CLAIMED", title="Une tâche bénévole a été prise",
                        message=f"{name} prend en charge « {task['title']} »", level="INFO",
                        resource_type="task", resource_id=task_id, link=f"/projects/{task['project_id']}")
    return await _get_task(task_id)


@router.post("/tasks/{task_id}/submit")
async def submit_task(task_id: str, payload: SubmitIn, user: dict = Depends(require("tasks.submit"))):
    task = await _get_task(task_id)
    await get_visible_project(task["project_id"], user)
    if task["assigned_user_id"] != user["user_id"] and user["role"] != ROLE_ADMIN:
        raise HTTPException(status_code=403, detail="Cette tâche ne vous est pas attribuée")
    if task["status"] in ("COMPLETED", "ARCHIVED", "CANCELLED"):
        raise HTTPException(status_code=400, detail="Cette tâche est déjà clôturée")
    comments = task.get("comments", [])
    if payload.comment:
        comments.append({"comment_id": new_id("cmt"), "user_id": user["user_id"],
                         "user_name": await display_name(user["user_id"]), "text": payload.comment,
                         "created_at": iso(now_utc())})
    await db.tasks.update_one({"task_id": task_id}, {"$set": {
        "status": "PENDING_VALIDATION", "submitted_at": iso(now_utc()), "submitted_by": user["user_id"],
        "proof": payload.proof or task.get("proof"), "comments": comments,
        "needs_help": False, "updated_at": iso(now_utc())}})
    await task_history(task_id, user, "SUBMIT", new_value={"status": "PENDING_VALIDATION"}, comment=payload.comment)
    await log_action(user, "SUBMIT", "tasks", task_id, comment=payload.comment)
    name = await display_name(user["user_id"])
    await notify_bureau(type="TASK_TO_VALIDATE", title="Tâche à valider",
                        message=f"{name} a terminé « {task['title']} » et attend votre validation.",
                        level="ACTION", resource_type="task", resource_id=task_id, link="/admin/validation")
    return await _get_task(task_id)


@router.post("/tasks/{task_id}/validate")
async def validate_task(task_id: str, payload: ValidateIn, user: dict = Depends(require("tasks.validate"))):
    task = await _get_task(task_id)
    if task["status"] != "PENDING_VALIDATION":
        raise HTTPException(status_code=400, detail="Cette tâche n'attend pas de validation")
    if task.get("submitted_by") == user["user_id"] and user["role"] != ROLE_ADMIN:
        raise HTTPException(status_code=403, detail="Vous ne pouvez pas valider votre propre soumission")
    if payload.decision not in ("ACCEPT", "CHANGES"):
        raise HTTPException(status_code=400, detail="Décision invalide")
    if payload.decision == "ACCEPT":
        updates = {"status": "COMPLETED", "completed_at": iso(now_utc()), "validated_at": iso(now_utc()),
                   "validated_by": user["user_id"], "rejection_reason": None, "updated_at": iso(now_utc())}
        title, message, level = "Tâche validée", f"« {task['title']} » a été validée. Merci !", "SUCCESS"
    else:
        if not payload.comment:
            raise HTTPException(status_code=400, detail="Merci d'indiquer ce qui doit être modifié")
        updates = {"status": "IN_PROGRESS", "rejection_reason": payload.comment,
                   "validated_at": None, "validated_by": None, "updated_at": iso(now_utc())}
        title, message, level = "Modification demandée", f"« {task['title']} » : {payload.comment}", "WARNING"
    await db.tasks.update_one({"task_id": task_id}, {"$set": updates})
    await task_history(task_id, user, "VALIDATE" if payload.decision == "ACCEPT" else "REQUEST_CHANGES",
                       old_value={"status": task["status"]}, new_value={"status": updates["status"]},
                       comment=payload.comment)
    await log_action(user, "VALIDATE" if payload.decision == "ACCEPT" else "REQUEST_CHANGES", "tasks",
                     task_id, comment=payload.comment)
    await refresh_progress(task["project_id"])
    recipient = task.get("submitted_by") or task.get("assigned_user_id")
    if recipient:
        await notify(recipient, type="TASK_VALIDATED", title=title, message=message, level=level,
                     resource_type="task", resource_id=task_id, link=f"/projects/{task['project_id']}")
    return await _get_task(task_id)


@router.post("/tasks/{task_id}/comment")
async def comment_task(task_id: str, payload: CommentIn, user: dict = Depends(require("tasks.view"))):
    task = await _get_task(task_id)
    await get_visible_project(task["project_id"], user)
    comment = {"comment_id": new_id("cmt"), "user_id": user["user_id"],
               "user_name": await display_name(user["user_id"]), "text": payload.comment,
               "created_at": iso(now_utc())}
    await db.tasks.update_one({"task_id": task_id},
                             {"$push": {"comments": comment}, "$set": {"updated_at": iso(now_utc())}})
    await task_history(task_id, user, "COMMENT", comment=payload.comment)
    return comment


@router.post("/tasks/{task_id}/help")
async def task_needs_help(task_id: str, payload: CommentIn, user: dict = Depends(require("tasks.view"))):
    task = await _get_task(task_id)
    await get_visible_project(task["project_id"], user)
    await db.tasks.update_one({"task_id": task_id},
                             {"$set": {"needs_help": True, "updated_at": iso(now_utc())}})
    await task_history(task_id, user, "NEEDS_HELP", comment=payload.comment)
    doc = {
        "help_id": new_id("help"), "type": "NEEDS_HELP", "user_id": user["user_id"],
        "user_name": await display_name(user["user_id"]), "message": payload.comment, "skills": [],
        "context_type": "task", "context_id": task_id, "status": "OPEN",
        "response": None, "handled_by": None, "created_at": iso(now_utc()), "resolved_at": None,
    }
    await db.help_requests.insert_one(doc)
    await notify_bureau(type="NEEDS_HELP", title="Un membre a besoin d'aide",
                        message=f"{doc['user_name']} sur « {task['title']} » : {payload.comment}",
                        level="ACTION", resource_type="task", resource_id=task_id, link="/admin/help")
    await _notify_concerned(task["project_id"], user, extra=[task.get("assigned_user_id")],
                            title="Demande d'aide sur une tâche",
                            message=f"{doc['user_name']} demande de l'aide sur « {task['title']} » : {payload.comment}",
                            link=f"/projects/{task['project_id']}")
    return {k: v for k, v in doc.items() if k != "_id"}


@router.delete("/tasks/{task_id}")
async def delete_task(task_id: str, admin: dict = Depends(require_admin)):
    task = await _get_task(task_id)
    await db.tasks.delete_one({"task_id": task_id})
    await log_action(admin, "DELETE", "tasks", task_id, old_value={"title": task["title"]})
    await refresh_progress(task["project_id"])
    return {"ok": True}


@router.get("/tasks/{task_id}/history")
async def get_task_history(task_id: str, user: dict = Depends(require("tasks.view"))):
    task = await _get_task(task_id)
    await get_visible_project(task["project_id"], user)
    items = await db.task_history.find({"task_id": task_id}, {"_id": 0}).sort("timestamp", -1).to_list(200)
    return {"items": items}


# ---------------------------------------------------------------- Aide (sans jugement)
@router.get("/help-requests/meta/skills")
async def help_skills(user: dict = Depends(active_user)):
    return {"skills": HELP_SKILLS}


@router.post("/help-requests")
async def create_help_request(payload: HelpIn, user: dict = Depends(active_user)):
    if payload.type not in ("NEEDS_HELP", "CAN_HELP"):
        raise HTTPException(status_code=400, detail="Type invalide")
    doc = {
        "help_id": new_id("help"), "type": payload.type, "user_id": user["user_id"],
        "user_name": await display_name(user["user_id"]), "message": payload.message,
        "skills": [s for s in payload.skills if s in HELP_SKILLS],
        "context_type": payload.context_type, "context_id": payload.context_id, "status": "OPEN",
        "response": None, "handled_by": None, "created_at": iso(now_utc()), "resolved_at": None,
    }
    await db.help_requests.insert_one(doc)
    await log_action(user, "CREATE", "help_requests", doc["help_id"], new_value={"type": payload.type})
    is_need = payload.type == "NEEDS_HELP"
    await notify_bureau(
        type="NEEDS_HELP" if is_need else "HELP_OFFER",
        title="Un membre a besoin d'aide" if is_need else "Proposition d'aide",
        message=f"{doc['user_name']} : {payload.message}", level="ACTION",
        resource_type="help_request", resource_id=doc["help_id"], link="/admin/help")
    return {k: v for k, v in doc.items() if k != "_id"}


@router.get("/help-requests")
async def list_help_requests(status: Optional[str] = None, mine: bool = False, user: dict = Depends(active_user)):
    query = {}
    if status:
        query["status"] = status
    if user["role"] != ROLE_ADMIN or mine:
        query["user_id"] = user["user_id"]
    items = await db.help_requests.find(query, {"_id": 0}).sort("created_at", -1).limit(200).to_list(200)
    return {"items": items, "total": len(items)}


@router.put("/help-requests/{help_id}")
async def resolve_help_request(help_id: str, payload: dict, admin: dict = Depends(require_admin)):
    doc = await db.help_requests.find_one({"help_id": help_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Demande introuvable")
    status = payload.get("status", "HANDLED")
    if status not in ("OPEN", "HANDLED", "RESOLVED", "ARCHIVED"):
        raise HTTPException(status_code=400, detail="Statut invalide")
    await db.help_requests.update_one({"help_id": help_id}, {"$set": {
        "status": status, "response": payload.get("response"), "handled_by": admin["user_id"],
        "resolved_at": iso(now_utc()) if status in ("RESOLVED", "ARCHIVED") else None}})
    await log_action(admin, "UPDATE", "help_requests", help_id, new_value={"status": status})
    await notify(doc["user_id"], type="HELP_ACCEPTED", title="Le Bureau a répondu à votre demande",
                 message=payload.get("response") or f"Votre demande est maintenant : {status}",
                 level="SUCCESS", resource_type="help_request", resource_id=help_id, link="/help")
    return await db.help_requests.find_one({"help_id": help_id}, {"_id": 0})
