"""Dépendances partagées : base, auth, permissions, notifications, audit."""
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import uuid
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

import bcrypt
import jwt
from fastapi import HTTPException, Request, Response, Depends, WebSocket
from motor.motor_asyncio import AsyncIOMotorClient

import rbac
from rbac import ROLE_ADMIN, ROLE_PRO, ROLE_MEMBER

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("lavoixduchien")

mongo_client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = mongo_client[os.environ["DB_NAME"]]

JWT_ALGORITHM = "HS256"


def now_utc():
    return datetime.now(timezone.utc)


def iso(dt):
    return dt.isoformat() if isinstance(dt, datetime) else dt


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def get_jwt_secret() -> str:
    return os.environ["JWT_SECRET"]


def create_access_token(user_id: str, email: str) -> str:
    return jwt.encode({"sub": user_id, "email": email, "type": "access",
                       "exp": now_utc() + timedelta(hours=12)}, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: str) -> str:
    return jwt.encode({"sub": user_id, "type": "refresh", "exp": now_utc() + timedelta(days=7)},
                      get_jwt_secret(), algorithm=JWT_ALGORITHM)


def set_auth_cookies(response: Response, access: str, refresh: Optional[str] = None):
    response.set_cookie("access_token", access, httponly=True, secure=True, samesite="none", max_age=43200, path="/")
    if refresh:
        response.set_cookie("refresh_token", refresh, httponly=True, secure=True, samesite="none",
                            max_age=604800, path="/")


def clean_user(user: dict) -> dict:
    user = {k: v for k, v in user.items() if k not in ("_id", "password_hash")}
    user["permissions"] = rbac.effective_permissions(user)
    return user


async def resolve_user(request: Request = None, token: str = None) -> Optional[dict]:
    if token is None and request is not None:
        token = request.cookies.get("access_token")
        if not token:
            header = request.headers.get("Authorization", "")
            if header.startswith("Bearer "):
                token = header[7:]
    if not token:
        return None
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") == "access":
            return await db.users.find_one({"user_id": payload["sub"]})
    except jwt.InvalidTokenError:
        pass
    session = await db.user_sessions.find_one({"session_token": token})
    if session:
        expires = session["expires_at"]
        if isinstance(expires, str):
            expires = datetime.fromisoformat(expires)
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        if expires > now_utc():
            return await db.users.find_one({"user_id": session["user_id"]})
    return None


async def current_user(request: Request) -> dict:
    user = await resolve_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Non authentifié")
    if not user.get("is_active"):
        raise HTTPException(status_code=403, detail="Compte désactivé")
    return user


async def active_user(request: Request) -> dict:
    user = await current_user(request)
    if user.get("status") != "ACTIVE":
        raise HTTPException(status_code=403, detail="Compte en attente de validation par le Bureau")
    return user


def require(permission: str):
    async def dep(user: dict = Depends(active_user)) -> dict:
        if not rbac.has_permission(user, permission):
            raise HTTPException(status_code=403, detail=f"Permission requise : {permission}")
        return user
    return dep


async def require_admin(user: dict = Depends(active_user)) -> dict:
    if user.get("role") != ROLE_ADMIN:
        raise HTTPException(status_code=403, detail="Réservé au Bureau")
    return user


async def log_action(user: dict, action: str, module: str, target: str = None,
                     old_value=None, new_value=None, comment: str = None):
    await db.audit_logs.insert_one({
        "log_id": new_id("log"),
        "user_id": user.get("user_id") if user else None,
        "user_email": user.get("email") if user else "system",
        "action": action, "module": module, "target": target,
        "old_value": old_value, "new_value": new_value, "comment": comment,
        "timestamp": iso(now_utc()),
    })


class WSHub:
    def __init__(self):
        self.connections: dict = {}

    async def connect(self, user_id: str, ws: WebSocket):
        await ws.accept()
        self.connections.setdefault(user_id, []).append(ws)

    def disconnect(self, user_id: str, ws: WebSocket):
        conns = self.connections.get(user_id, [])
        if ws in conns:
            conns.remove(ws)

    async def push(self, user_id: str, payload: dict):
        for ws in list(self.connections.get(user_id, [])):
            try:
                await ws.send_json(payload)
            except Exception:
                self.disconnect(user_id, ws)


