"""Statistiques stratégiques (mois / trimestre / année) et mindmap de l'association."""
from datetime import timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

import rbac
from rbac import ROLE_ADMIN, ROLE_PRO
from deps import (db, iso, now_utc, new_id, active_user, require, require_admin, log_action)

router = APIRouter(prefix="/api")

PERIODS = {"month": 30, "quarter": 90, "year": 365}


def bucket(date_str: str, period: str) -> str:
    if not date_str:
        return "?"
    ym = date_str[:7]
    if period == "month":
        return date_str[:10]
    if period == "quarter":
        return ym
    return ym


def buckets_for(period: str) -> List[str]:
    today = now_utc()
    labels = []
    if period == "month":
        for i in range(29, -1, -1):
            labels.append(iso(today - timedelta(days=i))[:10])
    elif period == "quarter":
        seen = []
        for i in range(89, -1, -1):
            label = iso(today - timedelta(days=i))[:7]
            if label not in seen:
                seen.append(label)
        labels = seen
    else:
        seen = []
        for i in range(364, -1, -1):
            label = iso(today - timedelta(days=i))[:7]
            if label not in seen:
                seen.append(label)
        labels = seen
    return labels


async def series(collection, date_field: str, period: str, extra: dict = None) -> dict:
    since = iso(now_utc() - timedelta(days=PERIODS[period]))
    query = {date_field: {"$gte": since}}
    query.update(extra or {})
    counts = {label: 0 for label in buckets_for(period)}
    async for doc in collection.find(query, {"_id": 0, date_field: 1}):
        label = bucket(doc.get(date_field) or "", period)
        if label in counts:
            counts[label] += 1
    return counts


@router.get("/stats")
async def stats(period: str = "month", user: dict = Depends(require("stats.view"))):
    if period not in PERIODS:
        raise HTTPException(status_code=400, detail="Période invalide (month, quarter, year)")
    since = iso(now_utc() - timedelta(days=PERIODS[period]))
    members_series = await series(db.users, "created_at", period)
    tasks_series = await series(db.tasks, "completed_at", period, {"status": "COMPLETED"})
    projects_series = await series(db.projects, "created_at", period)
    participations_series = await series(db.participations, "registered_at", period)
    stamps_series = await series(db.loyalty_stamps, "created_at", period)

    labels = buckets_for(period)
    chart = [{
        "label": label,
        "membres": members_series.get(label, 0),
        "taches": tasks_series.get(label, 0),
        "projets": projects_series.get(label, 0),
        "participations": participations_series.get(label, 0),
        "tampons": stamps_series.get(label, 0),
    } for label in labels]

    active_pros = await db.users.count_documents({"role": ROLE_PRO, "status": "ACTIVE"})
    volunteer_ids = await db.tasks.distinct("assigned_user_id", {"is_volunteer_task": True,
                                                                "assigned_user_id": {"$ne": None}})
    categories = {}
    async for p in db.projects.find({}, {"_id": 0, "category": 1}):
        categories[p.get("category") or "AUTRE"] = categories.get(p.get("category") or "AUTRE", 0) + 1

    return {
        "period": period,
        "chart": chart,
        "totals": {
            "active_professionals": active_pros,
            "active_members": await db.users.count_documents({"role": "PARTICULIER", "status": "ACTIVE"}),
            "new_members": await db.users.count_documents({"created_at": {"$gte": since}}),
            "projects": await db.projects.count_documents({}),
            "projects_completed": await db.projects.count_documents({"status": "COMPLETED"}),
            "tasks_completed": await db.tasks.count_documents({"status": "COMPLETED"}),
            "active_volunteers": len(volunteer_ids),
            "activities": await db.activities.count_documents({}),
            "events": await db.events.count_documents({}),
            "participations": await db.participations.count_documents({}),
            "professional_profiles": await db.professional_details.count_documents({}),
            "loyalty_cards": await db.loyalty_cards.count_documents({}),
            "loyalty_points": sum([c.get("total_points", 0) async for c in
                                   db.loyalty_cards.find({}, {"_id": 0, "total_points": 1})]),
            "help_requests": await db.help_requests.count_documents({}),
            "help_resolved": await db.help_requests.count_documents({"status": "RESOLVED"}),
            "actions_logged": await db.audit_logs.count_documents({"timestamp": {"$gte": since}}),
        },
        "projects_by_category": [{"category": k, "count": v} for k, v in
                                 sorted(categories.items(), key=lambda x: -x[1])],
    }


