"""Prompt 12 — Objectifs et progression + Pilotage supervision dashboard."""
import pytest
import requests
from conftest import BASE_URL, auth_headers, _login, DEMO_PWD


PRO_COORD_EMAIL = "pro2.demo@lavoixduchien.fr"
PRO_AVANCE_EMAIL = "pro3.demo@lavoixduchien.fr"


def _find_dog(token, name_prefix="Nikko"):
    r = requests.get(f"{BASE_URL}/api/dogs", headers=auth_headers(token), timeout=15)
    assert r.status_code == 200, r.text
    for d in r.json().get("items", []):
        if d.get("name", "").startswith(name_prefix):
            return d
    return None


# ---------------- Objectives ----------------

class TestObjectives:
    def test_admin_full_flow(self, admin_token, member_token):
        dog = _find_dog(admin_token, "Nikko")
        assert dog, "Nikko [DEMO] not found for admin"
        dog_id = dog["dog_id"]

        # Create
        payload = {"title": "TEST_obj_rappel", "notes": "auto", "start_date": "2026-01-05"}
        r = requests.post(f"{BASE_URL}/api/dogs/{dog_id}/objectives",
                          headers=auth_headers(admin_token), json=payload, timeout=15)
        assert r.status_code == 200, r.text
        obj = r.json()
        oid = obj["objective_id"]
        assert obj["status"] == "EN_COURS"
        assert obj["start_date"] == "2026-01-05"
        assert len(obj["status_history"]) == 1

        # List returns can_edit_pro True
        r = requests.get(f"{BASE_URL}/api/dogs/{dog_id}/objectives",
                         headers=auth_headers(admin_token), timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data["can_edit_pro"] is True
        assert any(o["objective_id"] == oid for o in data["objectives"])

        # Set ATTEINT -> achieved_date auto + history append
        r = requests.put(f"{BASE_URL}/api/dogs/{dog_id}/objectives/{oid}",
                         headers=auth_headers(admin_token), json={"status": "ATTEINT"}, timeout=15)
        assert r.status_code == 200
        obj2 = r.json()
        assert obj2["status"] == "ATTEINT"
        assert obj2["achieved_date"], "achieved_date should be set for ATTEINT"
        assert len(obj2["status_history"]) == 2

        # Session report
        r = requests.post(f"{BASE_URL}/api/dogs/{dog_id}/objectives/{oid}/reports",
                         headers=auth_headers(admin_token),
                         json={"text": "TEST_session_ok"}, timeout=15)
        assert r.status_code == 200
        rep = r.json()
        report_id = rep["report_id"]

        # --- Owner side (membre1) ---
        # Owner note
        r = requests.post(f"{BASE_URL}/api/dogs/{dog_id}/objectives/{oid}/notes",
                         headers=auth_headers(member_token),
                         json={"message": "TEST_owner_note"}, timeout=15)
        assert r.status_code == 200, r.text

        # Owner reaction on report
        r = requests.post(
            f"{BASE_URL}/api/dogs/{dog_id}/objectives/{oid}/reports/{report_id}/react",
            headers=auth_headers(member_token),
            json={"message": "TEST_react"}, timeout=15)
        assert r.status_code == 200, r.text

        # Owner cannot create objective
        r = requests.post(f"{BASE_URL}/api/dogs/{dog_id}/objectives",
                         headers=auth_headers(member_token),
                         json={"title": "TEST_owner_blocked"}, timeout=15)
        assert r.status_code == 403

        # Owner cannot change status
        r = requests.put(f"{BASE_URL}/api/dogs/{dog_id}/objectives/{oid}",
                        headers=auth_headers(member_token),
                        json={"status": "ABANDONNE"}, timeout=15)
        assert r.status_code == 403

        # Cleanup — set to ABANDONNE via admin (we can't delete via API but we mark it)
        requests.put(f"{BASE_URL}/api/dogs/{dog_id}/objectives/{oid}",
                    headers=auth_headers(admin_token),
                    json={"status": "ABANDONNE"}, timeout=15)


# ---------------- Pilotage RBAC ----------------

class TestPilotageRBAC:
    def test_admin_can_access(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/pilotage", headers=auth_headers(admin_token), timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert "rows" in d and "counters" in d
        assert set(d["counters"].keys()) == {"active_dogs", "objectives_en_cours", "objectives_atteints_mois"}
        # Each row shape
        for row in d["rows"][:3]:
            for k in ("dog_id", "name", "owner_name", "referent_name",
                      "team_names", "team_count", "last_intervention",
                      "days_since", "stale", "shared"):
                assert k in row, f"missing {k}"

    def test_coordinateur_can_access(self):
        tok, _ = _login(PRO_COORD_EMAIL, DEMO_PWD)
        if not tok:
            pytest.skip("PRO_COORDINATEUR login failed")
        r = requests.get(f"{BASE_URL}/api/pilotage", headers=auth_headers(tok), timeout=20)
        assert r.status_code == 200

    def test_pro_standard_forbidden(self, pro_token):
        r = requests.get(f"{BASE_URL}/api/pilotage", headers=auth_headers(pro_token), timeout=15)
        assert r.status_code == 403

    def test_pro_avance_forbidden(self):
        tok, _ = _login(PRO_AVANCE_EMAIL, DEMO_PWD)
        if not tok:
            pytest.skip("PRO_AVANCE login failed")
        r = requests.get(f"{BASE_URL}/api/pilotage", headers=auth_headers(tok), timeout=15)
        assert r.status_code == 403

    def test_member_forbidden(self, member_token):
        r = requests.get(f"{BASE_URL}/api/pilotage", headers=auth_headers(member_token), timeout=15)
        assert r.status_code == 403
