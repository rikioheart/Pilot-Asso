"""Prompt 5 — Stats d'engagement (Bureau) + récap mensuel adhérent (notif + e-mail + désabo)."""
import os
import time
import uuid
import pytest
import requests

from conftest import BASE_URL, auth_headers, DEMO_PWD, PRO_COORD, MEMBER


CRON_SECRET = "vdc_cron_9f4b2e7a1c6d8035be4712af95d3c60e"


# ------------ helpers ------------
def _get(path, token, **params):
    return requests.get(f"{BASE_URL}{path}", headers=auth_headers(token),
                        params=params or None, timeout=30)


def _post(path, token, body=None):
    return requests.post(f"{BASE_URL}{path}", headers=auth_headers(token),
                         json=body or {}, timeout=60)


def _put(path, token, body):
    return requests.put(f"{BASE_URL}{path}", headers=auth_headers(token),
                        json=body, timeout=30)


def _delete(path, token, **params):
    return requests.delete(f"{BASE_URL}{path}", headers=auth_headers(token),
                           params=params or None, timeout=30)


# ============ Bureau: GET /api/loyalty/stats ============
class TestLoyaltyStats:
    def test_stats_shape_admin(self, admin_token):
        r = _get("/api/loyalty/stats", admin_token, months=12)
        assert r.status_code == 200
        d = r.json()
        for key in ("ranking", "monthly", "by_source", "top_elements", "totals", "rewards"):
            assert key in d, f"Missing key {key}"
        # totals
        for k in ("stamps", "points", "engaged_members", "active_members", "participation_rate"):
            assert k in d["totals"]
        # ranking items
        if d["ranking"]:
            r0 = d["ranking"][0]
            for k in ("user_id", "display_name", "total_points", "stamps",
                      "levels_reached", "next_reward", "next_threshold"):
                assert k in r0
        # by_source french labels
        allowed = {"Scan QR Code", "Validation par un professionnel",
                   "Ajout manuel du Bureau", "Retrait manuel du Bureau",
                   "Validation automatique de participation"}
        for s in d["by_source"]:
            assert s["label"] in allowed, f"Label non FR : {s['label']}"
        # monthly shape
        if d["monthly"]:
            m0 = d["monthly"][0]
            for k in ("month", "label", "points", "stamps", "active_members",
                      "levels_reached", "levels"):
                assert k in m0

    def test_stats_forbidden_pro(self):
        tok_resp = requests.post(f"{BASE_URL}/api/auth/login",
                                 json={"email": PRO_COORD, "password": DEMO_PWD}, timeout=15)
        assert tok_resp.status_code == 200
        pro_tok = tok_resp.json()["access_token"]
        r = _get("/api/loyalty/stats", pro_tok)
        assert r.status_code == 403

    def test_stats_forbidden_member(self, member_token):
        r = _get("/api/loyalty/stats", member_token)
        assert r.status_code == 403


