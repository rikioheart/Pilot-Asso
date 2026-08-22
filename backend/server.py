from deps import (ROOT_DIR, db, mongo_client, logger, now_utc, iso, new_id, hash_password, verify_password,
                  create_access_token, create_refresh_token, set_auth_cookies, clean_user, resolve_user,
                  current_user, active_user, require, require_admin, log_action, hub, notify, notify_bureau)

import os
import secrets
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Literal

import httpx
from fastapi import (FastAPI, APIRouter, HTTPException, Request, Response, Depends,
                     WebSocket, WebSocketDisconnect, Query)
from starlette.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr, Field, ConfigDict

import rbac
from rbac import ROLE_ADMIN, ROLE_PRO, ROLE_MEMBER
import projects as projects_module
import professionals as professionals_module
import imports_csv as imports_module
import activities as activities_module
import loyalty as loyalty_module
import records as records_module
import help_center as help_module
import stats_mindmap as stats_module
import storage as storage_module
import content as content_module
import community as community_module
import finance as finance_module
import partners as partners_module
import terrain as terrain_module
import stock as stock_module
import documents as documents_module
import exports as exports_module
import profiles_plus as profiles_plus_module
import dogs as dogs_module
import crons_api as crons_module

app = FastAPI(title="La Voix du Chien — Plateforme interne")
api = APIRouter(prefix="/api")


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
    avatar: Optional[str] = None
    avatar_file_id: Optional[str] = None
    cover_file_id: Optional[str] = None
    onboarding_done: Optional[bool] = None


class UserAdminUpdate(BaseModel):
    role: Optional[str] = None
    access_level: Optional[str] = None
    status: Optional[str] = None
    function_badges: Optional[List[str]] = None
    granted: Optional[List[str]] = None
    revoked: Optional[List[str]] = None
    history_scope: Optional[str] = None


class NotifyIn(BaseModel):
    recipient_id: str
    type: str = "SYSTEM"
    title: str
    message: str = ""
    level: str = "INFO"
    resource_type: Optional[str] = None
    resource_id: Optional[str] = None
    link: Optional[str] = None


# ---------------------------------------------------------------- Auth
async def create_user_and_profile(email: str, role: str, first_name: str, last_name: str,
                                  password: str = None, status: str = "PENDING",
                                  access_level: str = None, extra_profile: dict = None,
                                  picture: str = None, is_demo: bool = False):
    user_id = new_id("user")
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
        "profile_id": new_id("prf"), "user_id": user_id,
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
    created = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    return created


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


# ---------------------------------------------------------------- Membres
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
    if payload.history_scope is not None:
        if payload.history_scope not in ("OWN", "MODULE", "FULL"):
            raise HTTPException(status_code=400, detail="Niveau de visibilité d'historique invalide")
        profile_updates["history_scope"] = payload.history_scope
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
    today = iso(now_utc())
    open_projects = {"status": {"$in": ["PLANNED", "IN_PROGRESS", "WAITING", "TO_REVIEW", "IDEA", "BLOCKED"]}}
    return {
        "kpis": {
            "members": await db.users.count_documents({}),
            "professionals": await db.users.count_documents({"role": ROLE_PRO, "status": "ACTIVE"}),
            "individuals": await db.users.count_documents({"role": ROLE_MEMBER, "status": "ACTIVE"}),
            "pending_members": await db.users.count_documents({"status": "PENDING"}),
            "active_projects": await db.projects.count_documents(open_projects),
            "tasks_to_validate": await db.tasks.count_documents({"status": "PENDING_VALIDATION"}),
            "overdue_tasks": await db.tasks.count_documents(
                {"deadline": {"$lt": today, "$ne": None},
                 "status": {"$nin": ["COMPLETED", "ARCHIVED", "CANCELLED"]}}),
            "help_requests": await db.help_requests.count_documents({"status": "OPEN"}),
            "upcoming_events": await db.events.count_documents(
                {"start_date": {"$gte": iso(now_utc())[:10]}, "status": {"$in": ["PLANNED", "CONFIRMED"]}}),
            "activities_to_review": await db.activities.count_documents({"status": "PROPOSED"}),
            "loyalty_stamps": await db.loyalty_stamps.count_documents({}),
            "volunteer_tasks_open": await db.tasks.count_documents(
                {"is_volunteer_task": True, "assigned_user_id": None, "status": "TODO"}),
            "blocked_tasks": await db.tasks.count_documents({"status": "BLOCKED"}),
            "suspended": await db.users.count_documents({"status": "SUSPENDED"}),
            "bureau": await db.users.count_documents({"role": ROLE_ADMIN}),
        },
        "weekly_progress": {
            "tasks_completed": await db.tasks.count_documents({"status": "COMPLETED", "completed_at": {"$gte": week_ago}}),
            "validations": await db.task_history.count_documents({"action": "VALIDATE", "timestamp": {"$gte": week_ago}}),
            "new_members": await db.users.count_documents({"created_at": {"$gte": week_ago}}),
            "new_projects": await db.projects.count_documents({"created_at": {"$gte": week_ago}}),
            "actions": await db.audit_logs.count_documents({"timestamp": {"$gte": week_ago}}),
        },
        "pending_list": await db.users.find({"status": "PENDING"}, {"_id": 0, "password_hash": 0})
            .sort("created_at", -1).limit(8).to_list(8),
        "validation_queue": await db.tasks.find({"status": "PENDING_VALIDATION"}, {"_id": 0})
            .sort("submitted_at", 1).limit(6).to_list(6),
        "help_list": await db.help_requests.find({"status": "OPEN"}, {"_id": 0})
            .sort("created_at", -1).limit(6).to_list(6),
        "activity_feed": await db.audit_logs.find({}, {"_id": 0}).sort("timestamp", -1).limit(12).to_list(12),
    }


