"""Prompt 8C — Payments, Comments, Weather, MapEmbed (embed=noKey)."""
import os
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://pilotage-voix.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

BUREAU = ("associationlavoixduchien@gmail.com", "VoixDuChien2026!")
MEMBRE1 = ("membre1.demo@lavoixduchien.fr", "Demo2026!")
PRO1 = ("pro1.demo@lavoixduchien.fr", "Demo2026!")


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, f"login {email}: {r.status_code} {r.text}"
    return r.json()["access_token"]


def H(tok):
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def tokens():
    return {"bureau": _login(*BUREAU), "m1": _login(*MEMBRE1), "pro1": _login(*PRO1)}


@pytest.fixture(scope="module")
def m1_user_id():
    r = requests.post(f"{API}/auth/login", json={"email": MEMBRE1[0], "password": MEMBRE1[1]})
    assert r.status_code == 200
    return r.json()["user"]["user_id"]


# ---------------- PAYMENTS ----------------
class TestPayments:
    def test_forbidden_for_member(self, tokens):
        r = requests.get(f"{API}/payments", headers=H(tokens["m1"]))
        assert r.status_code in (401, 403)

    def test_summary_ok_bureau(self, tokens):
        r = requests.get(f"{API}/payments/summary", headers=H(tokens["bureau"]))
        assert r.status_code == 200
        data = r.json()
        assert "by_status" in data and "total_amount" in data

    def test_crud_and_status_change(self, tokens, m1_user_id):
        payload = {"user_id": m1_user_id, "type": "COTISATION", "amount": 25,
                   "status": "EN_ATTENTE", "label": f"TEST_ cotis {uuid.uuid4().hex[:6]}"}
        r = requests.post(f"{API}/payments", headers=H(tokens["bureau"]), json=payload)
        assert r.status_code == 200, r.text
        pay = r.json()
        pid = pay["payment_id"]
        assert pay["status"] == "EN_ATTENTE"
        assert pay["amount"] == 25
        assert pay["member_name"]

        # list & filter
        r = requests.get(f"{API}/payments", headers=H(tokens["bureau"]),
                         params={"status": "EN_ATTENTE", "type": "COTISATION"})
        assert r.status_code == 200
        assert any(p["payment_id"] == pid for p in r.json()["items"])

        # update status -> PAYE
        r = requests.put(f"{API}/payments/{pid}", headers=H(tokens["bureau"]),
                         json={"status": "PAYE"})
        assert r.status_code == 200
        assert r.json()["status"] == "PAYE"

        # verify via get (list)
        r = requests.get(f"{API}/payments", headers=H(tokens["bureau"]))
        assert r.status_code == 200
        found = [p for p in r.json()["items"] if p["payment_id"] == pid][0]
        assert found["status"] == "PAYE"

        # /payments/me for m1 should show it
        r = requests.get(f"{API}/payments/me", headers=H(tokens["m1"]))
        assert r.status_code == 200
        assert any(p["payment_id"] == pid for p in r.json()["items"])

        # delete
        r = requests.delete(f"{API}/payments/{pid}", headers=H(tokens["bureau"]))
        assert r.status_code == 200
        r = requests.get(f"{API}/payments", headers=H(tokens["bureau"]))
        assert not any(p["payment_id"] == pid for p in r.json()["items"])

    def test_invalid_type(self, tokens, m1_user_id):
        r = requests.post(f"{API}/payments", headers=H(tokens["bureau"]),
                          json={"user_id": m1_user_id, "type": "BAD", "amount": 10})
        assert r.status_code == 400

    def test_overdue_sweep(self, tokens, m1_user_id):
        # Create a payment, then force created_at to be > 21 days ago via DB is not accessible via API.
        # Instead we call the cron endpoint and verify it works (idempotent).
        cron_secret = os.environ.get("WEBHOOK_CRON_SECRET", "vdc_cron_9f4b2e7a1c6d8035be4712af95d3c60e")
        r = requests.post(f"{API}/cron/reminders",
                          headers={"Authorization": f"Bearer {cron_secret}"})
        # 200 whether or not it swept anything
        assert r.status_code in (200, 204), r.text