# ============ Cohérence des stats après 3 tampons manuels ============
class TestStatsConsistency:
    """Ajoute 3 tampons manuels et vérifie ranking/totals/by_source/monthly."""

    created_stamp_ids = []
    member_user_id = None

    @pytest.fixture(autouse=True, scope="class")
    def cleanup(self, admin_token):
        yield
        for sid in list(TestStatsConsistency.created_stamp_ids):
            _delete(f"/api/loyalty/stamps/{sid}", admin_token, reason="TEST_cleanup")

    def test_add_three_manual_stamps_and_verify(self, admin_token, member_user):
        assert member_user, "Member login required"
        uid = member_user["user_id"]
        TestStatsConsistency.member_user_id = uid

        # Baseline
        r0 = _get("/api/loyalty/stats", admin_token, months=12).json()
        base_points = r0["totals"]["points"]
        base_stamps = r0["totals"]["stamps"]
        base_by_source = {s["source"]: s["count"] for s in r0["by_source"]}
        base_bureau_manual = base_by_source.get("BUREAU_MANUAL", 0)
        base_member_rank = next((r for r in r0["ranking"] if r["user_id"] == uid), None)
        base_member_points = base_member_rank["total_points"] if base_member_rank else 0

        # Ensure at least one reward threshold slightly above base to trigger a palier crossing
        rewards = r0["rewards"]
        target_threshold = base_member_points + 2  # will be crossed with 3-point add
        # Try to find an existing reward whose threshold is between (base+1) and (base+3)
        crossing_reward = next(
            (r for r in rewards if base_member_points < (r.get("threshold") or 0)
             <= base_member_points + 3), None)
        temp_reward_id = None
        if not crossing_reward:
            rr = _post("/api/loyalty/rules", admin_token, {
                "label": f"TEST_reward_{uuid.uuid4().hex[:6]}",
                "kind": "REWARD",
                "threshold": target_threshold,
                "reward": "TEST_avantage",
                "is_active": True,
            })
            assert rr.status_code == 200, rr.text
            temp_reward_id = rr.json()["rule_id"]

        # Ajoute 3 tampons manuels (1 + 1 + 1 => franchit palier à base+2)
        for i in range(3):
            body = {"user_id": uid, "points": 1, "reason": f"TEST_stat_check_{i}",
                    "label": "TEST_manual"}
            rr = _post("/api/loyalty/manual", admin_token, body)
            assert rr.status_code == 200, rr.text
            TestStatsConsistency.created_stamp_ids.append(rr.json()["stamp"]["stamp_id"])

        # Petite pause pour la cohérence
        time.sleep(0.5)
        r1 = _get("/api/loyalty/stats", admin_token, months=12).json()

        # Totals
        assert r1["totals"]["stamps"] == base_stamps + 3
        assert r1["totals"]["points"] == base_points + 3

        # by_source BUREAU_MANUAL +3
        new_by_source = {s["source"]: s["count"] for s in r1["by_source"]}
        assert new_by_source.get("BUREAU_MANUAL", 0) == base_bureau_manual + 3

        # Ranking member updated
        new_rank = next((r for r in r1["ranking"] if r["user_id"] == uid), None)
        assert new_rank is not None
        assert new_rank["total_points"] == base_member_points + 3

        # Monthly levels_reached — au moins un mois a un palier franchi
        total_levels = sum(m["levels_reached"] for m in r1["monthly"])
        assert total_levels >= 1, "Aucun palier détecté dans monthly.levels_reached"

        # Cleanup temp reward
        if temp_reward_id:
            _delete(f"/api/loyalty/rules/{temp_reward_id}", admin_token)


# ============ Particulier: GET /api/loyalty/monthly-recap ============
class TestMonthlyRecap:
    def test_recap_shape(self, member_token, member_user):
        r = _get("/api/loyalty/monthly-recap", member_token)
        assert r.status_code == 200
        d = r.json()
        assert d["user_id"] == member_user["user_id"]
        assert "period" in d
        for k in ("start", "end", "label"):
            assert k in d["period"]
        for k in ("stamps", "gained", "total_points", "next_reward", "missing", "reached"):
            assert k in d
        assert isinstance(d["stamps"], list)
        assert isinstance(d["gained"], int)
        assert isinstance(d["total_points"], int)

    def test_recap_not_leaking_other_member(self, member_token, member_user):
        # There is no user_id parameter — endpoint always uses connected user.
        r = _get("/api/loyalty/monthly-recap", member_token)
        assert r.status_code == 200
        assert r.json()["user_id"] == member_user["user_id"]


