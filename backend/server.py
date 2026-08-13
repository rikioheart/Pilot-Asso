from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import uuid
import logging
import secrets
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Literal

import bcrypt
import jwt
import httpx
from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, WebSocket, WebSocketDisconnect, Query
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field, ConfigDict

import rbac
from rbac import ROLE_ADMIN, ROLE_PRO, ROLE_MEMBER

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("lavoixduchien")

client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]

app = FastAPI(title="La Voix du Chien — Plateforme interne")
api = APIRouter(prefix="/api")

JWT_ALGORITHM = "HS256"


def now_utc():
    return datetime.now(timezone.utc)


def iso(dt):
    return dt.isoformat() if isinstance(dt, datetime) else dt


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
    return jwt.encode(
        {"sub": user_id, "email": email, "type": "access", "exp": now_utc() + timedelta(hours=12)},
        get_jwt_secret(), algorithm=JWT_ALGORITHM,
    )


def create_refresh_token(user_id: str) -> str:
    return jwt.encode(
        {"sub": user_id, "type": "refresh", "exp": now_utc() + timedelta(days=7)},
        get_jwt_secret(), algorithm=JWT_ALGORITHM,
    )


def set_auth_cookies(response: Response, access: str, refresh: Optional[str] = None):
    response.set_cookie("access_token", access, httponly=True, secure=True, samesite="none", max_age=43200, path="/")
    if refresh:
        response.set_cookie("refresh_token", refresh, httponly=True, secure=True, samesite="none", max_age=604800, path="/")


# ---------------------------------------------------------------- Models
class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    first_name: str = Field(min_length=1)
    last_name: str = Field(min_length=1)
    role: Literal["PROFESSIONNEL", "PARTICULIER"]
    phone: Optional[str] = None
    city: Optional[str] = None
    department: Optional[str] = None


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class ProfileUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    display_name: Optional[str] = None
    phone: Optional[str] = None
    city: Optional[str] = None
    department: Optional[str] = None
    bio: Optional[str] = None
    visibility: Optional[str] = None


class UserAdminUpdate(BaseModel):
    role: Optional[str] = None
    access_level: Optional[str] = None
    status: Optional[str] = None
    function_badges: Optional[List[str]] = None
    granted: Optional[List[str]] = None
    revoked: Optional[List[str]] = None


class NotifyIn(BaseModel):
    recipient_id: str
    type: str = "SYSTEM"
    title: str
    message: str = ""
    level: str = "INFO"
    resource_type: Optional[str] = None
    resource_id: Optional[str] = None
    link: Optional[str] = None


# ---------------------------------------------------------------- Auth helpers
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
    # 1) JWT
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") == "access":
            return await db.users.find_one({"user_id": payload["sub"]})
    except jwt.InvalidTokenError:
        pass
    # 2) Session Google (Emergent)
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


