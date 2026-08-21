"""Prompt 3 Lot A+B — archivage/suppression tracés, champs enrichis, taxonomies, visibilité, participants."""
import time
import requests
import pytest
from conftest import BASE_URL, auth_headers, _login, ADMIN_EMAIL, ADMIN_PASSWORD, PRO_COORD, MEMBER, DEMO_PWD


@pytest.fixture(scope="module")
def admin_tok():
    tok, _ = _login(ADMIN_EMAIL, ADMIN_PASSWORD)
    if not tok:
        pytest.skip("admin login failed")
    return tok


@pytest.fixture(scope="module")
def pro_tok():
    tok, _ = _login(PRO_COORD, DEMO_PWD)
    if not tok:
        pytest.skip("pro login failed")
    return tok


@pytest.fixture(scope="module")
def member_tok():
    tok, u = _login(MEMBER, DEMO_PWD)
    if not tok:
        pytest.skip("member login failed")
    return tok


@pytest.fixture(scope="module")
def member_id():
    tok, u = _login(MEMBER, DEMO_PWD)
    return u["user_id"]


# ------------- Lot A : records archive/restore/delete
class TestRecordsArchiveRestoreDelete:
    def test_records_activities_list_bureau_only(self, admin_tok, member_tok):
        r_admin = requests.get(f"{BASE_URL}/api/records/activities", headers=auth_headers(admin_tok), timeout=15)
        assert r_admin.status_code == 200
        assert "items" in r_admin.json()

        r_member = requests.get(f"{BASE_URL}/api/records/activities", headers=auth_headers(member_tok), timeout=15)
        assert r_member.status_code == 403

    def test_archive_activity_flow(self, admin_tok):
        # Create activity
        payload = {"title": "TEST_ArchActivity", "category": "AUTRE", "type": "COLLECTIVE",
                   "date": "2026-06-01", "visibility": "MEMBERS"}
        r = requests.post(f"{BASE_URL}/api/activities", json=payload, headers=auth_headers(admin_tok), timeout=15)
        assert r.status_code == 200, r.text
        aid = r.json()["activity_id"]
        prev_status = r.json()["status"]

        # Archive without reason -> error
        r_bad = requests.post(f"{BASE_URL}/api/records/activities/{aid}/archive",
                              json={"reason": "ab"}, headers=auth_headers(admin_tok), timeout=15)
        assert r_bad.status_code in (400, 422), r_bad.text

        # Archive with reason
        r_arch = requests.post(f"{BASE_URL}/api/records/activities/{aid}/archive",
                               json={"reason": "TEST_motif_archive"}, headers=auth_headers(admin_tok), timeout=15)
        assert r_arch.status_code == 200, r_arch.text
        assert r_arch.json()["status"] == "ARCHIVED"

        # Check it appears in archived list
        r_arch_list = requests.get(f"{BASE_URL}/api/records/activities?archived=true",
                                    headers=auth_headers(admin_tok), timeout=15)
        assert r_arch_list.status_code == 200
        ids = [i["id"] for i in r_arch_list.json()["items"]]
        assert aid in ids
        entry = next(i for i in r_arch_list.json()["items"] if i["id"] == aid)
        assert entry["archive_reason"] == "TEST_motif_archive"

        # Audit contains ARCHIVE
        r_audit = requests.get(f"{BASE_URL}/api/audit?module=activities&limit=200",
                               headers=auth_headers(admin_tok), timeout=15)
        assert r_audit.status_code == 200
        actions = [(a.get("action"), a.get("target")) for a in r_audit.json().get("items", [])]
        assert ("ARCHIVE", aid) in actions

        # Restore -> previous status
        r_rest = requests.post(f"{BASE_URL}/api/records/activities/{aid}/restore",
                               headers=auth_headers(admin_tok), timeout=15)
        assert r_rest.status_code == 200
        assert r_rest.json()["status"] == prev_status

        # Delete without reason -> 422
        r_del_bad = requests.delete(f"{BASE_URL}/api/records/activities/{aid}",
                                    headers=auth_headers(admin_tok), timeout=15)
        assert r_del_bad.status_code in (400, 422)

        # Delete with short reason -> 400
        r_del_short = requests.delete(f"{BASE_URL}/api/records/activities/{aid}?reason=ab",
                                      headers=auth_headers(admin_tok), timeout=15)
        assert r_del_short.status_code == 400

        # Delete with valid reason
        r_del = requests.delete(f"{BASE_URL}/api/records/activities/{aid}?reason=TEST_delete_reason",
                                headers=auth_headers(admin_tok), timeout=15)
        assert r_del.status_code == 200

        # Audit contains DELETE
        r_audit2 = requests.get(f"{BASE_URL}/api/audit?module=activities&limit=200",
                                headers=auth_headers(admin_tok), timeout=15)
        actions2 = [(a.get("action"), a.get("target")) for a in r_audit2.json().get("items", [])]
        assert ("DELETE", aid) in actions2

    def test_archive_restore_delete_events(self, admin_tok):
        payload = {"title": "TEST_ArchEvent", "event_type": "ONE_OFF", "start_date": "2026-07-01T10:00:00Z",
                   "visibility": "MEMBERS"}
        r = requests.post(f"{BASE_URL}/api/events", json=payload, headers=auth_headers(admin_tok), timeout=15)
        assert r.status_code == 200, r.text
        eid = r.json()["event_id"]
        r_arch = requests.post(f"{BASE_URL}/api/records/events/{eid}/archive",
                               json={"reason": "TEST_motif"}, headers=auth_headers(admin_tok), timeout=15)
        assert r_arch.status_code == 200
        r_rest = requests.post(f"{BASE_URL}/api/records/events/{eid}/restore",
                               headers=auth_headers(admin_tok), timeout=15)
        assert r_rest.status_code == 200
        r_del = requests.delete(f"{BASE_URL}/api/records/events/{eid}?reason=Doublon+de+test",
                                headers=auth_headers(admin_tok), timeout=15)
        assert r_del.status_code == 200

    def test_partners_advantages_terrains_archive_map(self, admin_tok):
        # Partners
        pr = requests.post(f"{BASE_URL}/api/partners", json={"name": "TEST_PartnerLotA", "type": "OTHER"},
                           headers=auth_headers(admin_tok), timeout=15)
        if pr.status_code == 200:
            pid = pr.json().get("partner_id")
            ra = requests.post(f"{BASE_URL}/api/records/partners/{pid}/archive",
                               json={"reason": "TEST"}, headers=auth_headers(admin_tok), timeout=15)
            assert ra.status_code == 200 and ra.json()["status"] == "ARCHIVE"
            rr = requests.post(f"{BASE_URL}/api/records/partners/{pid}/restore",
                               headers=auth_headers(admin_tok), timeout=15)
            assert rr.status_code == 200
            requests.delete(f"{BASE_URL}/api/records/partners/{pid}?reason=cleanup_test",
                            headers=auth_headers(admin_tok), timeout=15)

        # Advantages
        av = requests.post(f"{BASE_URL}/api/advantages",
                           json={"title": "TEST_AvantageA", "type": "REDUCTION", "value": "10%"},
                           headers=auth_headers(admin_tok), timeout=15)
        if av.status_code in (200, 201):
            avid = av.json().get("advantage_id")
            ra = requests.post(f"{BASE_URL}/api/records/advantages/{avid}/archive",
                               json={"reason": "TEST"}, headers=auth_headers(admin_tok), timeout=15)
            assert ra.status_code == 200 and ra.json()["status"] == "ARCHIVED"
            requests.delete(f"{BASE_URL}/api/records/advantages/{avid}?reason=cleanup_test",
                            headers=auth_headers(admin_tok), timeout=15)


