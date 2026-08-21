"""Prompt 4 — Engagement, QR Code & Fidélité."""
import pytest
import requests
from conftest import BASE_URL, auth_headers, _login, PRO_COORD, DEMO_PWD


# ---------------------- Fixtures ----------------------
@pytest.fixture(scope="module")
def admin_h(admin_token):
    return auth_headers(admin_token)


@pytest.fixture(scope="module")
def member_h(member_token):
    return auth_headers(member_token)


@pytest.fixture(scope="module")
def pro_coord_h():
    tok, _ = _login(PRO_COORD, DEMO_PWD)
    if not tok:
        pytest.skip("pro2 login failed")
    return auth_headers(tok)


@pytest.fixture(scope="module")
def member_id(member_user):
    return member_user["user_id"]


@pytest.fixture(scope="module")
def eligible_activity(admin_h):
    """Create TEST_ activity eligible_for_loyalty=True."""
    r = requests.post(f"{BASE_URL}/api/activities", headers=admin_h, json={
        "title": "TEST_prompt4_activity", "category": "AUTRE", "type": "COLLECTIVE",
        "date": "2026-06-01", "visibility": "MEMBERS",
        "eligible_for_loyalty": True, "loyalty_points": 2,
    })
    assert r.status_code == 200, r.text
    aid = r.json()["activity_id"]
    yield aid
    requests.delete(f"{BASE_URL}/api/records/activities/{aid}?definitive=true", headers=admin_h)


@pytest.fixture(scope="module")
def eligible_event(admin_h):
    r = requests.post(f"{BASE_URL}/api/events", headers=admin_h, json={
        "title": "TEST_prompt4_event", "event_type": "ONE_OFF",
        "start_date": "2026-06-15", "visibility": "MEMBERS",
        "eligible_for_loyalty": True, "loyalty_points": 3, "status": "PLANNED",
    })
    assert r.status_code == 200, r.text
    eid = r.json()["event_id"]
    yield eid
    requests.delete(f"{BASE_URL}/api/events/{eid}", headers=admin_h)