# ---------------------------------------------------------------- Mindmap
DEFAULT_BRANCHES = [
    ("Gouvernance", "GOVERNANCE", "#800020"), ("Membres", "MEMBERS", "#002060"),
    ("Professionnels", "PROFESSIONALS", "#002060"), ("Particuliers", "MEMBERS", "#002060"),
    ("Activités", "ACTIVITIES", "#0f766e"), ("Événements", "EVENTS", "#0f766e"),
    ("Projets", "PROJECTS", "#800020"), ("Partenariats", "PARTNERS", "#7c3f00"),
    ("Mairies", "PARTNERS", "#7c3f00"), ("Associations", "PARTNERS", "#7c3f00"),
    ("Formations", "TRAINING", "#4c1d95"), ("Communication", "COMMUNICATION", "#4c1d95"),
    ("Blog", "BLOG", "#4c1d95"), ("Produits digitaux", "DIGITAL", "#4c1d95"),
    ("Pédagogie", "PEDAGOGY", "#0f766e"), ("Prévention", "PREVENTION", "#0f766e"),
    ("Terrain", "TERRAIN", "#7c3f00"), ("Stocks", "INVENTORY", "#334155"),
    ("Campagnes", "CAMPAIGNS", "#334155"), ("Finances", "FINANCE", "#334155"),
]


class NodeIn(BaseModel):
    label: str
    node_type: str = "BRANCH"
    status: Optional[str] = None
    progress: int = 0
    owner_id: Optional[str] = None
    color: Optional[str] = "#002060"
    icon: Optional[str] = None
    link: Optional[str] = None
    project_id: Optional[str] = None
    parent_id: Optional[str] = None
    x: float = 0
    y: float = 0
    visibility: str = "MEMBERS"


class NodeUpdate(BaseModel):
    label: Optional[str] = None
    status: Optional[str] = None
    progress: Optional[int] = None
    owner_id: Optional[str] = None
    color: Optional[str] = None
    icon: Optional[str] = None
    link: Optional[str] = None
    project_id: Optional[str] = None
    x: Optional[float] = None
    y: Optional[float] = None
    collapsed: Optional[bool] = None
    visibility: Optional[str] = None
    archived: Optional[bool] = None


async def seed_mindmap():
    if await db.mindmap_nodes.count_documents({}) > 0:
        return
    root_id = new_id("mnd")
    await db.mindmap_nodes.insert_one({
        "node_id": root_id, "label": "LA VOIX DU CHIEN", "node_type": "ROOT", "status": None,
        "progress": 0, "owner_id": None, "color": "#800020", "icon": "dog", "link": None,
        "project_id": None, "parent_id": None, "x": 0, "y": 0, "collapsed": False,
        "visibility": "MEMBERS", "archived": False,
        "created_at": iso(now_utc()), "updated_at": iso(now_utc())})
    import math
    for index, (label, node_type, color) in enumerate(DEFAULT_BRANCHES):
        angle = (2 * math.pi * index) / len(DEFAULT_BRANCHES)
        node_id = new_id("mnd")
        await db.mindmap_nodes.insert_one({
            "node_id": node_id, "label": label, "node_type": node_type, "status": "ACTIVE",
            "progress": 0, "owner_id": None, "color": color, "icon": None,
            "link": {"Projets": "/projects", "Activités": "/activities", "Événements": "/events",
                     "Membres": "/admin/members", "Professionnels": "/directory"}.get(label),
            "project_id": None, "parent_id": root_id,
            "x": round(520 * math.cos(angle)), "y": round(380 * math.sin(angle)),
            "collapsed": False, "visibility": "MEMBERS", "archived": False,
            "created_at": iso(now_utc()), "updated_at": iso(now_utc())})
        await db.mindmap_edges.insert_one({"edge_id": new_id("edg"), "source": root_id, "target": node_id,
                                          "created_at": iso(now_utc())})