# ------------- Taxonomies
class TestTaxonomies:
    def test_create_use_delete_taxonomy(self, admin_tok):
        r = requests.post(f"{BASE_URL}/api/taxonomies",
                          json={"kind": "activity_category", "label": "TEST_Atelier sensoriel"},
                          headers=auth_headers(admin_tok), timeout=15)
        assert r.status_code == 200, r.text
        tax = r.json()
        code = tax["code"]
        tid = tax["taxonomy_id"]

        # meta contains new code + label
        meta = requests.get(f"{BASE_URL}/api/activities/meta",
                            headers=auth_headers(admin_tok), timeout=15).json()
        assert code in meta["categories"]
        assert meta["custom_labels"].get(code) == "TEST_Atelier sensoriel"

        # Create an activity with custom category
        r_act = requests.post(f"{BASE_URL}/api/activities",
                              json={"title": "TEST_CustomCatActivity", "category": code,
                                    "type": "COLLECTIVE", "date": "2026-06-15",
                                    "visibility": "MEMBERS"},
                              headers=auth_headers(admin_tok), timeout=15)
        assert r_act.status_code == 200, r_act.text
        aid = r_act.json()["activity_id"]
        requests.delete(f"{BASE_URL}/api/records/activities/{aid}?reason=cleanup_test",
                        headers=auth_headers(admin_tok), timeout=15)

        # Delete taxonomy
        r_del = requests.delete(f"{BASE_URL}/api/taxonomies/{tid}",
                                headers=auth_headers(admin_tok), timeout=15)
        assert r_del.status_code == 200