hub = WSHub()


OPTIONAL_NOTIFICATION_TYPES = {
    "ACTIVITY_REGISTRATION": "Inscription d'un membre à une de mes activités ou événements",
    "HELP_REQUEST": "Proposition ou demande d'aide sur un projet ou une tâche qui me concerne",
    "REGISTRATION_CONFIRMED": "Confirmation de mes propres inscriptions",
    "GENTLE_NUDGE": "Petits mots et rappels du Bureau",
}


async def notification_allowed(recipient_id: str, type: str) -> bool:
    """Le Bureau reçoit tout ; les autres profils peuvent désactiver certains types."""
    if type not in OPTIONAL_NOTIFICATION_TYPES:
        return True
    target = await db.users.find_one({"user_id": recipient_id}, {"_id": 0, "role": 1})
    if not target or target["role"] == rbac.ROLE_ADMIN:
        return True
    profile = await db.profiles.find_one({"user_id": recipient_id}, {"_id": 0, "preferences": 1})
    prefs = ((profile or {}).get("preferences") or {}).get("notification_prefs") or {}
    return prefs.get(type, True) is not False


HIGH_PRIORITY_TYPES = {"MENTION", "NEW_PROPOSAL"}


def priority_weight(type: str, level: str) -> int:
    """0 = à traiter en priorité (mention, validation en attente), 1 = important, 2 = information."""
    if type in HIGH_PRIORITY_TYPES:
        return 0
    if level in ("ACTION", "WARNING"):
        return 1
    return 2


async def _recipient_prefs(recipient_id: str):
    target = await db.users.find_one({"user_id": recipient_id}, {"_id": 0, "role": 1})
    profile = await db.profiles.find_one({"user_id": recipient_id}, {"_id": 0, "preferences": 1})
    return target, ((profile or {}).get("preferences") or {})


async def is_on_vacation(recipient_id: str) -> bool:
    _, prefs = await _recipient_prefs(recipient_id)
    return bool((prefs.get("vacation") or {}).get("active"))


async def notify(recipient_id: str, type: str, title: str, message: str = "", level: str = "INFO",
                 resource_type: str = None, resource_id: str = None, link: str = None):
    if not await notification_allowed(recipient_id, type):
        return None
    target, prefs = await _recipient_prefs(recipient_id)
    is_bureau = bool(target and target["role"] == ROLE_ADMIN)
    doc = {
        "notification_id": new_id("ntf"), "recipient_id": recipient_id, "type": type, "title": title,
        "message": message, "level": level, "resource_type": resource_type, "resource_id": resource_id,
        "link": link, "is_read": False, "read_at": None,
        "priority": "HIGH" if level in ("ACTION", "WARNING") else "NORMAL",
        "priority_weight": priority_weight(type, level),
        "is_archived": False, "digest_pending": False, "received_during_vacation": False,
        "created_at": iso(now_utc()),
    }
    push = True
    if not is_bureau:
        vacation = prefs.get("vacation") or {}
        if vacation.get("active"):
            doc["is_archived"] = True
            doc["received_during_vacation"] = True
            push = False
        elif prefs.get("delivery_mode") == "DIGEST":
            doc["digest_pending"] = True
            push = False
    await db.notifications.insert_one(doc)
    payload = {k: v for k, v in doc.items() if k != "_id"}
    if push:
        await hub.push(recipient_id, payload)
    return payload


async def notify_bureau(**kwargs):
    async for admin in db.users.find({"role": ROLE_ADMIN, "status": "ACTIVE"}):
        await notify(admin["user_id"], **kwargs)


async def notify_coordinators(**kwargs):
    async for pro in db.users.find({"access_level": "PRO_COORDINATEUR", "status": "ACTIVE"}):
        await notify(pro["user_id"], **kwargs)


async def display_name(user_id: str) -> str:
    profile = await db.profiles.find_one({"user_id": user_id}, {"_id": 0, "display_name": 1})
    return (profile or {}).get("display_name") or "Un membre"