@router.get("/mindmap")
async def get_mindmap(user: dict = Depends(require("mindmap.view"))):
    await seed_mindmap()
    query = {"archived": {"$ne": True}}
    if user["role"] != ROLE_ADMIN:
        allowed = ["MEMBERS", "PUBLIC"] if user["role"] != ROLE_PRO else ["PROFESSIONALS", "MEMBERS", "PUBLIC"]
        query["visibility"] = {"$in": allowed}
    nodes = await db.mindmap_nodes.find(query, {"_id": 0}).to_list(500)
    node_ids = {n["node_id"] for n in nodes}
    edges = [e async for e in db.mindmap_edges.find({}, {"_id": 0})
             if e["source"] in node_ids and e["target"] in node_ids]
    projects = await db.projects.find({"status": {"$ne": "ARCHIVED"}},
                                      {"_id": 0, "project_id": 1, "title": 1, "status": 1,
                                       "completion_percentage": 1, "category": 1}).to_list(300)
    return {"nodes": nodes, "edges": edges, "projects": projects,
            "can_edit": rbac.has_permission(user, "mindmap.edit")}


@router.post("/mindmap/nodes")
async def create_node(payload: NodeIn, user: dict = Depends(require("mindmap.edit"))):
    doc = {"node_id": new_id("mnd"), **payload.model_dump(), "collapsed": False, "archived": False,
           "created_at": iso(now_utc()), "updated_at": iso(now_utc())}
    await db.mindmap_nodes.insert_one(doc)
    if payload.parent_id:
        await db.mindmap_edges.insert_one({"edge_id": new_id("edg"), "source": payload.parent_id,
                                          "target": doc["node_id"], "created_at": iso(now_utc())})
    await log_action(user, "CREATE", "mindmap", doc["node_id"], new_value={"label": payload.label})
    return {k: v for k, v in doc.items() if k != "_id"}


@router.put("/mindmap/nodes/{node_id}")
async def update_node(node_id: str, payload: NodeUpdate, user: dict = Depends(require("mindmap.edit"))):
    node = await db.mindmap_nodes.find_one({"node_id": node_id}, {"_id": 0})
    if not node:
        raise HTTPException(status_code=404, detail="Nœud introuvable")
    updates = payload.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="Aucune modification fournie")
    updates["updated_at"] = iso(now_utc())
    await db.mindmap_nodes.update_one({"node_id": node_id}, {"$set": updates})
    if set(updates) - {"x", "y", "updated_at"}:
        await log_action(user, "UPDATE", "mindmap", node_id, new_value=updates)
    return await db.mindmap_nodes.find_one({"node_id": node_id}, {"_id": 0})


@router.delete("/mindmap/nodes/{node_id}")
async def archive_node(node_id: str, admin: dict = Depends(require_admin)):
    node = await db.mindmap_nodes.find_one({"node_id": node_id}, {"_id": 0})
    if not node:
        raise HTTPException(status_code=404, detail="Nœud introuvable")
    if node["node_type"] == "ROOT":
        raise HTTPException(status_code=400, detail="Le nœud central ne peut pas être archivé")
    await db.mindmap_nodes.update_one({"node_id": node_id}, {"$set": {"archived": True}})
    await log_action(admin, "ARCHIVE", "mindmap", node_id)
    return {"ok": True}


@router.post("/mindmap/edges")
async def create_edge(payload: dict, user: dict = Depends(require("mindmap.edit"))):
    source, target = payload.get("source"), payload.get("target")
    if not source or not target or source == target:
        raise HTTPException(status_code=400, detail="Lien invalide")
    for node_id in (source, target):
        if not await db.mindmap_nodes.find_one({"node_id": node_id}):
            raise HTTPException(status_code=404, detail="Nœud introuvable")
    if await db.mindmap_edges.find_one({"source": source, "target": target}):
        raise HTTPException(status_code=400, detail="Ce lien existe déjà")
    doc = {"edge_id": new_id("edg"), "source": source, "target": target, "created_at": iso(now_utc())}
    await db.mindmap_edges.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}


@router.delete("/mindmap/edges/{edge_id}")
async def delete_edge(edge_id: str, user: dict = Depends(require("mindmap.edit"))):
    res = await db.mindmap_edges.delete_one({"edge_id": edge_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Lien introuvable")
    return {"ok": True}