# ------------- Champs enrichis
class TestEnrichedFields:
    def test_activity_with_enriched_fields(self, admin_tok):
        payload = {"title": "TEST_Enriched", "category": "AUTRE", "type": "COLLECTIVE",
                   "date": "2026-06-20", "visibility": "MEMBERS",
                   "google_maps_url": "https://maps.google.com/?q=Paris",
                   "is_remote": True, "visio_url": "https://meet.google.com/xyz",
                   "form_id": "form_test_123", "form_notify_date": "2026-06-10",
                   "eligible_for_loyalty": True}
        r = requests.post(f"{BASE_URL}/api/activities", json=payload,
                          headers=auth_headers(admin_tok), timeout=15)
        assert r.status_code == 200, r.text
        aid = r.json()["activity_id"]

        rg = requests.get(f"{BASE_URL}/api/activities/{aid}", headers=auth_headers(admin_tok), timeout=15)
        assert rg.status_code == 200
        a = rg.json()["activity"]
        assert a["google_maps_url"] == payload["google_maps_url"]
        assert a["is_remote"] is True
        assert a["visio_url"] == payload["visio_url"]
        assert a["form_id"] == "form_test_123"
        assert a["form_notify_date"] == "2026-06-10"
        assert a["eligible_for_loyalty"] is True

        requests.delete(f"{BASE_URL}/api/records/activities/{aid}?reason=cleanup_enriched_test",
                        headers=auth_headers(admin_tok), timeout=15)

    def test_event_with_enriched_fields(self, admin_tok):
        payload = {"title": "TEST_EnrichedEvent", "event_type": "ONE_OFF",
                   "start_date": "2026-07-10T10:00:00Z", "visibility": "MEMBERS",
                   "google_maps_url": "https://maps.google.com/?q=Lyon",
                   "is_remote": True, "visio_url": "https://zoom.us/j/1",
                   "form_id": "form_evt", "form_notify_date": "2026-07-01",
                   "eligible_for_loyalty": True}
        r = requests.post(f"{BASE_URL}/api/events", json=payload,
                          headers=auth_headers(admin_tok), timeout=15)
        assert r.status_code == 200, r.text
        eid = r.json()["event_id"]
        rg = requests.get(f"{BASE_URL}/api/events/{eid}", headers=auth_headers(admin_tok), timeout=15)
        assert rg.status_code == 200
        e = rg.json()["event"]
        assert e["google_maps_url"] == payload["google_maps_url"]
        assert e["visio_url"] == payload["visio_url"]
        assert e["form_id"] == "form_evt"
        assert e["eligible_for_loyalty"] is True
        requests.delete(f"{BASE_URL}/api/records/events/{eid}?reason=cleanup_enriched_test",
                        headers=auth_headers(admin_tok), timeout=15)


