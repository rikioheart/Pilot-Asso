"""Prompt 8 Lot C: Délégation publication, Onboarding guides, Block visibility."""
import os
import time
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://pilotage-voix.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

BUREAU = ("associationlavoixduchien@gmail.com", "VoixDuChien2026!")
PRO1 = ("pro1.demo@lavoixduchien.fr", "Demo2026!")
PRO2 = ("pro2.demo@lavoixduchien.fr", "Demo2026!")
MEMBRE1 = ("membre1.demo@lavoixduchien.fr", "Demo2026!")


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, f"login {email}: {r.status_code} {r.text}"
    return r.json()["access_token"]


def H(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def tokens():
    return {
        "bureau": _login(*BUREAU),
        "pro1": _login(*PRO1),
        "pro2": _login(*PRO2),
        "membre1": _login(*MEMBRE1),
    }


# ------------------------------------------------------------ Délégation settings
class TestDelegationSettings:
    def test_get_delegation_default(self, tokens):
        r = requests.get(f"{API}/settings/delegation", headers=H(tokens["pro1"]))
        assert r.status_code == 200
        data = r.json()
        assert data["enabled"] is True
        assert "PRO_COORDINATEUR" in data["levels"]
        assert data["max_capacity"] == 12
        assert data["max_price"] == 0
        assert data["min_days_ahead"] == 3
        assert data["moderation_hours"] == 48
        assert data["require_association_terrain"] is True

    def test_put_delegation_pro_forbidden(self, tokens):
        r = requests.put(f"{API}/settings/delegation", headers=H(tokens["pro1"]),
                         json={"max_capacity": 20})
        assert r.status_code == 403

    def test_put_delegation_bureau_update_and_restore(self, tokens):
        r = requests.put(f"{API}/settings/delegation", headers=H(tokens["bureau"]),
                         json={"max_capacity": 10})
        assert r.status_code == 200
        assert r.json()["max_capacity"] == 10
        # restore
        r2 = requests.put(f"{API}/settings/delegation", headers=H(tokens["bureau"]),
                          json={"max_capacity": 12})
        assert r2.status_code == 200
        assert r2.json()["max_capacity"] == 12


# ------------------------------------------------------------ Délégation activités
def _future_date(days=5):
    return (datetime.now(timezone.utc) + timedelta(days=days)).date().isoformat()


@pytest.fixture(scope="module")
def created_activities():
    ids = []
    yield ids
    # cleanup: archive via update status
    bureau_token = _login(*BUREAU)
    for aid in ids:
        requests.put(f"{API}/activities/{aid}", headers=H(bureau_token),
                     json={"status": "ARCHIVED"})


class TestDelegationActivities:
    def test_pro2_delegated_publication_ok(self, tokens, created_activities):
        payload = {
            "title": f"[TEST] Balade déléguée {uuid.uuid4().hex[:6]}",
            "category": "BALADE", "type": "COLLECTIVE",
            "date": _future_date(5), "location": "Prairie du Moulin [DEMO]",
            "capacity": 8, "price_public": 0, "price_member": 0,
            "visibility": "MEMBERS",
        }
        r = requests.post(f"{API}/activities", headers=H(tokens["pro2"]), json=payload)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["status"] == "PLANNED"
        assert data["delegated_publication"] is True
        assert data["moderation_until"] is not None
        created_activities.append(data["activity_id"])
        # Check bureau notification
        time.sleep(0.5)
        nr = requests.get(f"{API}/notifications", headers=H(tokens["bureau"]), params={"limit": 20})
        assert nr.status_code == 200
        types = [n.get("type") for n in nr.json().get("items", [])]
        assert "DELEGATED_PUBLICATION" in types

    def test_pro2_over_capacity_proposed(self, tokens, created_activities):
        payload = {
            "title": f"[TEST] Trop grande {uuid.uuid4().hex[:6]}",
            "category": "BALADE", "type": "COLLECTIVE",
            "date": _future_date(5), "location": "Prairie du Moulin [DEMO]",
            "capacity": 30, "price_public": 0, "price_member": 0,
            "visibility": "MEMBERS",
        }
        r = requests.post(f"{API}/activities", headers=H(tokens["pro2"]), json=payload)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["status"] == "PROPOSED"
        assert data["delegated_publication"] is False
        created_activities.append(data["activity_id"])

    def test_pro2_bad_location_proposed(self, tokens, created_activities):
        payload = {
            "title": f"[TEST] Hors terrain {uuid.uuid4().hex[:6]}",
            "category": "BALADE", "type": "COLLECTIVE",
            "date": _future_date(5), "location": "Chez moi",
            "capacity": 8, "price_public": 0, "price_member": 0,
            "visibility": "MEMBERS",
        }
        r = requests.post(f"{API}/activities", headers=H(tokens["pro2"]), json=payload)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["status"] == "PROPOSED"
        assert data["delegated_publication"] is False
        created_activities.append(data["activity_id"])


# ------------------------------------------------------------ Délégation événements
@pytest.fixture(scope="module")
def created_events():
    ids = []
    yield ids
    bureau_token = _login(*BUREAU)
    for eid in ids:
        requests.delete(f"{API}/events/{eid}", headers=H(bureau_token))


class TestDelegationEvents:
    def test_pro2_event_delegated_ok(self, tokens, created_events):
        payload = {
            "title": f"[TEST] Event délégué {uuid.uuid4().hex[:6]}",
            "event_type": "ONE_OFF",
            "start_date": _future_date(5),
            "location": "Prairie du Moulin [DEMO]",
            "capacity": 8, "status": "PLANNED", "visibility": "MEMBERS",
        }
        r = requests.post(f"{API}/events", headers=H(tokens["pro2"]), json=payload)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["status"] == "PLANNED"
        assert data["delegated_publication"] is True
        created_events.append(data["event_id"])

    def test_pro2_event_over_capacity_draft(self, tokens, created_events):
        payload = {
            "title": f"[TEST] Event trop grand {uuid.uuid4().hex[:6]}",
            "event_type": "ONE_OFF",
            "start_date": _future_date(5),
            "location": "Prairie du Moulin [DEMO]",
            "capacity": 40, "status": "PLANNED", "visibility": "MEMBERS",
        }
        r = requests.post(f"{API}/events", headers=H(tokens["pro2"]), json=payload)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["status"] == "DRAFT"
        assert data.get("pending_validation") is True
        assert data.get("delegation_reasons")
        created_events.append(data["event_id"])

    def test_bureau_event_no_delegation(self, tokens, created_events):
        payload = {
            "title": f"[TEST] Event bureau {uuid.uuid4().hex[:6]}",
            "event_type": "ONE_OFF",
            "start_date": _future_date(5),
            "location": "Chez moi", "capacity": 100,
            "status": "PLANNED", "visibility": "MEMBERS",
        }
        r = requests.post(f"{API}/events", headers=H(tokens["bureau"]), json=payload)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["status"] == "PLANNED"
        assert data["delegated_publication"] is False
        created_events.append(data["event_id"])


# ------------------------------------------------------------ Onboarding
class TestOnboarding:
    def test_get_onboarding_bureau(self, tokens):
        r = requests.get(f"{API}/settings/onboarding", headers=H(tokens["bureau"]))
        assert r.status_code == 200
        data = r.json()
        assert "guides" in data
        assert isinstance(data["available"], list)
        assert len(data["available"]) > 0

    def test_get_onboarding_pro_forbidden(self, tokens):
        r = requests.get(f"{API}/settings/onboarding", headers=H(tokens["pro1"]))
        assert r.status_code == 403

    def test_put_onboarding_invalid_guide(self, tokens):
        r = requests.put(f"{API}/settings/onboarding", headers=H(tokens["bureau"]),
                         json={"guides": {"PARTICULIER": ["gui_unknown_xxx"]}})
        assert r.status_code == 400

    def test_put_onboarding_pro_forbidden(self, tokens):
        r = requests.put(f"{API}/settings/onboarding", headers=H(tokens["pro1"]),
                         json={"guides": {}})
        assert r.status_code == 403

    def test_onboarding_flow_and_notification(self, tokens):
        # pick a published guide
        r = requests.get(f"{API}/settings/onboarding", headers=H(tokens["bureau"]))
        available = r.json()["available"]
        assert available, "No published guides available"
        guide_id = available[0]["guide_id"]

        # Set config
        rp = requests.put(f"{API}/settings/onboarding", headers=H(tokens["bureau"]),
                         json={"guides": {"PARTICULIER": [guide_id]}})
        assert rp.status_code == 200, rp.text

        # Register a PENDING user
        suffix = uuid.uuid4().hex[:8]
        email = f"TEST_onboarding_{suffix}@example.com"
        password = "TestPass2026!"
        rr = requests.post(f"{API}/auth/register", json={
            "email": email, "password": password,
            "first_name": "Test", "last_name": "Onboard",
            "role": "PARTICULIER",
        })
        assert rr.status_code == 200, rr.text
        new_user = rr.json()["user"]
        user_id = new_user["user_id"]

        # Bureau activates
        ru = requests.put(f"{API}/members/{user_id}", headers=H(tokens["bureau"]),
                          json={"status": "ACTIVE"})
        assert ru.status_code == 200, ru.text
        time.sleep(0.5)

        # Login as new user and check notifications
        try:
            new_token = _login(email, password)
            rn = requests.get(f"{API}/notifications", headers=H(new_token), params={"limit": 20})
            assert rn.status_code == 200
            items = rn.json().get("items", [])
            onboarding_notifs = [n for n in items if n.get("type") == "ONBOARDING_GUIDE"]
            assert onboarding_notifs, f"No ONBOARDING_GUIDE notif in {[n.get('type') for n in items]}"
            assert any(f"/aide?guide={guide_id}" == n.get("link") for n in onboarding_notifs)
        finally:
            # Cleanup: reset config and archive user
            requests.put(f"{API}/settings/onboarding", headers=H(tokens["bureau"]),
                         json={"guides": {}})
            requests.put(f"{API}/members/{user_id}", headers=H(tokens["bureau"]),
                         json={"status": "ARCHIVED"})


# ------------------------------------------------------------ Block visibility
class TestBlockVisibility:
    def test_get_block_visibility_member(self, tokens):
        r = requests.get(f"{API}/settings/block-visibility", headers=H(tokens["membre1"]))
        assert r.status_code == 200
        data = r.json()
        assert "blocks" in data and "roles" in data and "hidden" in data
        assert "member.dogs" in data["blocks"]

    def test_put_bad_block_key(self, tokens):
        r = requests.put(f"{API}/settings/block-visibility", headers=H(tokens["bureau"]),
                         json={"hidden": {"invalid.block": ["PARTICULIER"]}})
        assert r.status_code == 400

    def test_put_member_forbidden(self, tokens):
        r = requests.put(f"{API}/settings/block-visibility", headers=H(tokens["membre1"]),
                         json={"hidden": {}})
        assert r.status_code == 403

    def test_put_bureau_ok_and_restore(self, tokens):
        r = requests.put(f"{API}/settings/block-visibility", headers=H(tokens["bureau"]),
                         json={"hidden": {"member.dogs": ["PARTICULIER"]}})
        assert r.status_code == 200
        assert r.json()["hidden"].get("member.dogs") == ["PARTICULIER"]
        # restore
        r2 = requests.put(f"{API}/settings/block-visibility", headers=H(tokens["bureau"]),
                          json={"hidden": {}})
        assert r2.status_code == 200
        assert r2.json()["hidden"] == {}


# ------------------------------------------------------------ Admin dashboard delegated_recent
class TestAdminDashboard:
    def test_delegated_recent_present(self, tokens):
        r = requests.get(f"{API}/dashboard/admin", headers=H(tokens["bureau"]))
        assert r.status_code == 200
        data = r.json()
        assert "delegated_recent" in data
        assert isinstance(data["delegated_recent"], list)