@api.get("/dashboard/pro")
async def dashboard_pro(user: dict = Depends(active_user)):
    if user["role"] not in (ROLE_PRO, ROLE_ADMIN):
        raise HTTPException(status_code=403, detail="Réservé aux professionnels")
    profile = await db.profiles.find_one({"user_id": user["user_id"]}, {"_id": 0})
    team_ids = [t["project_id"] async for t in db.project_teams.find(
        {"member_id": user["user_id"], "status": "ACTIVE"}, {"_id": 0, "project_id": 1})]
    my_tasks = await db.tasks.find({"assigned_user_id": user["user_id"],
                                   "status": {"$nin": ["COMPLETED", "ARCHIVED", "CANCELLED"]}},
                                  {"_id": 0}).sort("deadline", 1).limit(10).to_list(10)
    return {
        "profile": profile,
        "kpis": {
            "projects": await db.projects.count_documents({"project_id": {"$in": team_ids},
                                                           "status": {"$ne": "ARCHIVED"}}),
            "tasks": len(my_tasks),
            "pending_validation": await db.tasks.count_documents(
                {"submitted_by": user["user_id"], "status": "PENDING_VALIDATION"}),
            "completed": await db.tasks.count_documents(
                {"assigned_user_id": user["user_id"], "status": "COMPLETED"}),
            "events": await db.events.count_documents({"professional_ids": user["user_id"]}),
            "activities": await db.activities.count_documents({"created_by": user["user_id"]}),
            "stamps": await db.loyalty_stamps.count_documents({"validated_by": user["user_id"]}),
            "reservations": 0, "revenue_share": 0,
        },
        "my_tasks": my_tasks,
        "my_projects": await db.projects.find({"project_id": {"$in": team_ids}, "status": {"$ne": "ARCHIVED"}},
                                              {"_id": 0}).limit(8).to_list(8),
        "unread_notifications": await db.notifications.count_documents(
            {"recipient_id": user["user_id"], "is_read": False}),
        "permissions": rbac.effective_permissions(user),
        "history": await db.audit_logs.find({"user_id": user["user_id"]}, {"_id": 0})
            .sort("timestamp", -1).limit(10).to_list(10),
    }


