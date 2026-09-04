"""Prompt 8B: preferences notifications, offline loyalty stamp, help/join notifications.

Tests couvrent :
- GET /api/settings/notification-types (types + locked selon rôle)
- Inscription à une activité déclenche ACTIVITY_REGISTRATION vers pro responsable + Bureau
- Préférence notification_prefs.ACTIVITY_REGISTRATION:false coupe la notif pour le pro (pas le Bureau)
- POST /api/tasks/{id}/help → HELP_REQUEST aux membres équipe (hors auteur/Bureau)
- POST /api/projects/{id}/join-request → HELP_REQUEST aux membres équipe
- GET /api/loyalty/eligible → catalogue
- POST /api/loyalty/stamp (offline, scanned_at) → source QR_SCAN_OFFLINE, created_at = scanned_at
"""
import os
import time
from datetime import datetime, timedelta, timezone

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://pilotage-voix.preview.emergentagent.com").rstrip("/")

CREDS = {
    "bureau": ("associationlavoixduchien@gmail.com", "VoixDuChien2026!"),
    "pro1":   ("pro1.demo@lavoixduchien.fr",         "Demo2026!"),
    "pro2":   ("pro2.demo@lavoixduchien.fr",         "Demo2026!"),
    "m1":     ("membre1.demo@lavoixduchien.fr",      "Demo2026!"),
    "m2":     ("membre2.demo@lavoixduchien.fr",      "Demo2026!"),
}