# ---------------------------------------------------------------- Audit & notifications
async def log_action(user: dict, action: str, module: str, target: str = None,
                     old_value=None, new_value=None, comment: str = None):
    await db.audit_logs.insert_one({
        "log_id": f"log_{uuid.uuid4().hex[:12]}",
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


async def notify(recipient_id: str, type: str, title: str, message: str = "",
                 level: str = "INFO", resource_type: str = None, resource_id: str = None, link: str = None):
    doc = {
        "notification_id": f"ntf_{uuid.uuid4().hex[:12]}",
        "recipient_id": recipient_id, "type": type, "title": title, "message": message,
        "level": level, "resource_type": resource_type, "resource_id": resource_id,
        "link": link, "is_read": False, "read_at": None, "created_at": iso(now_utc()),
    }
    await db.notifications.insert_one(doc)
    await hub.push(recipient_id, {k: v for k, v in doc.items() if k != "_id"})
    return {k: v for k, v in doc.items() if k != "_id"}


async def notify_bureau(**kwargs):
    async for admin in db.users.find({"role": ROLE_ADMIN, "status": "ACTIVE"}):
        await notify(admin["user_id"], **kwargs)


# ---------------------------------------------------------------- Auth routes
async def create_user_and_profile(email: str, role: str, first_name: str, last_name: str,
                                  password: str = None, status: str = "PENDING",
                                  access_level: str = None, extra_profile: dict = None,
                                  picture: str = None, is_demo: bool = False):
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    doc = {
        "user_id": user_id, "email": email.lower(), "role": role,
        "access_level": access_level or rbac.DEFAULT_LEVEL[role],
        "permission_overrides": {"granted": [], "revoked": []},
        "status": status, "is_active": True, "is_demo": is_demo,
        "auth_provider": "google" if password is None else "password",
        "created_at": iso(now_utc()), "updated_at": iso(now_utc()), "last_login": None,
    }
    if password:
        doc["password_hash"] = hash_password(password)
    await db.users.insert_one(doc)
    profile = {
        "profile_id": f"prf_{uuid.uuid4().hex[:12]}", "user_id": user_id,
        "first_name": first_name, "last_name": last_name,
        "display_name": f"{first_name} {last_name}".strip(), "avatar": picture,
        "phone": None, "city": None, "department": None,
        "membership_type": role, "membership_status": status, "membership_date": iso(now_utc()),
        "bio": None, "visibility": "MEMBERS", "involvement_level": doc["access_level"],
        "function_badges": [], "preferences": {}, "is_demo": is_demo,
        "created_at": iso(now_utc()), "updated_at": iso(now_utc()),
    }
    profile.update(extra_profile or {})
    await db.profiles.insert_one(profile)
    return await db.users.find_one({"user_id": user_id})


@api.post("/auth/register")
async def register(payload: RegisterIn, response: Response):
    if await db.users.find_one({"email": payload.email.lower()}):
        raise HTTPException(status_code=400, detail="Cet e-mail est déjà utilisé")
    user = await create_user_and_profile(
        payload.email, payload.role, payload.first_name, payload.last_name,
        password=payload.password, status="PENDING",
        extra_profile={"phone": payload.phone, "city": payload.city, "department": payload.department},
    )
    await log_action(user, "REGISTER", "auth", user["user_id"], comment="Nouvelle demande d'adhésion")
    await notify_bureau(type="NEW_MEMBERSHIP", title="Nouvelle demande d'adhésion",
                        message=f"{payload.first_name} {payload.last_name} ({payload.role.lower()}) attend une validation.",
                        level="ACTION", resource_type="user", resource_id=user["user_id"], link="/admin/members")
    access = create_access_token(user["user_id"], user["email"])
    set_auth_cookies(response, access, create_refresh_token(user["user_id"]))
    return {"user": clean_user(user), "access_token": access}


@api.post("/auth/login")
async def login(payload: LoginIn, request: Request, response: Response):
    email = payload.email.lower()
    ident = f"{request.client.host if request.client else 'unknown'}:{email}"
    attempt = await db.login_attempts.find_one({"identifier": ident})
    if attempt and attempt.get("count", 0) >= 5:
        locked_until = datetime.fromisoformat(attempt["last_attempt"]) + timedelta(minutes=15)
        if locked_until > now_utc():
            raise HTTPException(status_code=429, detail="Trop de tentatives. Réessayez dans quelques minutes.")
    user = await db.users.find_one({"email": email})
    if not user or not user.get("password_hash") or not verify_password(payload.password, user["password_hash"]):
        await db.login_attempts.update_one(
            {"identifier": ident},
            {"$inc": {"count": 1}, "$set": {"last_attempt": iso(now_utc())}}, upsert=True)
        raise HTTPException(status_code=401, detail="E-mail ou mot de passe incorrect")
    if not user.get("is_active"):
        raise HTTPException(status_code=403, detail="Compte désactivé")
    await db.login_attempts.delete_one({"identifier": ident})
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"last_login": iso(now_utc())}})
    access = create_access_token(user["user_id"], user["email"])
    set_auth_cookies(response, access, create_refresh_token(user["user_id"]))
    await log_action(user, "LOGIN", "auth", user["user_id"])
    user["last_login"] = iso(now_utc())
    return {"user": clean_user(user), "access_token": access}


@api.post("/auth/session")
async def google_session(request: Request, response: Response):
    session_id = request.headers.get("X-Session-ID")
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id manquant")
    async with httpx.AsyncClient(timeout=20) as http:
        r = await http.get("https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
                           headers={"X-Session-ID": session_id})
    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="Session Google invalide")
    data = r.json()
    email = data["email"].lower()
    user = await db.users.find_one({"email": email})
    if not user:
        parts = (data.get("name") or email.split("@")[0]).split(" ", 1)
        user = await create_user_and_profile(email, ROLE_MEMBER, parts[0], parts[1] if len(parts) > 1 else "",
                                             password=None, status="PENDING", picture=data.get("picture"))
        await notify_bureau(type="NEW_MEMBERSHIP", title="Nouvelle demande d'adhésion (Google)",
                            message=f"{data.get('name')} attend une validation.", level="ACTION",
                            resource_type="user", resource_id=user["user_id"], link="/admin/members")
    session_token = data["session_token"]
    await db.user_sessions.insert_one({
        "user_id": user["user_id"], "session_token": session_token,
        "expires_at": iso(now_utc() + timedelta(days=7)), "created_at": iso(now_utc()),
    })
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"last_login": iso(now_utc())}})
    set_auth_cookies(response, session_token)
    await log_action(user, "LOGIN_GOOGLE", "auth", user["user_id"])
    return {"user": clean_user(user), "access_token": session_token}