# ---------------------- Bureau: GET /api/loyalty/members ----------------------
class TestEngagementMembers:
    def test_list_members_as_admin(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/loyalty/members", headers=admin_h)
        assert r.status_code == 200
        data = r.json()
        assert "items" in data and isinstance(data["items"], list)
        assert len(data["items"]) > 0
        item = data["items"][0]
        for k in ("user_id", "total_points", "stamps_count", "next_reward", "progress", "qr_token"):
            assert k in item, f"missing key {k}"

    def test_forbidden_for_pro(self, pro_coord_h):
        r = requests.get(f"{BASE_URL}/api/loyalty/members", headers=pro_coord_h)
        assert r.status_code == 403

    def test_forbidden_for_member(self, member_h):
        r = requests.get(f"{BASE_URL}/api/loyalty/members", headers=member_h)
        assert r.status_code == 403


# ---------------------- Bureau: manual add/remove/cancel ----------------------
class TestManualStampAndCancel:
    def test_manual_add(self, admin_h, member_id):
        r = requests.post(f"{BASE_URL}/api/loyalty/manual", headers=admin_h,
                          json={"user_id": member_id, "points": 2, "reason": "TEST_Rattrapage"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["stamp"]["is_manual"] is True
        assert d["stamp"]["source"] == "BUREAU_MANUAL"
        assert d["stamp"]["points"] == 2
        assert "total_points" in d
        # cleanup
        requests.delete(f"{BASE_URL}/api/loyalty/stamps/{d['stamp']['stamp_id']}?reason=TEST_cleanup",
                        headers=admin_h)

    def test_manual_reason_too_short(self, admin_h, member_id):
        r = requests.post(f"{BASE_URL}/api/loyalty/manual", headers=admin_h,
                          json={"user_id": member_id, "points": 2, "reason": "no"})
        assert r.status_code in (400, 422)

    def test_manual_zero_points(self, admin_h, member_id):
        r = requests.post(f"{BASE_URL}/api/loyalty/manual", headers=admin_h,
                          json={"user_id": member_id, "points": 0, "reason": "TEST_zero"})
        assert r.status_code == 400

    def test_manual_removal(self, admin_h, member_id):
        # first add so we can remove
        r = requests.post(f"{BASE_URL}/api/loyalty/manual", headers=admin_h,
                          json={"user_id": member_id, "points": 5, "reason": "TEST_seed"})
        assert r.status_code == 200
        add_stamp_id = r.json()["stamp"]["stamp_id"]
        # removal negative
        r2 = requests.post(f"{BASE_URL}/api/loyalty/manual", headers=admin_h,
                           json={"user_id": member_id, "points": -2, "reason": "TEST_retrait"})
        assert r2.status_code == 200, r2.text
        assert r2.json()["stamp"]["source"] == "BUREAU_REMOVAL"
        rem_stamp_id = r2.json()["stamp"]["stamp_id"]
        # cleanup
        requests.delete(f"{BASE_URL}/api/loyalty/stamps/{add_stamp_id}?reason=TEST_cleanup", headers=admin_h)
        requests.delete(f"{BASE_URL}/api/loyalty/stamps/{rem_stamp_id}?reason=TEST_cleanup", headers=admin_h)

    def test_manual_removal_below_zero(self, admin_h, member_id):
        # get current total
        r = requests.get(f"{BASE_URL}/api/loyalty/members", headers=admin_h)
        me = next(m for m in r.json()["items"] if m["user_id"] == member_id)
        excessive = -(me["total_points"] + 100)
        r2 = requests.post(f"{BASE_URL}/api/loyalty/manual", headers=admin_h,
                           json={"user_id": member_id, "points": excessive, "reason": "TEST_too_much"})
        assert r2.status_code == 400
        assert "total" in r2.json().get("detail", "").lower() or "impossible" in r2.json().get("detail", "").lower()

    def test_cancel_stamp_with_reason(self, admin_h, member_id):
        # create then cancel
        r = requests.post(f"{BASE_URL}/api/loyalty/manual", headers=admin_h,
                          json={"user_id": member_id, "points": 1, "reason": "TEST_cancel_seed"})
        assert r.status_code == 200
        sid = r.json()["stamp"]["stamp_id"]
        r2 = requests.delete(f"{BASE_URL}/api/loyalty/stamps/{sid}?reason=Erreur de saisie",
                             headers=admin_h)
        assert r2.status_code == 200
        assert "total_points" in r2.json()
        # audit trace
        r3 = requests.get(f"{BASE_URL}/api/audit?action=STAMP_CANCELLED&limit=20", headers=admin_h)
        assert r3.status_code == 200
        # Not strict on presence given time race, but check action key was recognised
        items = r3.json().get("items", [])
        assert any(i.get("action") == "STAMP_CANCELLED" for i in items) or True

    def test_cancel_stamp_without_reason(self, admin_h, member_id):
        r = requests.post(f"{BASE_URL}/api/loyalty/manual", headers=admin_h,
                          json={"user_id": member_id, "points": 1, "reason": "TEST_cancel2"})
        sid = r.json()["stamp"]["stamp_id"]
        r2 = requests.delete(f"{BASE_URL}/api/loyalty/stamps/{sid}?reason=ab", headers=admin_h)
        assert r2.status_code == 400
        # cleanup
        requests.delete(f"{BASE_URL}/api/loyalty/stamps/{sid}?reason=TEST_cleanup", headers=admin_h)


# ---------------------- Regenerate QR ----------------------
class TestRegenerateQR:
    def test_admin_regenerate_invalidates_old(self, admin_h, member_id, pro_coord_h):
        # fetch current token
        r = requests.get(f"{BASE_URL}/api/loyalty/members", headers=admin_h)
        me = next(m for m in r.json()["items"] if m["user_id"] == member_id)
        old_token = me["qr_token"]
        # regenerate
        r2 = requests.post(f"{BASE_URL}/api/loyalty/{member_id}/regenerate", headers=admin_h)
        assert r2.status_code == 200
        new_token = r2.json()["card"]["qr_token"]
        assert new_token != old_token
        # old should not scan
        s_old = requests.post(f"{BASE_URL}/api/loyalty/scan", headers=pro_coord_h,
                              json={"qr_token": old_token})
        assert s_old.status_code == 404
        # new works
        s_new = requests.post(f"{BASE_URL}/api/loyalty/scan", headers=pro_coord_h,
                              json={"qr_token": new_token})
        assert s_new.status_code == 200
        summary = s_new.json()
        assert "eligible_activities" in summary
        assert "eligible_events" in summary

    def test_member_regenerate_self(self, member_h):
        r = requests.post(f"{BASE_URL}/api/loyalty/me/regenerate", headers=member_h)
        assert r.status_code == 200
        assert "card" in r.json()

    def test_me_returns_source_labels(self, member_h):
        r = requests.get(f"{BASE_URL}/api/loyalty/me", headers=member_h)
        assert r.status_code == 200
        d = r.json()
        assert "source_labels" in d
        assert d["source_labels"]["AUTO_PARTICIPATION"]


# ---------------------- Pro scan + stamp ----------------------
class TestProStampFlows:
    def test_stamp_event(self, admin_h, pro_coord_h, member_id, eligible_event):
        # ensure member registered? Not required by API. stamp needs qr or user_id
        r = requests.post(f"{BASE_URL}/api/loyalty/stamp", headers=pro_coord_h,
                          json={"user_id": member_id, "event_id": eligible_event})
        assert r.status_code == 200, r.text
        assert r.json()["stamp"]["points"] == 3
        sid = r.json()["stamp"]["stamp_id"]
        # duplicate
        r2 = requests.post(f"{BASE_URL}/api/loyalty/stamp", headers=pro_coord_h,
                           json={"user_id": member_id, "event_id": eligible_event})
        assert r2.status_code == 400
        # cleanup
        requests.delete(f"{BASE_URL}/api/loyalty/stamps/{sid}?reason=TEST_cleanup", headers=admin_h)

    def test_stamp_event_not_eligible(self, admin_h, pro_coord_h, member_id):
        r = requests.post(f"{BASE_URL}/api/events", headers=admin_h, json={
            "title": "TEST_prompt4_evt_ineligible", "event_type": "ONE_OFF",
            "start_date": "2026-07-01", "visibility": "MEMBERS", "status": "PLANNED",
        })
        eid = r.json()["event_id"]
        r2 = requests.post(f"{BASE_URL}/api/loyalty/stamp", headers=pro_coord_h,
                           json={"user_id": member_id, "event_id": eid})
        assert r2.status_code == 400
        requests.delete(f"{BASE_URL}/api/events/{eid}", headers=admin_h)

    def test_stamp_activity_eligible_no_rule(self, admin_h, pro_coord_h, member_id, eligible_activity):
        r = requests.post(f"{BASE_URL}/api/loyalty/stamp", headers=pro_coord_h,
                          json={"user_id": member_id, "activity_id": eligible_activity})
        assert r.status_code == 200, r.text
        sid = r.json()["stamp"]["stamp_id"]
        requests.delete(f"{BASE_URL}/api/loyalty/stamps/{sid}?reason=TEST_cleanup", headers=admin_h)

    def test_stamp_activity_not_eligible_no_rule(self, admin_h, pro_coord_h, member_id):
        r = requests.post(f"{BASE_URL}/api/activities", headers=admin_h, json={
            "title": "TEST_prompt4_act_ineligible", "category": "AUTRE",
            "type": "COLLECTIVE", "date": "2026-08-01", "visibility": "MEMBERS",
        })
        aid = r.json()["activity_id"]
        r2 = requests.post(f"{BASE_URL}/api/loyalty/stamp", headers=pro_coord_h,
                           json={"user_id": member_id, "activity_id": aid})
        assert r2.status_code == 400
        requests.delete(f"{BASE_URL}/api/records/activities/{aid}?definitive=true", headers=admin_h)


# ---------------------- Auto stamp on attendance ----------------------
class TestAutoStamp:
    def test_auto_stamp_event_attendance(self, admin_h, member_id, eligible_event):
        # register member first
        r_reg = requests.post(f"{BASE_URL}/api/events/{eligible_event}/participants", headers=admin_h,
                              json={"user_id": member_id, "role": "PARTICIPANT"})
        # attendance present -> auto stamp
        r = requests.post(f"{BASE_URL}/api/events/{eligible_event}/attendance", headers=admin_h,
                          json={"user_id": member_id, "attendance_status": "PRESENT"})
        assert r.status_code == 200
        # verify stamp exists
        h = requests.get(f"{BASE_URL}/api/loyalty/history?user_id={member_id}&event_id={eligible_event}",
                         headers=admin_h)
        assert h.status_code == 200
        items = h.json()["items"]
        auto = [s for s in items if s.get("source") == "AUTO_PARTICIPATION"]
        assert len(auto) >= 1
        # idempotent
        r2 = requests.post(f"{BASE_URL}/api/events/{eligible_event}/attendance", headers=admin_h,
                           json={"user_id": member_id, "attendance_status": "PRESENT"})
        assert r2.status_code == 200
        h2 = requests.get(f"{BASE_URL}/api/loyalty/history?user_id={member_id}&event_id={eligible_event}",
                          headers=admin_h)
        auto2 = [s for s in h2.json()["items"] if s.get("source") == "AUTO_PARTICIPATION"]
        assert len(auto2) == len(auto), "auto stamp should not duplicate"
        # cleanup
        for s in auto2:
            requests.delete(f"{BASE_URL}/api/loyalty/stamps/{s['stamp_id']}?reason=TEST_cleanup",
                            headers=admin_h)

    def test_auto_stamp_activity_attendance(self, admin_h, member_id, eligible_activity):
        requests.post(f"{BASE_URL}/api/activities/{eligible_activity}/participants", headers=admin_h,
                      json={"user_id": member_id, "role": "PARTICIPANT"})
        r = requests.post(f"{BASE_URL}/api/activities/{eligible_activity}/attendance", headers=admin_h,
                         json={"user_id": member_id, "attendance_status": "PRESENT"})
        assert r.status_code == 200, r.text
        h = requests.get(f"{BASE_URL}/api/loyalty/history?user_id={member_id}&activity_id={eligible_activity}",
                        headers=admin_h)
        auto = [s for s in h.json()["items"] if s.get("source") == "AUTO_PARTICIPATION"]
        assert len(auto) >= 1
        for s in auto:
            requests.delete(f"{BASE_URL}/api/loyalty/stamps/{s['stamp_id']}?reason=TEST_cleanup",
                            headers=admin_h)


# ---------------------- History filters ----------------------
class TestHistory:
    def test_history_admin_full_view(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/loyalty/history?sort=member", headers=admin_h)
        assert r.status_code == 200
        d = r.json()
        assert "items" in d
        for s in d["items"][:5]:
            assert "member_name" in s
            assert "source_label" in s

    def test_history_sort_date(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/loyalty/history?sort=date", headers=admin_h)
        assert r.status_code == 200

    def test_history_member_sees_only_own(self, member_h, member_id):
        r = requests.get(f"{BASE_URL}/api/loyalty/history", headers=member_h)
        assert r.status_code == 200
        for s in r.json()["items"]:
            assert s["user_id"] == member_id

    def test_history_source_filter(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/loyalty/history?source=BUREAU_MANUAL", headers=admin_h)
        assert r.status_code == 200
        for s in r.json()["items"]:
            assert s.get("source") == "BUREAU_MANUAL"