# ---------------- WEATHER ----------------
class TestWeather:
    def test_weather_settings_bureau(self, tokens):
        r = requests.get(f"{API}/settings/weather", headers=H(tokens["bureau"]))
        assert r.status_code == 200
        assert "configured" in r.json()

    def test_weather_settings_member_forbidden(self, tokens):
        r = requests.get(f"{API}/settings/weather", headers=H(tokens["m1"]))
        assert r.status_code in (401, 403)

    def test_weather_endpoint_not_configured(self, tokens):
        r = requests.get(f"{API}/weather", headers=H(tokens["m1"]),
                         params={"location": "Nantes"})
        assert r.status_code == 200
        data = r.json()
        # main expectation: not configured
        assert data.get("configured") is False


# ---------------- COMMENTS ----------------
@pytest.fixture(scope="module")
def event_id(tokens):
    payload = {
        "title": f"TEST_ Event 8C {uuid.uuid4().hex[:6]}",
        "event_type": "ONE_OFF",
        "start_date": (datetime.now(timezone.utc) + timedelta(days=5)).date().isoformat(),
        "location": "Prairie du Moulin [DEMO]",
        "address": "1 rue du Test, Nantes",
        "google_meet_url": "https://meet.google.com/abc-defg-hij",
        "google_forms_url": "https://forms.gle/xyz123",
        "capacity": 10, "status": "PLANNED", "visibility": "MEMBERS",
    }
    r = requests.post(f"{API}/events", headers=H(tokens["bureau"]), json=payload)
    assert r.status_code == 200, r.text
    eid = r.json()["event_id"]
    yield eid
    requests.delete(f"{API}/events/{eid}", headers=H(tokens["bureau"]))


class TestComments:
    def test_event_fields_persisted(self, tokens, event_id):
        r = requests.get(f"{API}/events/{event_id}", headers=H(tokens["bureau"]))
        assert r.status_code == 200
        body = r.json()
        e = body.get("event", body)
        assert e.get("google_meet_url") == "https://meet.google.com/abc-defg-hij"
        assert e.get("google_forms_url") == "https://forms.gle/xyz123"
        assert e.get("address")

    def test_mentionable(self, tokens, event_id):
        r = requests.get(f"{API}/comments/mentionable",
                         headers=H(tokens["bureau"]),
                         params={"element_type": "event", "element_id": event_id})
        assert r.status_code == 200
        assert "items" in r.json()

    def test_bad_element_type(self, tokens, event_id):
        r = requests.get(f"{API}/comments",
                         headers=H(tokens["bureau"]),
                         params={"element_type": "banana", "element_id": event_id})
        assert r.status_code == 400

    def test_crud_and_visibility(self, tokens, event_id):
        # bureau posts PROS_BUREAU comment
        r = requests.post(f"{API}/comments", headers=H(tokens["bureau"]),
                          json={"element_type": "event", "element_id": event_id,
                                "text": "TEST_ interne pros/bureau", "visibility": "PROS_BUREAU"})
        assert r.status_code == 200, r.text
        cid_private = r.json()["comment_id"]

        # public comment by bureau
        r = requests.post(f"{API}/comments", headers=H(tokens["bureau"]),
                          json={"element_type": "event", "element_id": event_id,
                                "text": "TEST_ public tous", "visibility": "TOUS"})
        assert r.status_code == 200
        cid_public = r.json()["comment_id"]

        # bureau sees both
        r = requests.get(f"{API}/comments", headers=H(tokens["bureau"]),
                         params={"element_type": "event", "element_id": event_id})
        assert r.status_code == 200
        ids = [c["comment_id"] for c in r.json()["items"]]
        assert cid_private in ids and cid_public in ids
        assert r.json()["can_moderate"] is True

        # member should NOT see PROS_BUREAU
        r = requests.get(f"{API}/comments", headers=H(tokens["m1"]),
                         params={"element_type": "event", "element_id": event_id})
        assert r.status_code == 200
        ids_m = [c["comment_id"] for c in r.json()["items"]]
        assert cid_public in ids_m
        assert cid_private not in ids_m

        # member CANNOT post PROS_BUREAU
        r = requests.post(f"{API}/comments", headers=H(tokens["m1"]),
                          json={"element_type": "event", "element_id": event_id,
                                "text": "hack", "visibility": "PROS_BUREAU"})
        assert r.status_code == 403

        # delete
        for cid in (cid_private, cid_public):
            r = requests.delete(f"{API}/comments/{cid}", headers=H(tokens["bureau"]))
            assert r.status_code == 200
