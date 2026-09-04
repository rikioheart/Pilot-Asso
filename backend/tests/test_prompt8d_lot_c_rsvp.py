"""Prompt 8D Lot C — RSVP 3 états, propositions PRO_COORDINATEUR, mentions, badges annuaire."""
import os
import time
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://pilotage-voix.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

BUREAU = ("associationlavoixduchien@gmail.com", "VoixDuChien2026!")
PRO1 = ("pro1.demo@lavoixduchien.fr", "Demo2026!")  # PRO_STANDARD
PRO2 = ("pro2.demo@lavoixduchien.fr", "Demo2026!")  # PRO_COORDINATEUR
MEMBRE1 = ("membre1.demo@lavoixduchien.fr", "Demo2026!")


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, f"login {email} failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


def H(t):
    return {"Authorization": f"Bearer {t}"}


def _future(days=7):
    return (datetime.now(timezone.utc) + timedelta(days=days)).date().isoformat()


@pytest.fixture(scope="module")
def tokens():
    return {
        "bureau": _login(*BUREAU),
        "pro1": _login(*PRO1),
        "pro2": _login(*PRO2),
        "membre1": _login(*MEMBRE1),
    }


@pytest.fixture(scope="module")
def cleanup_ids():
    ids = {"activities": [], "events": [], "rules": []}
    yield ids
    bt = _login(*BUREAU)
    for aid in ids["activities"]:
        try:
            requests.put(f"{API}/activities/{aid}", headers=H(bt), json={"status": "ARCHIVED"})
        except Exception:
            pass
    for eid in ids["events"]:
        try:
            requests.delete(f"{API}/events/{eid}", headers=H(bt))
        except Exception:
            pass
    for rid in ids["rules"]:
        try:
            requests.delete(f"{API}/loyalty/rules/{rid}", headers=H(bt))
        except Exception:
            pass


class TestRsvpStates:
    def test_summary_activity_ok(self, tokens):
        # find an activity
        r = requests.get(f"{API}/activities", headers=H(tokens["bureau"]), params={"limit": 5})
        assert r.status_code == 200
        items = r.json().get("items", [])
        if not items:
            pytest.skip("No activities available")
        aid = items[0]["activity_id"]
        s = requests.get(f"{API}/rsvp/summary", headers=H(tokens["bureau"]),
                         params={"element_type": "activity", "element_id": aid})
        assert s.status_code == 200
        data = s.json()
        assert "counts" in data and "can_detail" in data
        assert data["can_detail"] is True
        for st in ["PARTICIPE", "PEUT_ETRE", "PAS_POSSIBLE"]:
            assert st in data["counts"]
            assert "total" in data["counts"][st]
            assert "by_role" in data["counts"][st]

    def test_summary_particulier_no_detail(self, tokens):
        r = requests.get(f"{API}/activities", headers=H(tokens["membre1"]), params={"limit": 5})
        items = r.json().get("items", [])
        if not items:
            pytest.skip("No activities")
        aid = items[0]["activity_id"]
        s = requests.get(f"{API}/rsvp/summary", headers=H(tokens["membre1"]),
                         params={"element_type": "activity", "element_id": aid})
        assert s.status_code == 200
        data = s.json()
        assert data["can_detail"] is False
        assert "responders" not in data

    def test_peut_etre_and_participe_role_breakdown(self, tokens):
        # Create activity as bureau
        payload = {
            "title": f"[TEST] RSVP roles {uuid.uuid4().hex[:6]}",
            "category": "BALADE", "type": "COLLECTIVE",
            "date": _future(7), "location": "Prairie du Moulin [DEMO]",
            "capacity": 10, "price_public": 0, "price_member": 0,
            "visibility": "MEMBERS",
        }
        c = requests.post(f"{API}/activities", headers=H(tokens["bureau"]), json=payload)
        assert c.status_code == 200
        aid = c.json()["activity_id"]

        try:
            # Membre PEUT_ETRE
            r1 = requests.post(f"{API}/rsvp", headers=H(tokens["membre1"]),
                               json={"element_type": "activity", "element_id": aid, "state": "PEUT_ETRE"})
            assert r1.status_code == 200
            # Pro2 PARTICIPE
            r2 = requests.post(f"{API}/rsvp", headers=H(tokens["pro2"]),
                               json={"element_type": "activity", "element_id": aid, "state": "PARTICIPE"})
            assert r2.status_code == 200

            time.sleep(0.3)
            s = requests.get(f"{API}/rsvp/summary", headers=H(tokens["bureau"]),
                             params={"element_type": "activity", "element_id": aid})
            data = s.json()
            assert data["counts"]["PEUT_ETRE"]["by_role"]["MEMBRE"] >= 1
            assert data["counts"]["PARTICIPE"]["by_role"]["PRO"] >= 1
            # Detail nominatif
            assert "responders" in data
            names_participe = [p["display_name"] for p in data["responders"]["PARTICIPE"]]
            assert any(names_participe)

            # Toggle PARTICIPE off (delete)
            d = requests.delete(f"{API}/rsvp", headers=H(tokens["pro2"]),
                                params={"element_type": "activity", "element_id": aid})
            assert d.status_code == 200
            s2 = requests.get(f"{API}/rsvp/summary", headers=H(tokens["bureau"]),
                              params={"element_type": "activity", "element_id": aid})
            assert s2.json()["counts"]["PARTICIPE"]["by_role"]["PRO"] == 0
        finally:
            requests.put(f"{API}/activities/{aid}", headers=H(tokens["bureau"]),
                         json={"status": "ARCHIVED"})

    def test_invalid_state(self, tokens):
        r = requests.get(f"{API}/activities", headers=H(tokens["bureau"]), params={"limit": 1})
        items = r.json().get("items", [])
        if not items:
            pytest.skip("no activities")
        aid = items[0]["activity_id"]
        rr = requests.post(f"{API}/rsvp", headers=H(tokens["membre1"]),
                           json={"element_type": "activity", "element_id": aid, "state": "INVALID"})
        assert rr.status_code == 400

    def test_rsvp_terrain_slot_accepted(self, tokens):
        # find a terrain slot if any
        r = requests.get(f"{API}/terrain/slots", headers=H(tokens["bureau"]))
        if r.status_code != 200:
            pytest.skip("no terrain slots endpoint")
        items = r.json() if isinstance(r.json(), list) else r.json().get("items", [])
        if not items:
            pytest.skip("no terrain slots")
        sid = items[0].get("slot_id") or items[0].get("id")
        if not sid:
            pytest.skip("no slot_id")
        rr = requests.post(f"{API}/rsvp", headers=H(tokens["membre1"]),
                           json={"element_type": "terrain_slot", "element_id": sid, "state": "PEUT_ETRE"})
        assert rr.status_code in (200, 404)