# ============ Préférences: partial update, hidden_modules conservé ============
class TestPreferencesPartialUpdate:
    def test_hidden_preserved_when_toggling_recap_email(self, member_token):
        # Set an initial hidden_modules list + recap true
        r1 = _put("/api/profiles/me/preferences", member_token,
                  {"hidden_modules": ["blog", "formations"], "monthly_recap_email": True})
        assert r1.status_code == 200
        assert set(r1.json()["preferences"].get("hidden_modules") or []) == {"blog", "formations"}
        assert r1.json()["preferences"].get("monthly_recap_email") is True

        # Now update ONLY monthly_recap_email=false, must not erase hidden_modules
        r2 = _put("/api/profiles/me/preferences", member_token,
                  {"monthly_recap_email": False})
        assert r2.status_code == 200
        prefs2 = r2.json()["preferences"]
        assert prefs2.get("monthly_recap_email") is False
        assert set(prefs2.get("hidden_modules") or []) == {"blog", "formations"}, \
            f"hidden_modules écrasés : {prefs2}"

        # GET /me/space should return the preferences merged
        r3 = _get("/api/me/space", member_token)
        assert r3.status_code == 200
        prefs3 = r3.json().get("preferences") or {}
        assert prefs3.get("monthly_recap_email") is False
        assert set(prefs3.get("hidden_modules") or []) == {"blog", "formations"}

        # Restore for other tests
        _put("/api/profiles/me/preferences", member_token,
             {"hidden_modules": [], "monthly_recap_email": True})


# ============ Cron: idempotence — safe (background task) ============
class TestCronMemberRecapsIdempotence:
    """N'appelle qu'UNE fois le cron avec un run_id unique, puis vérifie l'idempotence
    en rappelant avec le MÊME id."""

    def test_cron_idempotent(self):
        run_id = f"TEST_prompt5_{uuid.uuid4().hex}"
        headers = {"Authorization": f"Bearer {CRON_SECRET}",
                   "Content-Type": "application/json",
                   "X-Webhook-Id": run_id}
        # First call — should be accepted and queued (background task exécute l'envoi).
        # Note: en test, on ne lance PAS d'e-mail réels via ce path car ADMIN_EMAIL n'est pas
        # utilisé ici ; néanmoins send_member_monthly_recaps envoie des e-mails aux membres actifs.
        # Pour éviter les envois réels, on utilise un run_id unique mais on relance rapidement
        # le même run_id — seul le second appel doit renvoyer duplicate:true.
        # ATTENTION : le premier appel déclenche l'envoi réel via BackgroundTasks.
        # Comme indiqué dans le review_request, on peut l'appeler une seule fois.
        r1 = requests.post(f"{BASE_URL}/api/cron/member-recaps", headers=headers,
                           json={}, timeout=30)
        assert r1.status_code in (200, 201, 202), r1.text
        d1 = r1.json()
        assert d1.get("ok") is True

        # Deuxième appel avec le MÊME x-webhook-id => duplicate=true, pas de nouveau job
        r2 = requests.post(f"{BASE_URL}/api/cron/member-recaps", headers=headers,
                           json={}, timeout=30)
        assert r2.status_code in (200, 201, 202)
        assert r2.json().get("duplicate") is True, f"Expected duplicate:true, got {r2.json()}"

    def test_cron_requires_bearer(self):
        r = requests.post(f"{BASE_URL}/api/cron/member-recaps",
                          headers={"Content-Type": "application/json"},
                          json={}, timeout=15)
        assert r.status_code == 401


# ============ (Optionnel — non exécuté par défaut) member-recaps direct ============
# Le review_request demande d'appeler POST /api/exports/member-recaps une seule fois
# max. Nous NE le déclenchons PAS ici pour éviter un second envoi (le cron ci-dessus
# lance déjà l'envoi réel en background). Mais on peut vérifier la présence des
# LOYALTY_RECAP en notifications si le background job a tourné.
class TestNotificationsAfterCron:
    def test_loyalty_recap_notification_present(self, member_token):
        # Laisser au background le temps de créer la notif
        time.sleep(3)
        r = _get("/api/notifications", member_token)
        assert r.status_code == 200
        items = r.json().get("items") or r.json().get("notifications") or []
        types = {(i.get("type") or "") for i in items}
        # Le membre a préférence monthly_recap_email=true (rétablie) => reçoit notif
        assert "LOYALTY_RECAP" in types, \
            f"Attendu LOYALTY_RECAP dans notifications, trouvé types: {types}"
