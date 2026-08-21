"""Stockage de fichiers (Emergent Object Storage) : visuels, PDF, produits numériques."""
import os
import uuid
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, File, Header, HTTPException, Query, Response, UploadFile

from deps import db, iso, now_utc, new_id, active_user, resolve_user, log_action, logger
from rbac import ROLE_ADMIN

router = APIRouter(prefix="/api")

STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")
APP_NAME = "lavoixduchien"

MIME_BY_EXT = {
    "jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "gif": "image/gif",
    "webp": "image/webp", "pdf": "application/pdf", "csv": "text/csv", "txt": "text/plain",
    "zip": "application/zip", "epub": "application/epub+zip",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "mp3": "audio/mpeg", "mp4": "video/mp4",
}
IMAGE_EXT = {"jpg", "jpeg", "png", "gif", "webp"}
MAX_IMAGE_BYTES = 6 * 1024 * 1024
MAX_FILE_BYTES = 20 * 1024 * 1024

USAGES = ["AVATAR", "COVER", "ARTICLE", "FORMATION", "LIBRARY", "SOCIAL", "CONTEST", "ADVENT", "OTHER"]

_storage_key: Optional[str] = None


async def init_storage(force: bool = False) -> str:
    global _storage_key
    if _storage_key and not force:
        return _storage_key
    async with httpx.AsyncClient(timeout=30) as http:
        resp = await http.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY})
    resp.raise_for_status()
    _storage_key = resp.json()["storage_key"]
    return _storage_key


async def put_object(path: str, data: bytes, content_type: str) -> dict:
    key = await init_storage()
    async with httpx.AsyncClient(timeout=180) as http:
        resp = await http.put(f"{STORAGE_URL}/objects/{path}",
                              headers={"X-Storage-Key": key, "Content-Type": content_type}, content=data)
        if resp.status_code == 404:
            key = await init_storage(force=True)
            resp = await http.put(f"{STORAGE_URL}/objects/{path}",
                                  headers={"X-Storage-Key": key, "Content-Type": content_type}, content=data)
    resp.raise_for_status()
    return resp.json()


async def get_object(path: str) -> tuple:
    key = await init_storage()
    async with httpx.AsyncClient(timeout=120) as http:
        resp = await http.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key})
        if resp.status_code == 404:
            key = await init_storage(force=True)
            resp = await http.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key})
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")


async def file_meta(file_id: Optional[str]) -> Optional[dict]:
    if not file_id:
        return None
    return await db.files.find_one({"file_id": file_id, "is_deleted": False},
                                  {"_id": 0, "file_id": 1, "original_filename": 1, "content_type": 1, "size": 1})


@router.post("/files/upload")
async def upload_file(file: UploadFile = File(...), usage: str = Query("OTHER"),
                      user: dict = Depends(active_user)):
    if usage not in USAGES:
        raise HTTPException(status_code=400, detail="Usage de fichier inconnu")
    name = file.filename or "fichier"
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    if ext not in MIME_BY_EXT:
        raise HTTPException(status_code=400,
                            detail="Format non autorisé. Acceptés : images, PDF, documents bureautiques, zip, mp3, mp4.")
    data = await file.read()
    limit = MAX_IMAGE_BYTES if ext in IMAGE_EXT else MAX_FILE_BYTES
    if len(data) > limit:
        raise HTTPException(status_code=400,
                            detail=f"Fichier trop volumineux ({len(data) // 1024 // 1024} Mo). "
                                   f"Maximum : {limit // 1024 // 1024} Mo.")
    if not data:
        raise HTTPException(status_code=400, detail="Fichier vide")
    content_type = MIME_BY_EXT[ext]
    path = f"{APP_NAME}/{usage.lower()}/{user['user_id']}/{uuid.uuid4().hex}.{ext}"
    try:
        result = await put_object(path, data, content_type)
    except httpx.HTTPError as exc:
        logger.error(f"Upload échoué : {exc}")
        raise HTTPException(status_code=502, detail="Le stockage de fichiers est momentanément indisponible.")
    doc = {
        "file_id": new_id("file"), "storage_path": result["path"], "original_filename": name,
        "content_type": content_type, "size": result.get("size", len(data)), "usage": usage,
        "is_image": ext in IMAGE_EXT, "owner_id": user["user_id"], "is_deleted": False,
        "created_at": iso(now_utc()),
    }
    await db.files.insert_one(doc)
    await log_action(user, "UPLOAD", "files", doc["file_id"], new_value={"filename": name, "usage": usage})
    return {k: v for k, v in doc.items() if k not in ("_id", "storage_path")}


@router.get("/files/{file_id}/download")
async def download_file(file_id: str, download: bool = False,
                        authorization: str = Header(None), auth: str = Query(None)):
    token = auth or (authorization[7:] if authorization and authorization.startswith("Bearer ") else None)
    user = await resolve_user(token=token)
    if not user:
        raise HTTPException(status_code=401, detail="Non authentifié")
    record = await db.files.find_one({"file_id": file_id, "is_deleted": False}, {"_id": 0})
    if not record:
        raise HTTPException(status_code=404, detail="Fichier introuvable")
    try:
        data, content_type = await get_object(record["storage_path"])
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="Fichier momentanément indisponible")
    headers = {"Cache-Control": "private, max-age=3600"}
    if download:
        headers["Content-Disposition"] = f'attachment; filename="{record["original_filename"]}"'
    return Response(content=data, media_type=record.get("content_type") or content_type, headers=headers)


@router.delete("/files/{file_id}")
async def delete_file(file_id: str, user: dict = Depends(active_user)):
    record = await db.files.find_one({"file_id": file_id, "is_deleted": False})
    if not record:
        raise HTTPException(status_code=404, detail="Fichier introuvable")
    if record["owner_id"] != user["user_id"] and user["role"] != ROLE_ADMIN:
        raise HTTPException(status_code=403, detail="Vous ne pouvez pas supprimer ce fichier")
    await db.files.update_one({"file_id": file_id}, {"$set": {"is_deleted": True, "deleted_at": iso(now_utc())}})
    await log_action(user, "DELETE", "files", file_id)
    return {"ok": True}
