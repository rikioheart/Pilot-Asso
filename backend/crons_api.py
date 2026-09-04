"""Tâches planifiées (crons Emergent) : rappels J-2 / J-1 et récapitulatif hebdomadaire du Bureau."""
import hmac
import os
from datetime import timedelta

from fastapi import APIRouter, BackgroundTasks, Header, HTTPException, Request

from rbac import ROLE_ADMIN
from deps import db, iso, now_utc, new_id, logger, notify, notify_bureau

router = APIRouter(prefix="/api")


def check_secret(authorization: str):
    secret = os.environ["WEBHOOK_CRON_SECRET"]
    token = authorization[7:] if authorization and authorization.startswith("Bearer ") else ""
    if not token or not hmac.compare_digest(token, secret):
        raise HTTPException(status_code=401, detail="Non autorisé")


async def claim_run(name: str, run_id: str) -> bool:
    """Idempotence : retourne False si ce run a déjà été traité."""
    if not run_id:
        return True
    existing = await db.cron_runs.find_one({"run_id": run_id})
    if existing:
        return False
    await db.cron_runs.insert_one({"run_id": run_id, "name": name, "created_at": iso(now_utc())})
    return True


async def send_reminders():
    today = now_utc().date()
    sent = 0
    try:
        from payments import sweep_overdue_payments
        late = await sweep_overdue_payments()
        if late:
            logger.info(f"[CRON] Paiements basculés en retard : {late}")
    except Exception as exc:  # ne bloque pas les rappels
        logger.error(f"[CRON] Bascule paiements en retard échouée : {exc}")
    for offset, label in ((2, "J-2"), (1, "J-1")):
        target = (today + timedelta(days=offset)).isoformat()
        async for task in db.tasks.find({"deadline": {"$regex": f"^{target}"},
                                         "status": {"$nin": ["COMPLETED", "ARCHIVED", "CANCELLED"]}},
                                        {"_id": 0}):
            if not task.get("assigned_user_id"):
                continue
            key = f"task:{task['task_id']}:{label}"
            if await db.reminder_log.find_one({"key": key}):
                continue
            await db.reminder_log.insert_one({"key": key, "created_at": iso(now_utc())})
            await notify(task["assigned_user_id"], type="TASK_REMINDER",
                         title=f"Rappel {label} — {task['title']}",
                         message=f"Échéance le {target}. Besoin d'aide ? Signalez-le au Bureau.",
                         level="ACTION", resource_type="task", resource_id=task["task_id"],
                         link=f"/projects/{task['project_id']}")
            sent += 1
        async for event in db.events.find({"start_date": {"$regex": f"^{target}"},
                                           "status": {"$in": ["PLANNED", "CONFIRMED"]}}, {"_id": 0}):
            async for p in db.participations.find({"event_id": event["event_id"]}, {"_id": 0, "user_id": 1}):
                key = f"event:{event['event_id']}:{p['user_id']}:{label}"
                if await db.reminder_log.find_one({"key": key}):
                    continue
                await db.reminder_log.insert_one({"key": key, "created_at": iso(now_utc())})
                await notify(p["user_id"], type="EVENT_REMINDER",
                             title=f"Rappel {label} — {event['title']}",
                             message=f"Rendez-vous le {target}{' à ' + event['location'] if event.get('location') else ''}.",
                             level="INFO", resource_type="event", resource_id=event["event_id"],
                             link=f"/events/{event['event_id']}")
                sent += 1
        async for activity in db.activities.find({"date": target,
                                                  "status": {"$in": ["PLANNED", "ACTIVE", "FULL"]}}, {"_id": 0}):
            async for p in db.participations.find({"activity_id": activity["activity_id"]},
                                                  {"_id": 0, "user_id": 1}):
                key = f"activity:{activity['activity_id']}:{p['user_id']}:{label}"
                if await db.reminder_log.find_one({"key": key}):
                    continue
                await db.reminder_log.insert_one({"key": key, "created_at": iso(now_utc())})
                await notify(p["user_id"], type="ACTIVITY_REMINDER",
                             title=f"Rappel {label} — {activity['title']}",
                             message=f"C'est le {target}. À très vite !", level="INFO",
                             resource_type="activity", resource_id=activity["activity_id"], link="/activities")
                sent += 1
        async for formation in db.formations.find({"date": target, "status": {"$in": ["PLANNED", "LIVE"]}},
                                                  {"_id": 0}):
            async for r in db.formation_registrations.find({"formation_id": formation["formation_id"]},
                                                           {"_id": 0, "user_id": 1}):
                key = f"formation:{formation['formation_id']}:{r['user_id']}:{label}"
                if await db.reminder_log.find_one({"key": key}):
                    continue
                await db.reminder_log.insert_one({"key": key, "created_at": iso(now_utc())})
                await notify(r["user_id"], type="FORMATION_REMINDER",
                             title=f"Rappel {label} — {formation['title']}",
                             message=f"Session le {target}. Le lien de connexion est sur la fiche.",
                             level="INFO", resource_type="formation",
                             resource_id=formation["formation_id"], link="/formations")
                sent += 1
        async for post in db.social_posts.find({"scheduled_date": target,
                                                "status": {"$in": ["DRAFT", "TO_VALIDATE", "SCHEDULED"]}},
                                               {"_id": 0}):
            recipient = post.get("assigned_user_id") or post.get("created_by")
            key = f"social:{post['post_id']}:{label}"
            if not recipient or await db.reminder_log.find_one({"key": key}):
                continue
            await db.reminder_log.insert_one({"key": key, "created_at": iso(now_utc())})
            await notify(recipient, type="SOCIAL_REMINDER", title=f"Rappel {label} — publication à poster",
                         message=f"« {post['title']} » est prévue le {target}.", level="ACTION",
                         resource_type="social_post", resource_id=post["post_id"], link="/social")
            sent += 1
    horizon = (today + timedelta(days=30)).isoformat()
    async for document in db.documents.find({"expiry_date": {"$ne": None, "$lte": horizon},
                                             "status": {"$nin": ["ARCHIVE", "EXPIRE"]},
                                             "reminder_sent": {"$ne": True}}, {"_id": 0}):
        await db.documents.update_one({"document_id": document["document_id"]},
                                      {"$set": {"reminder_sent": True, "status": "A_RENOUVELER"}})
        await notify_bureau(type="DOCUMENT_EXPIRING", title="Document à renouveler",
                            message=f"« {document['title']} » expire le {document['expiry_date']}.",
                            level="WARNING", resource_type="document",
                            resource_id=document["document_id"], link="/documents")
        sent += 1
    logger.info(f"[CRON] Rappels envoyés : {sent}")
    return sent