@api.get("/auth/me")
async def me(user: dict = Depends(current_user)):
    profile = await db.profiles.find_one({"user_id": user["user_id"]}, {"_id": 0})
    return {"user": clean_user(user), "profile": profile}


@api.post("/auth/logout")
async def logout(request: Request, response: Response):
    token = request.cookies.get("access_token")
    if token:
        await db.user_sessions.delete_many({"session_token": token})
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"ok": True}


@api.post("/auth/forgot-password")
async def forgot_password(body: dict):
    email = (body.get("email") or "").lower()
    user = await db.users.find_one({"email": email})
    if user:
        token = secrets.token_urlsafe(32)
        await db.password_reset_tokens.insert_one({
            "token": token, "user_id": user["user_id"], "used": False,
            "expires_at": now_utc() + timedelta(hours=1)})
        logger.info(f"[RESET] Lien de réinitialisation pour {email} : /reset-password?token={token}")
    return {"ok": True, "message": "Si ce compte existe, un lien de réinitialisation a été généré."}


@api.post("/auth/reset-password")
async def reset_password(body: dict):
    doc = await db.password_reset_tokens.find_one({"token": body.get("token"), "used": False})
    if not doc:
        raise HTTPException(status_code=400, detail="Lien invalide ou expiré")
    password = body.get("password") or ""
    if len(password) < 8:
        raise HTTPException(status_code=400, detail="Mot de passe trop court (8 caractères minimum)")
    await db.users.update_one({"user_id": doc["user_id"]}, {"$set": {"password_hash": hash_password(password)}})
    await db.password_reset_tokens.update_one({"token": doc["token"]}, {"$set": {"used": True}})
    return {"ok": True}


# ---------------------------------------------------------------- Profil
@api.put("/profiles/me")
async def update_my_profile(payload: ProfileUpdate, user: dict = Depends(current_user)):
    updates = {k: v for k, v in payload.model_dump(exclude_none=True).items()}
    if not updates:
        return await db.profiles.find_one({"user_id": user["user_id"]}, {"_id": 0})
    old = await db.profiles.find_one({"user_id": user["user_id"]}, {"_id": 0})
    updates["updated_at"] = iso(now_utc())
    await db.profiles.update_one({"user_id": user["user_id"]}, {"$set": updates})
    await log_action(user, "UPDATE", "profile", user["user_id"],
                     old_value={k: old.get(k) for k in updates}, new_value=updates)
    return await db.profiles.find_one({"user_id": user["user_id"]}, {"_id": 0})


# ---------------------------------------------------------------- Membres (Bureau)
@api.get("/members")
async def list_members(status: Optional[str] = None, role: Optional[str] = None,
                       q: Optional[str] = None, page: int = 1, limit: int = 25,
                       user: dict = Depends(require("members.view"))):
    query = {}
    if status:
        query["status"] = status
    if role:
        query["role"] = role
    if user["role"] != ROLE_ADMIN:
        query["status"] = "ACTIVE"
    users = await db.users.find(query, {"_id": 0, "password_hash": 0}) \
        .sort("created_at", -1).skip((page - 1) * limit).limit(limit).to_list(limit)
    ids = [u["user_id"] for u in users]
    profiles = {p["user_id"]: p async for p in db.profiles.find({"user_id": {"$in": ids}}, {"_id": 0})}
    items = []
    for u in users:
        p = profiles.get(u["user_id"], {})
        if q and q.lower() not in f"{p.get('display_name','')} {u['email']}".lower():
            continue
        items.append({**u, "profile": p, "permissions": rbac.effective_permissions(u)})
    return {"items": items, "total": await db.users.count_documents(query), "page": page}


@api.get("/members/{user_id}")
async def get_member(user_id: str, user: dict = Depends(require("members.view"))):
    target = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
    if not target:
        raise HTTPException(status_code=404, detail="Membre introuvable")
    if user["role"] != ROLE_ADMIN and target["status"] != "ACTIVE":
        raise HTTPException(status_code=403, detail="Accès refusé")
    profile = await db.profiles.find_one({"user_id": user_id}, {"_id": 0})
    return {**target, "profile": profile, "permissions": rbac.effective_permissions(target)}