class TestProposalNotifications:
    """Test propositions notify PRO_COORDINATEUR alongside Bureau."""
    def test_pro_standard_proposal_notifies_coordinators(self, tokens, cleanup_ids):
        # pro1 is PRO_STANDARD → creating over-cap/off-terrain forces PROPOSED
        payload = {
            "title": f"[TEST] Proposition {uuid.uuid4().hex[:6]}",
            "category": "BALADE", "type": "COLLECTIVE",
            "date": _future(7), "location": "Chez moi",
            "capacity": 30, "price_public": 0, "price_member": 0,
            "visibility": "MEMBERS",
        }
        r = requests.post(f"{API}/activities", headers=H(tokens["pro1"]), json=payload)
        assert r.status_code == 200, r.text
        data = r.json()
        # Should be proposed if delegation not allowed
        aid = data["activity_id"]
        cleanup_ids["activities"].append(aid)

        time.sleep(0.6)
        # Check bureau AND pro2 (coordinateur) notifications
        for who in ["bureau", "pro2"]:
            n = requests.get(f"{API}/notifications", headers=H(tokens[who]), params={"limit": 30})
            assert n.status_code == 200
            types = [x.get("type") for x in n.json().get("items", [])]
            # Accept either NEW_PROPOSAL or DELEGATED_PUBLICATION
            assert any(t in ("NEW_PROPOSAL", "DELEGATED_PUBLICATION") for t in types), \
                f"{who} did not receive proposal notif: {types[:10]}"


class TestMentions:
    def test_mention_notification_on_activity_create(self, tokens, cleanup_ids):
        # get membre1 user_id
        me = requests.get(f"{API}/auth/me", headers=H(tokens["membre1"]))
        assert me.status_code == 200
        body = me.json()
        uid = (body.get("user") or body).get("user_id")
        assert uid

        payload = {
            "title": f"[TEST] Mention {uuid.uuid4().hex[:6]}",
            "category": "BALADE", "type": "COLLECTIVE",
            "date": _future(7), "location": "Prairie du Moulin [DEMO]",
            "capacity": 8, "price_public": 0, "price_member": 0,
            "visibility": "MEMBERS",
            "mentions": [uid],
        }
        r = requests.post(f"{API}/activities", headers=H(tokens["bureau"]), json=payload)
        assert r.status_code == 200, r.text
        cleanup_ids["activities"].append(r.json()["activity_id"])
        time.sleep(0.6)
        n = requests.get(f"{API}/notifications", headers=H(tokens["membre1"]), params={"limit": 20})
        types = [x.get("type") for x in n.json().get("items", [])]
        assert "MENTION" in types, f"membre1 not mentioned: {types[:10]}"


class TestBadgesDirectory:
    def test_get_badges_requires_user_id(self, tokens):
        r = requests.get(f"{API}/loyalty/badges", headers=H(tokens["bureau"]))
        assert r.status_code == 422

    def test_get_badges_returns_list(self, tokens):
        me = requests.get(f"{API}/auth/me", headers=H(tokens["pro2"]))
        body = me.json()
        uid = (body.get("user") or body).get("user_id")
        r = requests.get(f"{API}/loyalty/badges", headers=H(tokens["bureau"]), params={"user_id": uid})
        assert r.status_code == 200
        data = r.json()
        # Response shape can be {badges:[...]} or list
        assert isinstance(data, (list, dict))

    def test_create_badge_rule(self, tokens, cleanup_ids):
        payload = {
            "label": f"TEST_BadgeRule_{uuid.uuid4().hex[:6]}",
            "kind": "REWARD",
            "threshold": 1,
            "badge": True,
            "badge_name": "Testeur",
            "is_active": True,
            "activity_category": "BALADE",
        }
        r = requests.post(f"{API}/loyalty/rules", headers=H(tokens["bureau"]), json=payload)
        # Accept 200/201; if endpoint expects other shape, note it
        assert r.status_code in (200, 201), f"badge rule create: {r.status_code} {r.text}"
        data = r.json()
        rid = data.get("rule_id") or data.get("id")
        if rid:
            cleanup_ids["rules"].append(rid)