async def send_weekly_summary():
    week_ago = iso(now_utc() - timedelta(days=7))
    today = iso(now_utc())[:10]
    in_a_week = iso(now_utc() + timedelta(days=7))[:10]
    stats = {
        "à valider": await db.tasks.count_documents({"status": "PENDING_VALIDATION"}),
        "en retard": await db.tasks.count_documents(
            {"deadline": {"$lt": today, "$ne": None},
             "status": {"$nin": ["COMPLETED", "ARCHIVED", "CANCELLED"]}}),
        "adhésions en attente": await db.users.count_documents({"status": "PENDING"}),
        "besoins d'aide": await db.help_requests.count_documents({"status": "OPEN"}),
        "articles à relire": await db.articles.count_documents({"status": "PENDING_REVIEW"}),
        "remboursements en attente": await db.reimbursements.count_documents({"status": "PENDING"}),
    }
    done = await db.tasks.count_documents({"status": "COMPLETED", "completed_at": {"$gte": week_ago}})
    upcoming = await db.events.count_documents({"start_date": {"$gte": today, "$lte": in_a_week}})
    upcoming += await db.activities.count_documents({"date": {"$gte": today, "$lte": in_a_week}})
    details = " · ".join(f"{v} {k}" for k, v in stats.items() if v)
    await notify_bureau(
        type="WEEKLY_SUMMARY", title="Récapitulatif du lundi",
        message=f"{done} tâche(s) terminée(s) la semaine dernière, {upcoming} rendez-vous dans les 7 jours."
                + (f" À traiter : {details}." if details else " Rien en attente, beau travail !"),
        level="INFO", link="/admin/dashboard")
    await db.cron_runs.update_one({"run_id": f"summary:{today}"},
                                  {"$set": {"name": "weekly-summary", "stats": stats,
                                            "created_at": iso(now_utc())}}, upsert=True)
    logger.info(f"[CRON] Récapitulatif hebdomadaire envoyé : {stats}")
    return stats


@router.post("/cron/reminders")
async def cron_reminders(request: Request, background: BackgroundTasks, authorization: str = Header(None),
                         x_webhook_id: str = Header(None)):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    check_secret(authorization)
    body = {}
    try:
        body = await request.json()
    except Exception:
        body = {}
    run_id = x_webhook_id or body.get("run_id") or new_id("run")
    if not await claim_run("reminders", run_id):
        return {"ok": True, "duplicate": True}
    background.add_task(send_reminders)
    return {"ok": True, "queued": "reminders", "run_id": run_id}


@router.post("/cron/recap-email")
async def cron_recap_email(request: Request, background: BackgroundTasks, authorization: str = Header(None),
                           x_webhook_id: str = Header(None)):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    check_secret(authorization)
    try:
        body = await request.json()
    except Exception:
        body = {}
    run_id = x_webhook_id or body.get("run_id") or new_id("run")
    if not await claim_run("recap-email", run_id):
        return {"ok": True, "duplicate": True}
    from exports import send_recap_email
    background.add_task(send_recap_email)
    from exports import send_member_biweekly_recaps
    background.add_task(send_member_biweekly_recaps)
    return {"ok": True, "queued": "recap-email", "run_id": run_id}
@router.post("/cron/member-recaps")
async def cron_member_recaps(request: Request, background: BackgroundTasks,
                             authorization: str = Header(None), x_webhook_id: str = Header(None)):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    check_secret(authorization)
    try:
        body = await request.json()
    except Exception:
        body = {}
    run_id = x_webhook_id or body.get("run_id") or new_id("run")
    if not await claim_run("member-recaps", run_id):
        return {"ok": True, "duplicate": True}
    from exports import send_member_monthly_recaps
    background.add_task(send_member_monthly_recaps)
    return {"ok": True, "queued": "member-recaps", "run_id": run_id}


@router.post("/cron/weekly-summary")
async def cron_weekly_summary(request: Request, background: BackgroundTasks, authorization: str = Header(None),
                              x_webhook_id: str = Header(None)):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    check_secret(authorization)
    try:
        body = await request.json()
    except Exception:
        body = {}
    run_id = x_webhook_id or body.get("run_id") or new_id("run")
    if not await claim_run("weekly-summary", run_id):
        return {"ok": True, "duplicate": True}
    background.add_task(send_weekly_summary)
    return {"ok": True, "queued": "weekly-summary", "run_id": run_id}