@api.put("/members/{user_id}")
async def update_member(user_id: str, payload: UserAdminUpdate, admin: dict = Depends(require_admin)):
    target = await db.users.find_one({"user_id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="Membre introuvable")
    updates = {}
    if payload.role:
        if payload.role not in rbac.LEVELS_BY_ROLE:
            raise HTTPException(status_code=400, detail="Rôle invalide")
        updates["role"] = payload.role
        updates["access_level"] = payload.access_level or rbac.DEFAULT_LEVEL[payload.role]
    if payload.access_level:
        role = updates.get("role", target["role"])
        if payload.access_level not in rbac.LEVELS_BY_ROLE[role]:
            raise HTTPException(status_code=400, detail="Niveau incompatible avec le rôle")
        updates["access_level"] = payload.access_level
    if payload.status:
        if payload.status not in ["PENDING", "APPROVED", "ACTIVE", "SUSPENDED", "EXPIRED", "REJECTED", "ARCHIVED"]:
            raise HTTPException(status_code=400, detail="Statut invalide")
        updates["status"] = payload.status
        updates["is_active"] = payload.status not in ["SUSPENDED", "REJECTED", "ARCHIVED"]
    if payload.granted is not None or payload.revoked is not None:
        updates["permission_overrides"] = {
            "granted": [p for p in (payload.granted or []) if p in rbac.ALL_PERMISSIONS],
            "revoked": [p for p in (payload.revoked or []) if p in rbac.ALL_PERMISSIONS],
        }
    if not updates:
        raise HTTPException(status_code=400, detail="Aucune modification fournie")
    updates["updated_at"] = iso(now_utc())
    await db.users.update_one({"user_id": user_id}, {"$set": updates})
    profile_updates = {"membership_status": updates.get("status", target["status"]),
                       "involvement_level": updates.get("access_level", target["access_level"])}
    if payload.function_badges is not None:
        profile_updates["function_badges"] = payload.function_badges
    await db.profiles.update_one({"user_id": user_id}, {"$set": profile_updates})
    await log_action(admin, "UPDATE", "members", user_id,
                     old_value={k: target.get(k) for k in updates}, new_value=updates)
    if updates.get("status") == "ACTIVE" and target["status"] != "ACTIVE":
        await notify(user_id, type="MEMBERSHIP_APPROVED", title="Adhésion validée",
                     message="Bienvenue ! Votre compte a été validé par le Bureau.", level="SUCCESS", link="/")
    if updates.get("status") == "REJECTED":
        await notify(user_id, type="MEMBERSHIP_REJECTED", title="Adhésion refusée",
                     message="Votre demande n'a pas été retenue. Contactez le Bureau pour plus d'informations.",
                     level="WARNING")
    updated = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
    return {**updated, "permissions": rbac.effective_permissions(updated)}


# ---------------------------------------------------------------- Notifications
@api.get("/notifications")
async def list_notifications(unread_only: bool = False, type: Optional[str] = None,
                             limit: int = 50, user: dict = Depends(current_user)):
    query = {"recipient_id": user["user_id"]}
    if unread_only:
        query["is_read"] = False
    if type:
        query["type"] = type
    items = await db.notifications.find(query, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
    unread = await db.notifications.count_documents({"recipient_id": user["user_id"], "is_read": False})
    return {"items": items, "unread_count": unread}


@api.post("/notifications/{notification_id}/read")
async def read_notification(notification_id: str, user: dict = Depends(current_user)):
    res = await db.notifications.update_one(
        {"notification_id": notification_id, "recipient_id": user["user_id"]},
        {"$set": {"is_read": True, "read_at": iso(now_utc())}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Notification introuvable")
    return {"ok": True}


@api.post("/notifications/read-all")
async def read_all_notifications(user: dict = Depends(current_user)):
    await db.notifications.update_many({"recipient_id": user["user_id"], "is_read": False},
                                       {"$set": {"is_read": True, "read_at": iso(now_utc())}})
    return {"ok": True}


@api.post("/notifications")
async def create_notification(payload: NotifyIn, admin: dict = Depends(require_admin)):
    return await notify(payload.recipient_id, type=payload.type, title=payload.title, message=payload.message,
                        level=payload.level, resource_type=payload.resource_type,
                        resource_id=payload.resource_id, link=payload.link)


@app.websocket("/api/ws/notifications")
async def ws_notifications(ws: WebSocket, token: str = Query(None)):
    user = await resolve_user(token=token)
    if not user:
        await ws.accept()
        await ws.close(code=4401)
        return
    await hub.connect(user["user_id"], ws)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        hub.disconnect(user["user_id"], ws)


# ---------------------------------------------------------------- Dashboards
@api.get("/dashboard/admin")
async def dashboard_admin(admin: dict = Depends(require_admin)):
    week_ago = iso(now_utc() - timedelta(days=7))
    total = await db.users.count_documents({})
    return {
        "kpis": {
            "members": total,
            "professionals": await db.users.count_documents({"role": ROLE_PRO, "status": "ACTIVE"}),
            "individuals": await db.users.count_documents({"role": ROLE_MEMBER, "status": "ACTIVE"}),
            "pending_members": await db.users.count_documents({"status": "PENDING"}),
            "suspended": await db.users.count_documents({"status": "SUSPENDED"}),
            "bureau": await db.users.count_documents({"role": ROLE_ADMIN}),
        },
        "weekly_progress": {
            "new_members": await db.users.count_documents({"created_at": {"$gte": week_ago}}),
            "validations": await db.audit_logs.count_documents({"action": "UPDATE", "module": "members", "timestamp": {"$gte": week_ago}}),
            "logins": await db.audit_logs.count_documents({"action": {"$in": ["LOGIN", "LOGIN_GOOGLE"]}, "timestamp": {"$gte": week_ago}}),
            "actions": await db.audit_logs.count_documents({"timestamp": {"$gte": week_ago}}),
        },
        "pending_list": await db.users.find({"status": "PENDING"}, {"_id": 0, "password_hash": 0})
            .sort("created_at", -1).limit(8).to_list(8),
        "activity_feed": await db.audit_logs.find({}, {"_id": 0}).sort("timestamp", -1).limit(12).to_list(12),
    }


@api.get("/dashboard/pro")
async def dashboard_pro(user: dict = Depends(active_user)):
    if user["role"] not in (ROLE_PRO, ROLE_ADMIN):
        raise HTTPException(status_code=403, detail="Réservé aux professionnels")
    profile = await db.profiles.find_one({"user_id": user["user_id"]}, {"_id": 0})
    return {
        "profile": profile,
        "kpis": {"projects": 0, "tasks": 0, "events": 0, "proposals": 0, "reservations": 0, "revenue_share": 0},
        "unread_notifications": await db.notifications.count_documents({"recipient_id": user["user_id"], "is_read": False}),
        "permissions": rbac.effective_permissions(user),
        "history": await db.audit_logs.find({"user_id": user["user_id"]}, {"_id": 0}).sort("timestamp", -1).limit(10).to_list(10),
    }


@api.get("/dashboard/member")
async def dashboard_member(user: dict = Depends(active_user)):
    profile = await db.profiles.find_one({"user_id": user["user_id"]}, {"_id": 0})
    dogs = await db.dogs.find({"owner_id": user["user_id"]}, {"_id": 0}).to_list(20)
    return {
        "profile": profile, "dogs": dogs,
        "kpis": {"activities": 0, "registrations": 0, "volunteer_tasks": 0,
                 "dogs": len(dogs), "loyalty_points": 0, "advantages": 0},
        "unread_notifications": await db.notifications.count_documents({"recipient_id": user["user_id"], "is_read": False}),
        "permissions": rbac.effective_permissions(user),
    }


# ---------------------------------------------------------------- Chiens
class DogIn(BaseModel):
    name: str
    breed: Optional[str] = None
    sex: Optional[str] = None
    birth_date: Optional[str] = None
    description: Optional[str] = None
    character: Optional[str] = None
    needs: Optional[str] = None
    useful_information: Optional[str] = None
    visibility: str = "MEMBERS"


@api.get("/dogs")
async def my_dogs(user: dict = Depends(active_user)):
    return await db.dogs.find({"owner_id": user["user_id"]}, {"_id": 0}).to_list(50)


@api.post("/dogs")
async def create_dog(payload: DogIn, user: dict = Depends(active_user)):
    doc = {"dog_id": f"dog_{uuid.uuid4().hex[:12]}", "owner_id": user["user_id"],
           **payload.model_dump(), "photo": None,
           "created_at": iso(now_utc()), "updated_at": iso(now_utc())}
    await db.dogs.insert_one(doc)
    await log_action(user, "CREATE", "dogs", doc["dog_id"], new_value={"name": payload.name})
    return {k: v for k, v in doc.items() if k != "_id"}


@api.delete("/dogs/{dog_id}")
async def delete_dog(dog_id: str, user: dict = Depends(active_user)):
    dog = await db.dogs.find_one({"dog_id": dog_id})
    if not dog:
        raise HTTPException(status_code=404, detail="Chien introuvable")
    if dog["owner_id"] != user["user_id"] and user["role"] != ROLE_ADMIN:
        raise HTTPException(status_code=403, detail="Accès refusé")
    await db.dogs.delete_one({"dog_id": dog_id})
    await log_action(user, "DELETE", "dogs", dog_id, old_value={"name": dog["name"]})
    return {"ok": True}


# ---------------------------------------------------------------- Audit, RBAC, recherche
@api.get("/audit")
async def audit(module: Optional[str] = None, user_id: Optional[str] = None,
                action: Optional[str] = None, limit: int = 100, admin: dict = Depends(require_admin)):
    query = {}
    for k, v in (("module", module), ("user_id", user_id), ("action", action)):
        if v:
            query[k] = v
    items = await db.audit_logs.find(query, {"_id": 0}).sort("timestamp", -1).limit(limit).to_list(limit)
    return {"items": items, "total": await db.audit_logs.count_documents(query)}


@api.get("/settings/rbac")
async def rbac_matrix(admin: dict = Depends(require_admin)):
    return {"permissions": rbac.ALL_PERMISSIONS, "levels_by_role": rbac.LEVELS_BY_ROLE,
            "level_permissions": rbac.LEVEL_PERMISSIONS}


@api.get("/search")
async def global_search(q: str, user: dict = Depends(active_user)):
    if len(q) < 2:
        return {"groups": []}
    rx = {"$regex": q, "$options": "i"}
    groups = []
    prof_query = {"$or": [{"display_name": rx}, {"city": rx}]}
    if user["role"] != ROLE_ADMIN:
        prof_query["visibility"] = {"$in": ["MEMBERS", "PROFESSIONALS", "PUBLIC"]}
    profiles = await db.profiles.find(prof_query, {"_id": 0}).limit(8).to_list(8)
    if profiles:
        groups.append({"label": "Membres", "items": [
            {"id": p["user_id"], "title": p["display_name"], "subtitle": p.get("membership_type"),
             "link": f"/admin/members?focus={p['user_id']}" if user["role"] == ROLE_ADMIN else "/directory"}
            for p in profiles]})
    dog_query = {"name": rx} if user["role"] == ROLE_ADMIN else {"name": rx, "owner_id": user["user_id"]}
    dogs = await db.dogs.find(dog_query, {"_id": 0}).limit(8).to_list(8)
    if dogs:
        groups.append({"label": "Chiens", "items": [
            {"id": d["dog_id"], "title": d["name"], "subtitle": d.get("breed") or "Chien", "link": "/profile"} for d in dogs]})
    return {"groups": groups}


@api.get("/")
async def root():
    return {"message": "API La Voix du Chien", "phase": 1}


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origin_regex=r"https?://.*",
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("user_id", unique=True)
    await db.users.create_index("role")
    await db.users.create_index("status")
    await db.profiles.create_index("user_id")
    await db.dogs.create_index("owner_id")
    await db.notifications.create_index([("recipient_id", 1), ("is_read", 1)])
    await db.notifications.create_index("created_at")
    await db.audit_logs.create_index("timestamp")
    await db.user_sessions.create_index("session_token")
    await db.login_attempts.create_index("identifier")
    await db.password_reset_tokens.create_index("expires_at", expireAfterSeconds=0)

    admin_email = os.environ["ADMIN_EMAIL"].lower()
    admin_password = os.environ["ADMIN_PASSWORD"]
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        await create_user_and_profile(admin_email, ROLE_ADMIN, "Bureau", "La Voix du Chien",
                                      password=admin_password, status="ACTIVE", access_level="BUREAU",
                                      extra_profile={"function_badges": ["FONDATEUR"], "city": "Nargis", "department": "45"})
        logger.info("Admin Bureau créé")
    elif not verify_password(admin_password, existing.get("password_hash", "")):
        await db.users.update_one({"email": admin_email}, {"$set": {"password_hash": hash_password(admin_password)}})

    from seed_demo import seed_demo
    await seed_demo(db, create_user_and_profile, notify)


@app.on_event("shutdown")
async def shutdown():
    client.close()
