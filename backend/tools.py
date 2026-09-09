"""Prompt 9 — Outils externes de l'association & liens externes sur tâches/projets."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

import rbac
from rbac import ROLE_ADMIN
from deps import db, iso, now_utc, new_id, active_user, require_admin, log_action

router = APIRouter(prefix="/api")

_RESOURCES = {"projects": ("project_id", "projects.view"), "tasks": ("task_id", "tasks.view")}


class ToolIn(BaseModel):
    label: str = Field(min_length=2, max_length=60)
    url: str = Field(min_length=4)
    icon: Optional[str] = None


class DriveResIn(BaseModel):
    label: str = Field(min_length=2, max_length=80)
    url: str = Field(min_length=4)
    kind: str = "folder"  # folder | document


class LinkIn(BaseModel):
    label: str = Field(min_length=2, max_length=80)
    url: str = Field(min_length=4)


_LINK_FIELDS = {"external": "external_links", "drive": "drive_links"}


def _check_url(url: str):
    if not url.startswith("http"):
        raise HTTPException(status_code=400, detail="Le lien doit commencer par http")


# ---------------------------------------------------------------- Outils externes de l'association
@router.get("/external-tools")
async def list_tools(user: dict = Depends(active_user)):
    items = await db.external_tools.find({}, {"_id": 0}).sort("created_at", 1).to_list(100)
    return {"items": items}


@router.post("/external-tools")
async def create_tool(payload: ToolIn, admin: dict = Depends(require_admin)):
    _check_url(payload.url)
    doc = {"tool_id": new_id("tool"), "label": payload.label, "url": payload.url,
           "icon": payload.icon or "link", "created_by": admin["user_id"], "created_at": iso(now_utc())}
    await db.external_tools.insert_one(dict(doc))
    await log_action(admin, "CREATE", "external_tools", doc["tool_id"], new_value={"label": payload.label})
    return doc


@router.delete("/external-tools/{tool_id}")
async def delete_tool(tool_id: str, admin: dict = Depends(require_admin)):
    res = await db.external_tools.delete_one({"tool_id": tool_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Outil introuvable")
    await log_action(admin, "DELETE", "external_tools", tool_id)
    return {"ok": True}


# ---------------------------------------------------------------- Liens externes sur tâches & projets
async def _get_resource(kind: str, resource_id: str, user: dict):
    if kind not in _RESOURCES:
        raise HTTPException(status_code=404, detail="Type d'élément inconnu")
    key, perm = _RESOURCES[kind]
    if not rbac.has_permission(user, perm):
        raise HTTPException(status_code=403, detail="Accès refusé")
    collection = getattr(db, kind)
    doc = await collection.find_one({key: resource_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Élément introuvable")
    return collection, key, doc


@router.post("/{kind}/{resource_id}/links")
async def add_link(kind: str, resource_id: str, payload: LinkIn, channel: str = "external",
                   user: dict = Depends(active_user)):
    _check_url(payload.url)
    field = _LINK_FIELDS.get(channel, "external_links")
    collection, key, _ = await _get_resource(kind, resource_id, user)
    link = {"link_id": new_id("lnk"), "label": payload.label, "url": payload.url,
            "added_by": user["user_id"], "created_at": iso(now_utc())}
    await collection.update_one({key: resource_id},
                                {"$push": {field: link}, "$set": {"updated_at": iso(now_utc())}})
    await log_action(user, "ADD_LINK", kind, resource_id, new_value={"label": payload.label, "channel": channel})
    return link


@router.delete("/{kind}/{resource_id}/links/{link_id}")
async def remove_link(kind: str, resource_id: str, link_id: str, channel: str = "external",
                      user: dict = Depends(active_user)):
    field = _LINK_FIELDS.get(channel, "external_links")
    collection, key, doc = await _get_resource(kind, resource_id, user)
    link = next((l for l in (doc.get(field) or []) if l["link_id"] == link_id), None)
    if not link:
        raise HTTPException(status_code=404, detail="Lien introuvable")
    if user["role"] != ROLE_ADMIN and link.get("added_by") != user["user_id"] \
            and doc.get("created_by") != user["user_id"] and doc.get("owner_id") != user["user_id"]:
        raise HTTPException(status_code=403, detail="Vous ne pouvez pas retirer ce lien")
    await collection.update_one({key: resource_id},
                                {"$pull": {field: {"link_id": link_id}},
                                 "$set": {"updated_at": iso(now_utc())}})
    await log_action(user, "REMOVE_LINK", kind, resource_id)
    return {"ok": True}


# ---------------------------------------------------------------- Dossiers/documents Google Drive de l'asso
@router.get("/drive/resources")
async def list_drive(user: dict = Depends(active_user)):
    items = await db.drive_resources.find({}, {"_id": 0}).sort("created_at", 1).to_list(200)
    return {"items": items}


@router.post("/drive/resources")
async def create_drive(payload: DriveResIn, admin: dict = Depends(require_admin)):
    _check_url(payload.url)
    kind = payload.kind if payload.kind in ("folder", "document") else "folder"
    doc = {"resource_id": new_id("drv"), "label": payload.label, "url": payload.url, "kind": kind,
           "created_by": admin["user_id"], "created_at": iso(now_utc())}
    await db.drive_resources.insert_one(dict(doc))
    await log_action(admin, "CREATE", "drive_resources", doc["resource_id"], new_value={"label": payload.label})
    return doc


@router.delete("/drive/resources/{resource_id}")
async def delete_drive(resource_id: str, admin: dict = Depends(require_admin)):
    res = await db.drive_resources.delete_one({"resource_id": resource_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Ressource introuvable")
    await log_action(admin, "DELETE", "drive_resources", resource_id)
    return {"ok": True}