@api.get("/dashboard/member")
async def dashboard_member(user: dict = Depends(active_user)):
    profile = await db.profiles.find_one({"user_id": user["user_id"]}, {"_id": 0})
    dogs = await db.dogs.find({"owner_id": user["user_id"]}, {"_id": 0}).to_list(20)
    my_tasks = await db.tasks.find({"assigned_user_id": user["user_id"],
                                    "status": {"$nin": ["COMPLETED", "ARCHIVED", "CANCELLED"]}},
                                   {"_id": 0}).sort("deadline", 1).limit(10).to_list(10)
    open_volunteer = await db.tasks.find({"is_volunteer_task": True, "assigned_user_id": None, "status": "TODO"},
                                         {"_id": 0}).limit(8).to_list(8)
    card = await db.loyalty_cards.find_one({"user_id": user["user_id"]}, {"_id": 0})
    participations = await db.participations.find({"user_id": user["user_id"]}, {"_id": 0}) \
        .sort("registered_at", -1).limit(50).to_list(50)
    upcoming = []
    today = iso(now_utc())[:10]
    for p in participations:
        if p.get("activity_id"):
            activity = await db.activities.find_one({"activity_id": p["activity_id"]},
                                                    {"_id": 0, "title": 1, "date": 1, "location": 1})
            if activity and (activity.get("date") or "") >= today:
                upcoming.append({"title": activity["title"], "date": activity["date"],
                                 "location": activity.get("location"), "role": p["role"], "link": "/activities"})
        elif p.get("event_id"):
            event = await db.events.find_one({"event_id": p["event_id"]},
                                             {"_id": 0, "title": 1, "start_date": 1, "location": 1})
            if event and (event.get("start_date") or "")[:10] >= today:
                upcoming.append({"title": event["title"], "date": event["start_date"][:10],
                                 "location": event.get("location"), "role": p["role"],
                                 "link": f"/events/{p['event_id']}"})
    return {
        "profile": profile, "dogs": dogs, "my_tasks": my_tasks, "open_volunteer_tasks": open_volunteer,
        "upcoming": sorted(upcoming, key=lambda x: x["date"])[:6],
        "kpis": {"activities": len([p for p in participations if p.get("activity_id")]),
                 "registrations": len(upcoming),
                 "volunteer_tasks": len(my_tasks),
                 "dogs": len(dogs),
                 "loyalty_points": (card or {}).get("total_points", 0),
                 "advantages": await db.professional_details.count_documents(
                     {"member_advantages": {"$nin": [None, ""]}})},
        "unread_notifications": await db.notifications.count_documents(
            {"recipient_id": user["user_id"], "is_read": False}),
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
    profiles = await db.profiles.find(prof_query, {"_id": 0}).limit(6).to_list(6)
    if profiles:
        groups.append({"label": "Membres", "items": [
            {"id": p["user_id"], "title": p["display_name"], "subtitle": p.get("membership_type"),
             "link": f"/admin/members?focus={p['user_id']}" if user["role"] == ROLE_ADMIN else "/directory"}
            for p in profiles]})
    if rbac.has_permission(user, "projects.view"):
        pfilter = await projects_module.visible_project_filter(user)
        pquery = {"$and": [pfilter, {"title": rx}]} if pfilter else {"title": rx}
        found = await db.projects.find(pquery, {"_id": 0}).limit(6).to_list(6)
        if found:
            groups.append({"label": "Projets", "items": [
                {"id": p["project_id"], "title": p["title"], "subtitle": p["status"],
                 "link": f"/projects/{p['project_id']}"} for p in found]})
    if rbac.has_permission(user, "tasks.view"):
        tquery = {"title": rx} if user["role"] == ROLE_ADMIN else \
            {"title": rx, "$or": [{"assigned_user_id": user["user_id"]}, {"is_volunteer_task": True}]}
        tasks = await db.tasks.find(tquery, {"_id": 0}).limit(6).to_list(6)
        if tasks:
            groups.append({"label": "Tâches", "items": [
                {"id": t["task_id"], "title": t["title"], "subtitle": t["status"],
                 "link": f"/projects/{t['project_id']}"} for t in tasks]})
    dog_query = {"name": rx} if user["role"] == ROLE_ADMIN else {"name": rx, "owner_id": user["user_id"]}
    dogs = await db.dogs.find(dog_query, {"_id": 0}).limit(6).to_list(6)
    if dogs:
        groups.append({"label": "Chiens", "items": [
            {"id": d["dog_id"], "title": d["name"], "subtitle": d.get("breed") or "Chien", "link": "/profile"}
            for d in dogs]})
    pros = await db.professional_details.find(
        {"$or": [{"company_name": rx}, {"specialties": rx}]}, {"_id": 0}).limit(6).to_list(6)
    if pros:
        groups.append({"label": "Professionnels", "items": [
            {"id": p["user_id"], "title": p.get("company_name") or "Fiche professionnelle",
             "subtitle": p.get("professional_category"), "link": f"/directory?focus={p['user_id']}"} for p in pros]})
    return {"groups": groups}


@api.get("/")
async def root():
    return {"message": "API La Voix du Chien", "phase": 2}


app.include_router(api)
app.include_router(projects_module.router)
app.include_router(professionals_module.router)
app.include_router(imports_module.router)
app.include_router(activities_module.router)
app.include_router(loyalty_module.router)
app.include_router(stats_module.router)
app.include_router(storage_module.router)
app.include_router(content_module.router)
app.include_router(community_module.router)
app.include_router(finance_module.router)
app.include_router(partners_module.router)
app.include_router(terrain_module.router)
app.include_router(stock_module.router)
app.include_router(documents_module.router)
app.include_router(exports_module.router)
app.include_router(profiles_plus_module.router)
app.include_router(dogs_module.router)
app.include_router(crons_module.router)
app.include_router(records_module.router)
app.include_router(help_module.router)

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
    await db.projects.create_index("project_id", unique=True)
    await db.projects.create_index("status")
    await db.projects.create_index("owner_id")
    await db.projects.create_index("deadline")
    await db.tasks.create_index("task_id", unique=True)
    await db.tasks.create_index("project_id")
    await db.tasks.create_index("assigned_user_id")
    await db.tasks.create_index("status")
    await db.tasks.create_index("deadline")
    await db.project_teams.create_index([("project_id", 1), ("member_id", 1)])
    await db.task_history.create_index("task_id")
    await db.help_requests.create_index("status")
    await db.professional_details.create_index("user_id", unique=True)
    await db.professional_details.create_index("professional_category")
    await db.professional_details.create_index("departments")
    await db.activities.create_index("activity_id", unique=True)
    await db.activities.create_index("date")
    await db.activities.create_index("category")
    await db.activities.create_index("event_id")
    await db.events.create_index("event_id", unique=True)
    await db.events.create_index("start_date")
    await db.participations.create_index([("user_id", 1), ("activity_id", 1)])
    await db.participations.create_index([("event_id", 1), ("role", 1)])
    await db.loyalty_cards.create_index("card_id", unique=True)
    await db.loyalty_cards.create_index("qr_token", unique=True)
    await db.loyalty_cards.create_index("user_id", unique=True)
    await db.loyalty_stamps.create_index("card_id")
    await db.loyalty_stamps.create_index("created_at")
    await db.loyalty_rules.create_index("kind")
    await db.mindmap_nodes.create_index("node_id", unique=True)
    await db.mindmap_edges.create_index([("source", 1), ("target", 1)])
    await db.files.create_index("file_id", unique=True)
    await db.files.create_index("owner_id")
    await db.articles.create_index("article_id", unique=True)
    await db.articles.create_index("status")
    await db.articles.create_index("published_at")
    await db.formations.create_index("formation_id", unique=True)
    await db.formations.create_index("date")
    await db.formation_registrations.create_index([("formation_id", 1), ("user_id", 1)])
    await db.library_items.create_index("item_id", unique=True)
    await db.library_downloads.create_index("item_id")
    await db.social_posts.create_index("post_id", unique=True)
    await db.social_posts.create_index("scheduled_date")
    await db.contests.create_index("contest_id", unique=True)
    await db.contest_participants.create_index([("contest_id", 1), ("user_id", 1)], unique=True)
    await db.advent_calendars.create_index("year", unique=True)
    await db.advent_boxes.create_index([("calendar_id", 1), ("day", 1)], unique=True)
    await db.advent_openings.create_index([("calendar_id", 1), ("day", 1), ("user_id", 1)])
    await db.transactions.create_index("transaction_id", unique=True)
    await db.transactions.create_index("date")
    await db.distributions.create_index("distribution_id", unique=True)
    await db.distribution_lines.create_index("professional_id")
    await db.reimbursements.create_index("beneficiary_id")
    await db.advantages.create_index("advantage_id", unique=True)
    await db.advantage_claims.create_index([("advantage_id", 1), ("user_id", 1)], unique=True)
    await db.partners.create_index("partner_id", unique=True)
    await db.partners.create_index("category")
    await db.partner_exchanges.create_index("partner_id")
    await db.advantage_proposals.create_index("proposal_id", unique=True)
    await db.terrains.create_index("terrain_id", unique=True)
    await db.terrain_slots.create_index([("terrain_id", 1), ("date", 1)])
    await db.terrain_reservations.create_index([("terrain_id", 1), ("date", 1)])
    await db.terrain_reservations.create_index("status")
    await db.stock_items.create_index("item_id", unique=True)
    await db.stock_movements.create_index("item_id")
    await db.documents.create_index("document_id", unique=True)
    await db.documents.create_index("expiry_date")
    await db.external_forms.create_index("form_id", unique=True)
    await db.reminder_log.create_index("key", unique=True)
    await db.dogs.create_index("dog_id", unique=True)
    await db.dogs.create_index("owner_id")
    await db.dog_cases.create_index("dog_id")
    await db.dog_reports.create_index("dog_id")
    await db.dog_comments.create_index("report_id")
    await db.dog_owner_notes.create_index("dog_id")
    await db.join_requests.create_index("request_id", unique=True)
    await db.cron_runs.create_index("run_id")

    try:
        await storage_module.init_storage()
        logger.info("Stockage de fichiers initialisé")
    except Exception as exc:
        logger.error(f"Stockage de fichiers indisponible : {exc}")

    admin_email = os.environ["ADMIN_EMAIL"].lower()
    admin_password = os.environ["ADMIN_PASSWORD"]
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        await create_user_and_profile(admin_email, ROLE_ADMIN, "Bureau", "La Voix du Chien",
                                      password=admin_password, status="ACTIVE", access_level="BUREAU",
                                      extra_profile={"function_badges": ["FONDATEUR"], "city": "Nargis",
                                                     "department": "45"})
        logger.info("Admin Bureau créé")
    elif not verify_password(admin_password, existing.get("password_hash", "")):
        await db.users.update_one({"email": admin_email}, {"$set": {"password_hash": hash_password(admin_password)}})

    from seed_demo import seed_demo
    await seed_demo(db, create_user_and_profile, notify)


@app.on_event("shutdown")
async def shutdown():
    mongo_client.close()