def _login(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"login {email} failed: {r.status_code} {r.text[:200]}"
    return r.json()["access_token"]


def _h(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def tokens():
    out = {}
    for k, v in CREDS.items():
        try:
            out[k] = _login(*v)
        except AssertionError:
            if k == "m2":
                # m2 optional per credentials file
                out[k] = None
            else:
                raise
    return out


@pytest.fixture(scope="module")
def user_ids(tokens):
    ids = {}
    for k, tok in tokens.items():
        if not tok:
            continue
        r = requests.get(f"{BASE_URL}/api/auth/me", headers=_h(tok), timeout=15)
        assert r.status_code == 200, r.text
        ids[k] = r.json()["user"]["user_id"]
    return ids


# ---------------- notification-types ----------------
def test_notification_types_pro(tokens):
    r = requests.get(f"{BASE_URL}/api/settings/notification-types", headers=_h(tokens["pro1"]), timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert data["locked"] is False
    for t in ("ACTIVITY_REGISTRATION", "HELP_REQUEST", "REGISTRATION_CONFIRMED", "GENTLE_NUDGE"):
        assert t in data["types"], f"missing {t}"


def test_notification_types_bureau_locked(tokens):
    r = requests.get(f"{BASE_URL}/api/settings/notification-types", headers=_h(tokens["bureau"]), timeout=15)
    assert r.status_code == 200
    assert r.json()["locked"] is True


# ---------------- activity registration notifications ----------------
def _find_or_create_activity(tokens, user_ids):
    """Trouve ou crée une activité PLANNED créée par pro2 respectant la délégation."""
    r = requests.get(f"{BASE_URL}/api/activities", headers=_h(tokens["pro2"]), timeout=15)
    assert r.status_code == 200
    items = r.json().get("items") if isinstance(r.json(), dict) else r.json()
    for a in items:
        if (a.get("created_by") == user_ids["pro2"] and a.get("status") == "PLANNED"
                and (a.get("capacity") or 0) > 0):
            # ensure not full
            return a
    # Create
    date = (datetime.now(timezone.utc) + timedelta(days=5)).strftime("%Y-%m-%dT10:00:00+00:00")
    payload = {
        "title": "[TEST] Balade prompt8B",
        "description": "Test notif ACTIVITY_REGISTRATION",
        "category": "BALADE",
        "location": "Prairie du Moulin [DEMO]",
        "date": date,
        "duration_min": 60,
        "capacity": 8,
        "price": 0,
    }
    r = requests.post(f"{BASE_URL}/api/activities", headers=_h(tokens["pro2"]), json=payload, timeout=20)
    assert r.status_code in (200, 201), f"create activity failed: {r.status_code} {r.text[:300]}"
    return r.json()


def _clear_notifs(token, since_iso):
    """Récupère les notifs plus récentes que since_iso."""
    r = requests.get(f"{BASE_URL}/api/notifications", headers=_h(token), timeout=15)
    assert r.status_code == 200, r.text
    items = r.json().get("items", r.json()) if isinstance(r.json(), dict) else r.json()
    return [n for n in items if (n.get("created_at") or "") >= since_iso]


def _unregister_if(token, activity_id):
    requests.delete(f"{BASE_URL}/api/activities/{activity_id}/register", headers=_h(token), timeout=15)


def test_activity_registration_notifications_and_prefs(tokens, user_ids):
    activity = _find_or_create_activity(tokens, user_ids)
    aid = activity["activity_id"]

    # Cleanup any prior registrations
    _unregister_if(tokens["m1"], aid)
    if tokens.get("m2"):
        _unregister_if(tokens["m2"], aid)

    # Step 1: pref default (true) — m1 registers → pro2 + bureau notifs
    t0 = datetime.now(timezone.utc).isoformat()
    time.sleep(1)
    r = requests.post(f"{BASE_URL}/api/activities/{aid}/register",
                      headers=_h(tokens["m1"]), json={"role": "PARTICIPANT"}, timeout=20)
    assert r.status_code in (200, 201), f"register m1 failed: {r.status_code} {r.text[:200]}"
    time.sleep(1)

    pro2_notifs = [n for n in _clear_notifs(tokens["pro2"], t0)
                   if n.get("type") == "ACTIVITY_REGISTRATION" and aid in (n.get("resource_id") or "")]
    assert pro2_notifs, "pro2 (créateur) devrait recevoir ACTIVITY_REGISTRATION"

    bureau_notifs = [n for n in _clear_notifs(tokens["bureau"], t0)
                     if n.get("type") == "ACTIVITY_REGISTRATION" and aid in (n.get("resource_id") or "")]
    assert bureau_notifs, "Bureau devrait recevoir ACTIVITY_REGISTRATION"

    # Step 2: pro2 disable ACTIVITY_REGISTRATION pref
    r = requests.put(f"{BASE_URL}/api/profiles/me/preferences", headers=_h(tokens["pro2"]),
                     json={"notification_prefs": {"ACTIVITY_REGISTRATION": False}}, timeout=15)
    assert r.status_code == 200, r.text

    # Re-register via m2 (fallback: unregister m1 then re-register m1)
    if tokens.get("m2"):
        _unregister_if(tokens["m2"], aid)
        second_tok = tokens["m2"]
    else:
        _unregister_if(tokens["m1"], aid)
        second_tok = tokens["m1"]
    t1 = datetime.now(timezone.utc).isoformat()
    time.sleep(1)
    r = requests.post(f"{BASE_URL}/api/activities/{aid}/register",
                      headers=_h(second_tok), json={"role": "PARTICIPANT"}, timeout=20)
    assert r.status_code in (200, 201), f"second register failed: {r.status_code} {r.text[:200]}"
    time.sleep(1)

    pro2_new = [n for n in _clear_notifs(tokens["pro2"], t1)
                if n.get("type") == "ACTIVITY_REGISTRATION" and aid in (n.get("resource_id") or "")]
    assert not pro2_new, f"pro2 ne devrait PAS recevoir ACTIVITY_REGISTRATION avec pref off, mais {len(pro2_new)} reçue(s)"

    bureau_new = [n for n in _clear_notifs(tokens["bureau"], t1)
                  if n.get("type") == "ACTIVITY_REGISTRATION" and aid in (n.get("resource_id") or "")]
    assert bureau_new, "Bureau doit toujours recevoir (locked)"

    # Cleanup: restore pref, unregister
    r = requests.put(f"{BASE_URL}/api/profiles/me/preferences", headers=_h(tokens["pro2"]),
                     json={"notification_prefs": {"ACTIVITY_REGISTRATION": True}}, timeout=15)
    assert r.status_code == 200
    _unregister_if(tokens["m1"], aid)
    if tokens.get("m2"):
        _unregister_if(tokens["m2"], aid)


# ---------------- loyalty offline stamp ----------------
def test_loyalty_eligible_and_offline_stamp(tokens, user_ids):
    # 1) pro1 fetch eligible catalog
    r = requests.get(f"{BASE_URL}/api/loyalty/eligible", headers=_h(tokens["pro1"]), timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "eligible_activities" in data and "eligible_events" in data
    eligible = data["eligible_activities"]
    if not eligible:
        pytest.skip("Aucune activité éligible en base pour tester le tampon offline")

    # 2) membre1 qr_token
    r = requests.get(f"{BASE_URL}/api/loyalty/me", headers=_h(tokens["m1"]), timeout=15)
    assert r.status_code == 200, r.text
    qr_token = r.json()["card"]["qr_token"]

    # find an activity not already stamped for m1
    r = requests.post(f"{BASE_URL}/api/loyalty/scan", headers=_h(tokens["pro1"]),
                      json={"qr_token": qr_token}, timeout=15)
    assert r.status_code == 200, r.text
    summary = r.json()
    candidate = next((a for a in summary["eligible_activities"] if not a["already_stamped"]), None)
    if not candidate:
        pytest.skip("Toutes les activités éligibles déjà tamponnées pour membre1")

    scanned_at = "2026-06-01T10:00:00+00:00"
    r = requests.post(f"{BASE_URL}/api/loyalty/stamp", headers=_h(tokens["pro1"]),
                      json={"qr_token": qr_token, "activity_id": candidate["activity_id"],
                            "scanned_at": scanned_at, "offline": True}, timeout=15)
    assert r.status_code == 200, f"stamp offline failed: {r.status_code} {r.text[:300]}"
    stamp = r.json()["stamp"]
    assert stamp["source"] == "QR_SCAN_OFFLINE"
    assert stamp["created_at"] == scanned_at
    stamp_id = stamp["stamp_id"]

    # 3) history reflects the stamp
    r = requests.get(f"{BASE_URL}/api/loyalty/history", headers=_h(tokens["m1"]), timeout=15)
    assert r.status_code == 200
    items = r.json()["items"]
    found = [s for s in items if s.get("stamp_id") == stamp_id]
    assert found, "tampon offline manquant dans /loyalty/history"
    assert found[0]["source"] == "QR_SCAN_OFFLINE"
    assert found[0]["created_at"] == scanned_at

    # Cleanup: bureau delete stamp
    r = requests.delete(f"{BASE_URL}/api/loyalty/stamps/{stamp_id}?reason=cleanup+test+prompt8b",
                        headers=_h(tokens["bureau"]), timeout=15)
    assert r.status_code == 200, f"delete stamp failed: {r.status_code} {r.text[:200]}"


# ---------------- HELP_REQUEST : project join-request ----------------
def _find_project_with_team(tokens, user_ids):
    """Trouve un projet où m1 est team ACTIVE — sinon Bureau l'ajoute au premier projet."""
    r = requests.get(f"{BASE_URL}/api/projects", headers=_h(tokens["bureau"]), timeout=15)
    assert r.status_code == 200
    body = r.json()
    projects = body.get("items") if isinstance(body, dict) else body
    if not projects:
        pytest.skip("Pas de projet en base")
    # Try to find one where m1 is in team
    for p in projects:
        r = requests.get(f"{BASE_URL}/api/projects/{p['project_id']}", headers=_h(tokens["bureau"]), timeout=15)
        if r.status_code != 200:
            continue
        detail = r.json()
        proj = detail.get("project") or detail
        team = detail.get("team") or []
        if any((m.get("member_id") == user_ids["m1"] and m.get("status") == "ACTIVE") for m in team):
            return proj
    # Otherwise pick first and add m1 to team
    project = projects[0]
    pid = project["project_id"]
    r = requests.post(f"{BASE_URL}/api/projects/{pid}/team",
                      headers=_h(tokens["bureau"]),
                      json={"member_id": user_ids["m1"], "role": "MEMBER"}, timeout=15)
    if r.status_code not in (200, 201):
        r2 = requests.post(f"{BASE_URL}/api/projects/{pid}/members",
                           headers=_h(tokens["bureau"]),
                           json={"member_id": user_ids["m1"]}, timeout=15)
        if r2.status_code not in (200, 201):
            pytest.skip(f"Impossible d'ajouter m1 à l'équipe du projet: {r.status_code}/{r2.status_code} {r.text[:200]}")
    r = requests.get(f"{BASE_URL}/api/projects/{pid}", headers=_h(tokens["bureau"]), timeout=15)
    return r.json().get("project") or r.json()


def test_help_request_join(tokens, user_ids):
    project = _find_project_with_team(tokens, user_ids)
    pid = project["project_id"]

    author_tok = tokens.get("m2") or tokens["pro1"]
    author_key = "m2" if tokens.get("m2") else "pro1"

    t0 = datetime.now(timezone.utc).isoformat()
    time.sleep(1)
    r = requests.post(f"{BASE_URL}/api/projects/{pid}/join-request",
                      headers=_h(author_tok),
                      json={"comment": "[TEST] souhaite rejoindre"}, timeout=15)
    assert r.status_code == 200, f"join-request failed: {r.status_code} {r.text[:200]}"
    time.sleep(1)

    m1_notifs = [n for n in _clear_notifs(tokens["m1"], t0)
                 if n.get("type") == "HELP_REQUEST" and pid in (n.get("resource_id") or "")]
    assert m1_notifs, "m1 (team) devrait recevoir HELP_REQUEST sur join-request"

    # Author doesn't get self-notif
    author_notifs = [n for n in _clear_notifs(author_tok, t0)
                     if n.get("type") == "HELP_REQUEST" and pid in (n.get("resource_id") or "")]
    assert not author_notifs, f"L'auteur ({author_key}) ne doit pas se notifier lui-même"


# ---------------- HELP_REQUEST : task help ----------------
def test_help_request_task(tokens, user_ids):
    # Find a task in a project where m1 is in team ACTIVE
    project = _find_project_with_team(tokens, user_ids)
    pid = project["project_id"]

    r = requests.get(f"{BASE_URL}/api/projects/{pid}/tasks", headers=_h(tokens["bureau"]), timeout=15)
    if r.status_code != 200:
        r = requests.get(f"{BASE_URL}/api/tasks?project_id={pid}", headers=_h(tokens["bureau"]), timeout=15)
    if r.status_code != 200:
        pytest.skip(f"Pas d'endpoint tasks trouvé: {r.status_code}")
    body = r.json()
    tasks = body.get("items") if isinstance(body, dict) else body
    if not tasks:
        # Create a task
        r = requests.post(f"{BASE_URL}/api/projects/{pid}/tasks", headers=_h(tokens["bureau"]),
                          json={"title": "[TEST] tâche help prompt8B"}, timeout=15)
        if r.status_code in (200, 201):
            tasks = [r.json()]
        else:
            pytest.skip(f"Impossible de créer une tâche: {r.status_code} {r.text[:150]}")

    task_id = tasks[0].get("task_id") or tasks[0].get("id")
    if not task_id:
        pytest.skip("task_id introuvable")

    t0 = datetime.now(timezone.utc).isoformat()
    time.sleep(1)
    # Bureau posts help → m1 (team) should receive HELP_REQUEST
    r = requests.post(f"{BASE_URL}/api/tasks/{task_id}/help", headers=_h(tokens["bureau"]),
                     json={"comment": "[TEST] besoin d'aide prompt8b"}, timeout=15)
    assert r.status_code == 200, f"/tasks/{task_id}/help failed: {r.status_code} {r.text[:200]}"
    time.sleep(1)

    m1_notifs = [n for n in _clear_notifs(tokens["m1"], t0)
                 if n.get("type") == "HELP_REQUEST" and pid in (n.get("link") or "")]
    assert m1_notifs, "m1 (équipe) doit recevoir HELP_REQUEST sur task help"