# ------------- Participants ajoutés depuis fiche
class TestAddParticipants:
    def test_add_event_participant(self, admin_tok, member_id):
        r = requests.post(f"{BASE_URL}/api/events",
                          json={"title": "TEST_EventPart", "event_type": "ONE_OFF",
                                "start_date": "2026-08-01T10:00:00Z", "visibility": "MEMBERS"},
                          headers=auth_headers(admin_tok), timeout=15)
        eid = r.json()["event_id"]
        r1 = requests.post(f"{BASE_URL}/api/events/{eid}/participants",
                           json={"user_id": member_id, "role": "VOLUNTEER"},
                           headers=auth_headers(admin_tok), timeout=15)
        assert r1.status_code == 200, r1.text
        assert r1.json()["registration_status"] == "CONFIRMED"
        assert r1.json()["role"] == "VOLUNTEER"

        # Duplicate
        r2 = requests.post(f"{BASE_URL}/api/events/{eid}/participants",
                           json={"user_id": member_id, "role": "VOLUNTEER"},
                           headers=auth_headers(admin_tok), timeout=15)
        assert r2.status_code == 400

        requests.delete(f"{BASE_URL}/api/records/events/{eid}?reason=cleanup_part_test",
                        headers=auth_headers(admin_tok), timeout=15)

    def test_add_activity_participant(self, admin_tok, member_id):
        r = requests.post(f"{BASE_URL}/api/activities",
                          json={"title": "TEST_ActPart", "category": "AUTRE", "type": "COLLECTIVE",
                                "date": "2026-08-10", "visibility": "MEMBERS"},
                          headers=auth_headers(admin_tok), timeout=15)
        aid = r.json()["activity_id"]
        r1 = requests.post(f"{BASE_URL}/api/activities/{aid}/participants",
                           json={"user_id": member_id, "role": "VOLUNTEER"},
                           headers=auth_headers(admin_tok), timeout=15)
        assert r1.status_code == 200, r1.text
        assert r1.json()["registration_status"] == "CONFIRMED"
        r2 = requests.post(f"{BASE_URL}/api/activities/{aid}/participants",
                           json={"user_id": member_id, "role": "VOLUNTEER"},
                           headers=auth_headers(admin_tok), timeout=15)
        assert r2.status_code == 400
        requests.delete(f"{BASE_URL}/api/records/activities/{aid}?reason=cleanup_part_test",
                        headers=auth_headers(admin_tok), timeout=15)


# ------------- Visibilité
class TestVisibility:
    def test_bureau_visibility_hides_from_pro_and_member(self, admin_tok, pro_tok, member_tok):
        r = requests.post(f"{BASE_URL}/api/activities",
                          json={"title": "TEST_ActBureauVisibility", "category": "AUTRE", "type": "COLLECTIVE",
                                "date": "2026-09-01", "visibility": "BUREAU"},
                          headers=auth_headers(admin_tok), timeout=15)
        assert r.status_code == 200
        aid = r.json()["activity_id"]

        rm = requests.get(f"{BASE_URL}/api/activities", headers=auth_headers(member_tok), timeout=15).json()
        assert aid not in [a["activity_id"] for a in rm["items"]]

        rp = requests.get(f"{BASE_URL}/api/activities", headers=auth_headers(pro_tok), timeout=15).json()
        assert aid not in [a["activity_id"] for a in rp["items"]]

        ra = requests.get(f"{BASE_URL}/api/activities", headers=auth_headers(admin_tok), timeout=15).json()
        assert aid in [a["activity_id"] for a in ra["items"]]

        requests.delete(f"{BASE_URL}/api/records/activities/{aid}?reason=cleanup_visibility_test",
                        headers=auth_headers(admin_tok), timeout=15)

    def test_professionals_visibility(self, admin_tok, pro_tok, member_tok):
        r = requests.post(f"{BASE_URL}/api/activities",
                          json={"title": "TEST_ActProVisibility", "category": "AUTRE", "type": "COLLECTIVE",
                                "date": "2026-09-05", "visibility": "PROFESSIONALS"},
                          headers=auth_headers(admin_tok), timeout=15)
        aid = r.json()["activity_id"]

        rm = requests.get(f"{BASE_URL}/api/activities", headers=auth_headers(member_tok), timeout=15).json()
        assert aid not in [a["activity_id"] for a in rm["items"]]
        rp = requests.get(f"{BASE_URL}/api/activities", headers=auth_headers(pro_tok), timeout=15).json()
        assert aid in [a["activity_id"] for a in rp["items"]]

        requests.delete(f"{BASE_URL}/api/records/activities/{aid}?reason=cleanup_visibility_test",
                        headers=auth_headers(admin_tok), timeout=15)


# ------------- Non-régression Lot C
class TestLotCNoRegression:
    def test_terrains_still_ok(self, admin_tok):
        r = requests.get(f"{BASE_URL}/api/terrains", headers=auth_headers(admin_tok), timeout=15)
        assert r.status_code == 200

    def test_calendar_unified_still_ok(self, admin_tok):
        r = requests.get(f"{BASE_URL}/api/calendar/unified", headers=auth_headers(admin_tok), timeout=15)
        assert r.status_code == 200
