"""Phases 5-8 backend tests — blog, formations, library, social, contests, advent,
finance, shares, reimbursements, advantages, partners, terrain, stock, documents,
forms, history, priorities, exports, crons, uploads, RBAC."""
import io
import os
import time

import pytest
import requests

from conftest import BASE_URL, DEMO_PWD, PRO_STD, MEMBER, auth_headers, _login

CRON_SECRET = "vdc_cron_9f4b2e7a1c6d8035be4712af95d3c60e"


def H(tok):
    return {"Authorization": f"Bearer {tok}"}


# ---------------------------------------------------------------- Phase 5: Blog
class TestBlog:
    def test_manager_crud_and_review_flow(self, admin_token, pro_token, member_token):
        # pro creates draft
        r = requests.post(f"{BASE_URL}/api/articles", headers=H(pro_token),
                          json={"title": "TEST_ Article Pro", "body": "Contenu", "category": "CONSEIL"})
        assert r.status_code == 200, r.text
        art_id = r.json()["article_id"]
        # pro proposes for review
        r = requests.put(f"{BASE_URL}/api/articles/{art_id}", headers=H(pro_token),
                         json={"status": "PENDING_REVIEW"})
        assert r.status_code == 200
        # member cannot see PENDING article
        r = requests.get(f"{BASE_URL}/api/articles", headers=H(member_token))
        assert r.status_code == 200
        assert not any(a["article_id"] == art_id for a in r.json()["items"])
        # admin requests changes (needs comment)
        r = requests.post(f"{BASE_URL}/api/articles/{art_id}/review", headers=H(admin_token),
                          json={"decision": "REQUEST_CHANGES"})
        assert r.status_code == 400
        r = requests.post(f"{BASE_URL}/api/articles/{art_id}/review", headers=H(admin_token),
                          json={"decision": "REQUEST_CHANGES", "comment": "Ajouter une intro"})
        assert r.status_code == 200 and r.json()["status"] == "DRAFT"
        # pro re-submits and admin publishes
        requests.put(f"{BASE_URL}/api/articles/{art_id}", headers=H(pro_token),
                     json={"status": "PENDING_REVIEW"})
        r = requests.post(f"{BASE_URL}/api/articles/{art_id}/review", headers=H(admin_token),
                          json={"decision": "PUBLISH"})
        assert r.status_code == 200 and r.json()["status"] == "PUBLISHED"
        # member now sees it
        r = requests.get(f"{BASE_URL}/api/articles", headers=H(member_token))
        assert any(a["article_id"] == art_id for a in r.json()["items"])
        # pin
        r = requests.put(f"{BASE_URL}/api/articles/{art_id}", headers=H(admin_token),
                         json={"is_pinned": True})
        assert r.status_code == 200 and r.json()["is_pinned"] is True
        # cleanup
        requests.delete(f"{BASE_URL}/api/articles/{art_id}", headers=H(admin_token))


# ---------------------------------------------------------------- Phase 5: Formations
class TestFormations:
    def test_full_flow(self, admin_token, member_token):
        r = requests.post(f"{BASE_URL}/api/formations", headers=H(admin_token),
                          json={"title": "TEST_ Formation", "format": "FORMATION",
                                "date": "2030-06-01", "capacity": 2, "access_level": "MEMBERS"})
        assert r.status_code == 200, r.text
        fid = r.json()["formation_id"]
        # member registers
        r = requests.post(f"{BASE_URL}/api/formations/{fid}/register", headers=H(member_token))
        assert r.status_code == 200
        # duplicate registration refused
        r = requests.post(f"{BASE_URL}/api/formations/{fid}/register", headers=H(member_token))
        assert r.status_code == 400
        # bureau sees registrations
        r = requests.get(f"{BASE_URL}/api/formations/{fid}/registrations", headers=H(admin_token))
        assert r.status_code == 200 and r.json()["total"] >= 1
        # unregister
        r = requests.delete(f"{BASE_URL}/api/formations/{fid}/register", headers=H(member_token))
        assert r.status_code == 200
        # add replay link
        r = requests.put(f"{BASE_URL}/api/formations/{fid}", headers=H(admin_token),
                         json={"replay_url": "https://example.com/replay"})
        assert r.status_code == 200


# ---------------------------------------------------------------- Phase 5: Library
class TestLibrary:
    def test_list_and_view(self, admin_token, member_token):
        # create external link resource
        r = requests.post(f"{BASE_URL}/api/library", headers=H(admin_token),
                          json={"title": "TEST_ Ressource", "kind": "GUIDE",
                                "content_type": "EXTERNAL_LINK",
                                "external_url": "https://example.com/x", "access_level": "MEMBERS",
                                "public_price": 10.0, "member_price": 5.0})
        assert r.status_code == 200, r.text
        item_id = r.json()["item_id"]
        # member opens link (view/download increments)
        r = requests.post(f"{BASE_URL}/api/library/{item_id}/download", headers=H(member_token))
        assert r.status_code == 200
        assert r.json()["download_count"] >= 1
        # access log admin-only
        r = requests.get(f"{BASE_URL}/api/library/access-log", headers=H(admin_token))
        assert r.status_code == 200
        r = requests.get(f"{BASE_URL}/api/library/access-log", headers=H(member_token))
        assert r.status_code == 403
        requests.delete(f"{BASE_URL}/api/library/{item_id}", headers=H(admin_token))


# ---------------------------------------------------------------- Phase 5: Social
class TestSocial:
    def test_status_pipeline(self, admin_token):
        r = requests.post(f"{BASE_URL}/api/social/posts", headers=H(admin_token),
                          json={"title": "TEST_ Post", "content": "Hello",
                                "networks": ["FACEBOOK"], "scheduled_date": "2030-06-15"})
        assert r.status_code == 200, r.text
        pid = r.json()["post_id"]
        assert r.json()["status"] == "DRAFT"
        for s in ["TO_VALIDATE", "SCHEDULED", "PUBLISHED"]:
            r = requests.put(f"{BASE_URL}/api/social/posts/{pid}", headers=H(admin_token),
                             json={"status": s})
            assert r.status_code == 200, r.text
        # bad network
        r = requests.put(f"{BASE_URL}/api/social/posts/{pid}", headers=H(admin_token),
                         json={"networks": ["MYSPACE"]})
        assert r.status_code == 400
        requests.delete(f"{BASE_URL}/api/social/posts/{pid}", headers=H(admin_token))


# ---------------------------------------------------------------- Phase 5: Contests
class TestContests:
    def test_create_open_participate_draw(self, admin_token, member_token):
        r = requests.post(f"{BASE_URL}/api/contests", headers=H(admin_token),
                          json={"title": "TEST_ Concours", "rules": "Règlement.",
                                "winners_count": 1, "access_level": "MEMBERS"})
        assert r.status_code == 200
        cid = r.json()["contest_id"]
        r = requests.put(f"{BASE_URL}/api/contests/{cid}", headers=H(admin_token),
                         json={"status": "OPEN"})
        assert r.status_code == 200
        # participate requires rules acceptance
        r = requests.post(f"{BASE_URL}/api/contests/{cid}/participate", headers=H(member_token),
                          json={})
        assert r.status_code == 400
        r = requests.post(f"{BASE_URL}/api/contests/{cid}/participate", headers=H(member_token),
                          json={"accept_rules": True})
        assert r.status_code == 200
        # draw
        r = requests.post(f"{BASE_URL}/api/contests/{cid}/draw", headers=H(admin_token))
        assert r.status_code == 200 and r.json()["status"] == "DRAWN"
        # cannot draw twice
        r = requests.post(f"{BASE_URL}/api/contests/{cid}/draw", headers=H(admin_token))
        assert r.status_code == 400


# ---------------------------------------------------------------- Phase 5: Advent
class TestAdvent:
    def test_locked_returns_403(self, admin_token, member_token):
        year = 2099
        # cleanup possible
        r = requests.post(f"{BASE_URL}/api/advent", headers=H(admin_token),
                          json={"year": year, "title": "TEST_ Advent"})
        # ignore if exists
        r2 = requests.get(f"{BASE_URL}/api/advent?year={year}", headers=H(admin_token))
        cal = r2.json().get("calendar")
        if not cal:
            pytest.skip("calendar not created")
        cid = cal["calendar_id"]
        # create box
        r = requests.put(f"{BASE_URL}/api/advent/{cid}/boxes/1", headers=H(admin_token),
                         json={"day": 1, "title": "Case 1", "content": "Bonjour", "kind": "MESSAGE",
                               "is_published": True})
        assert r.status_code == 200
        # activate calendar (but not preview_unlocked)
        requests.put(f"{BASE_URL}/api/advent/{cid}", headers=H(admin_token),
                     json={"status": "ACTIVE", "preview_unlocked": False})
        # member cannot open (not December of year 2099)
        r = requests.post(f"{BASE_URL}/api/advent/{cid}/open/1", headers=H(member_token))
        assert r.status_code == 403
        assert "case" in r.json()["detail"].lower() or "patience" in r.json()["detail"].lower()
        # enable preview
        requests.put(f"{BASE_URL}/api/advent/{cid}", headers=H(admin_token),
                     json={"preview_unlocked": True})
        r = requests.post(f"{BASE_URL}/api/advent/{cid}/open/1", headers=H(member_token))
        assert r.status_code == 200 and r.json()["is_opened"] is True


# ---------------------------------------------------------------- Phase 6: Finance
class TestFinance:
    def test_create_and_summary_and_rbac(self, admin_token, pro_token, member_token):
        r = requests.post(f"{BASE_URL}/api/finance/transactions", headers=H(admin_token),
                          json={"direction": "IN", "date": "2026-01-15", "amount": 100.0,
                                "category": "DON", "description": "TEST_ don"})
        assert r.status_code == 200
        tid = r.json()["transaction_id"]
        r = requests.post(f"{BASE_URL}/api/finance/transactions", headers=H(admin_token),
                          json={"direction": "OUT", "date": "2026-01-16", "amount": 30.0,
                                "category": "ACHAT", "description": "TEST_ achat"})
        assert r.status_code == 200
        r = requests.get(f"{BASE_URL}/api/finance/summary?year=2026", headers=H(admin_token))
        assert r.status_code == 200
        d = r.json()
        assert d["totals"]["in"] >= 100 and d["totals"]["out"] >= 30
        # RBAC
        assert requests.get(f"{BASE_URL}/api/finance/transactions", headers=H(pro_token)).status_code == 403
        assert requests.get(f"{BASE_URL}/api/finance/summary", headers=H(member_token)).status_code == 403
        # CSV export
        r = requests.get(f"{BASE_URL}/api/finance/export?year=2026", headers=H(admin_token))
        assert r.status_code == 200
        assert "text/csv" in r.headers.get("content-type", "")
        # cleanup
        requests.delete(f"{BASE_URL}/api/finance/transactions/{tid}", headers=H(admin_token))

    def test_shares_distribution(self, admin_token, pro_token):
        _, pro = _login(PRO_STD, DEMO_PWD)
        _, pro2 = _login("pro2.demo@lavoixduchien.fr", DEMO_PWD)
        # too large distribution refused
        r = requests.post(f"{BASE_URL}/api/finance/distributions", headers=H(admin_token),
                          json={"label": "TEST_ Partage", "scope": "ACTIVITY", "date": "2026-02-01",
                                "total_amount": 100.0,
                                "lines": [{"professional_id": pro["user_id"], "mode": "FIXED", "value": 80},
                                          {"professional_id": pro2["user_id"], "mode": "FIXED", "value": 80}]})
        assert r.status_code == 400
        assert "dépasse" in r.json()["detail"].lower()
        # valid distribution
        r = requests.post(f"{BASE_URL}/api/finance/distributions", headers=H(admin_token),
                          json={"label": "TEST_ Partage OK", "scope": "ACTIVITY", "date": "2026-02-01",
                                "total_amount": 100.0,
                                "lines": [{"professional_id": pro["user_id"], "mode": "PERCENT", "value": 40},
                                          {"professional_id": pro2["user_id"], "mode": "FIXED", "value": 30}]})
        assert r.status_code == 200
        d = r.json()
        assert d["distributed_amount"] == 70.0 and d["association_amount"] == 30.0
        # pro sees only own shares
        r = requests.get(f"{BASE_URL}/api/finance/my-shares", headers=H(pro_token))
        assert r.status_code == 200
        assert all(l["professional_id"] == pro["user_id"] for l in r.json()["items"])

    def test_reimbursement_own_only_and_workflow(self, admin_token, pro_token):
        _, admin = _login("associationlavoixduchien@gmail.com", "VoixDuChien2026!")
        # pro cannot request for someone else
        r = requests.post(f"{BASE_URL}/api/finance/reimbursements", headers=H(pro_token),
                          json={"beneficiary_id": admin["user_id"], "reason": "TEST_ frais",
                                "amount": 12.5})
        assert r.status_code == 403
        r = requests.post(f"{BASE_URL}/api/finance/reimbursements", headers=H(pro_token),
                          json={"reason": "TEST_ frais essence", "amount": 12.5})
        assert r.status_code == 200
        rid = r.json()["reimbursement_id"]
        # admin approves and pays
        r = requests.put(f"{BASE_URL}/api/finance/reimbursements/{rid}", headers=H(admin_token),
                         json={"status": "APPROVED"})
        assert r.status_code == 200
        r = requests.put(f"{BASE_URL}/api/finance/reimbursements/{rid}", headers=H(admin_token),
                         json={"status": "PAID"})
        assert r.status_code == 200


# ---------------------------------------------------------------- Phase 6: Advantages
class TestAdvantages:
    def test_flow(self, admin_token, member_token):
        r = requests.post(f"{BASE_URL}/api/advantages", headers=H(admin_token),
                          json={"title": "TEST_ Avantage", "kind": "CODE_PROMO",
                                "promo_code": "SECRET", "quantity": 1, "access_level": "MEMBERS"})
        assert r.status_code == 200
        aid = r.json()["advantage_id"]
        # member sees advantage but promo_code masked
        r = requests.get(f"{BASE_URL}/api/advantages", headers=H(member_token))
        item = next(x for x in r.json()["items"] if x["advantage_id"] == aid)
        assert item.get("promo_code") is None
        # claim
        r = requests.post(f"{BASE_URL}/api/advantages/{aid}/claim", headers=H(member_token))
        assert r.status_code == 200 and r.json()["promo_code"] == "SECRET"
        # double claim refused
        r = requests.post(f"{BASE_URL}/api/advantages/{aid}/claim", headers=H(member_token))
        assert r.status_code == 400
        # now SOLD_OUT
        r = requests.get(f"{BASE_URL}/api/advantages", headers=H(admin_token))
        item = next(x for x in r.json()["items"] if x["advantage_id"] == aid)
        assert item["state"] == "SOLD_OUT"


# ---------------------------------------------------------------- Phase 7: Partners
class TestPartners:
    def test_sensitive_fields_hidden_from_pro(self, admin_token, pro_token):
        r = requests.post(f"{BASE_URL}/api/partners", headers=H(admin_token),
                          json={"name": "TEST_ Partner", "category": "COMMERCIAL", "status": "ACTIF",
                                "siret": "12345678901234", "clauses": "clause A",
                                "contact_email": "x@x.fr"})
        assert r.status_code == 200, r.text
        pid = r.json()["partner_id"]
        r = requests.get(f"{BASE_URL}/api/partners/{pid}", headers=H(pro_token))
        assert r.status_code == 200
        p = r.json()["partner"]
        for k in ("siret", "clauses", "contract_file_ids", "contact_email"):
            assert k not in p, f"sensitive field {k} leaked to pro"
        # admin exchange
        r = requests.post(f"{BASE_URL}/api/partners/{pid}/exchanges", headers=H(admin_token),
                          json={"summary": "TEST_ Discussion", "channel": "EMAIL"})
        assert r.status_code == 200
        requests.delete(f"{BASE_URL}/api/partners/{pid}", headers=H(admin_token))


# ---------------------------------------------------------------- Phase 7: Terrain
class TestTerrain:
    def test_flow(self, admin_token, pro_token):
        r = requests.post(f"{BASE_URL}/api/terrains", headers=H(admin_token),
                          json={"name": "TEST_ Terrain", "status": "DISPONIBLE"})
        assert r.status_code == 200
        tid = r.json()["terrain_id"]
        # past date refused
        r = requests.post(f"{BASE_URL}/api/terrain-reservations", headers=H(admin_token),
                          json={"terrain_id": tid, "date": "2020-01-01", "start_time": "09:00",
                                "end_time": "10:00"})
        assert r.status_code == 400
        # valid reservation
        r = requests.post(f"{BASE_URL}/api/terrain-reservations", headers=H(admin_token),
                          json={"terrain_id": tid, "date": "2030-05-01", "start_time": "09:00",
                                "end_time": "12:00", "purpose": "TEST"})
        assert r.status_code == 200
        rid = r.json()["reservation_id"]
        # confirm
        r = requests.post(f"{BASE_URL}/api/terrain-reservations/{rid}/review", headers=H(admin_token),
                          json={"decision": "CONFIRM"})
        assert r.status_code == 200
        # conflict on same slot
        r = requests.post(f"{BASE_URL}/api/terrain-reservations", headers=H(admin_token),
                          json={"terrain_id": tid, "date": "2030-05-01", "start_time": "10:00",
                                "end_time": "11:00"})
        assert r.status_code == 400
        # refuse needs comment
        r2 = requests.post(f"{BASE_URL}/api/terrain-reservations", headers=H(admin_token),
                           json={"terrain_id": tid, "date": "2030-06-01", "start_time": "09:00",
                                 "end_time": "10:00"})
        rid2 = r2.json()["reservation_id"]
        r = requests.post(f"{BASE_URL}/api/terrain-reservations/{rid2}/review", headers=H(admin_token),
                          json={"decision": "REFUSE"})
        assert r.status_code == 400


# ---------------------------------------------------------------- Phase 7: Stock
class TestStock:
    def test_movements_and_rbac(self, admin_token, pro_token):
        r = requests.post(f"{BASE_URL}/api/stock/items", headers=H(admin_token),
                          json={"name": "TEST_ Article", "category": "GOODIE", "quantity": 5,
                                "alert_threshold": 2})
        assert r.status_code == 200
        item_id = r.json()["item_id"]
        # exit larger than stock refused
        r = requests.post(f"{BASE_URL}/api/stock/items/{item_id}/movements", headers=H(admin_token),
                          json={"direction": "OUT", "quantity": 999})
        assert r.status_code == 400
        # valid OUT
        r = requests.post(f"{BASE_URL}/api/stock/items/{item_id}/movements", headers=H(admin_token),
                          json={"direction": "OUT", "quantity": 4})
        assert r.status_code == 200
        # pro forbidden
        assert requests.get(f"{BASE_URL}/api/stock/items", headers=H(pro_token)).status_code == 403
        requests.delete(f"{BASE_URL}/api/stock/items/{item_id}", headers=H(admin_token))


# ---------------------------------------------------------------- Phase 7: History
class TestHistory:
    def test_scope_own(self, pro_token, admin_token, pro_user):
        r = requests.get(f"{BASE_URL}/api/history/me", headers=H(pro_token))
        assert r.status_code == 200
        data = r.json()
        assert data["scope"] == "OWN"
        assert all(item.get("user_id") == pro_user["user_id"] for item in data["items"])


# ---------------------------------------------------------------- Phase 8: Priorities & Exports
class TestPrioritiesAndExports:
    def test_priorities(self, admin_token, pro_token):
        r = requests.get(f"{BASE_URL}/api/priorities", headers=H(admin_token))
        assert r.status_code == 200 and "items" in r.json()
        assert requests.get(f"{BASE_URL}/api/priorities", headers=H(pro_token)).status_code == 403

    @pytest.mark.parametrize("kind", ["finance", "members", "stock", "documents", "statistics",
                                       "shares", "reimbursements", "participants"])
    def test_exports_xlsx(self, admin_token, pro_token, kind):
        r = requests.get(f"{BASE_URL}/api/exports/{kind}?year=2026", headers=H(admin_token))
        assert r.status_code == 200, f"{kind}: {r.text[:200]}"
        assert r.content[:2] == b"PK"  # xlsx zip magic
        assert "openxmlformats" in r.headers.get("content-type", "")
        assert requests.get(f"{BASE_URL}/api/exports/{kind}", headers=H(pro_token)).status_code == 403


# ---------------------------------------------------------------- Crons
class TestCrons:
    def test_reminders_auth(self):
        r = requests.post(f"{BASE_URL}/api/cron/reminders", json={})
        assert r.status_code == 401
        r = requests.post(f"{BASE_URL}/api/cron/reminders",
                          headers={"Authorization": f"Bearer {CRON_SECRET}"}, json={"run_id": "TEST_run_1"})
        assert r.status_code == 200
        # idempotence
        r2 = requests.post(f"{BASE_URL}/api/cron/reminders",
                           headers={"Authorization": f"Bearer {CRON_SECRET}"}, json={"run_id": "TEST_run_1"})
        assert r2.status_code == 200 and r2.json().get("duplicate") is True

    def test_weekly_summary_endpoint_exists(self):
        # BUG: missing @router.post decorator in crons_api.py causes 404
        r = requests.post(f"{BASE_URL}/api/cron/weekly-summary",
                          headers={"Authorization": f"Bearer {CRON_SECRET}"}, json={"run_id": "TEST_ws_1"})
        assert r.status_code == 200, f"/api/cron/weekly-summary route missing (got {r.status_code})"

    def test_recap_email_auth(self):
        r = requests.post(f"{BASE_URL}/api/cron/recap-email", json={})
        assert r.status_code == 401


# ---------------------------------------------------------------- Uploads
class TestUploads:
    def test_upload_image_and_pdf_and_reject_bad_type(self, admin_token):
        img = b"\x89PNG\r\n\x1a\n" + b"\x00" * 100
        r = requests.post(f"{BASE_URL}/api/files/upload", headers=H(admin_token),
                          files={"file": ("test.png", io.BytesIO(img), "image/png")})
        assert r.status_code == 200, r.text
        fid = r.json().get("file_id")
        assert fid
        # download
        r = requests.get(f"{BASE_URL}/api/files/{fid}/download", headers=H(admin_token))
        assert r.status_code == 200
        # PDF
        pdf = b"%PDF-1.4\n%%EOF"
        r = requests.post(f"{BASE_URL}/api/files/upload", headers=H(admin_token),
                          files={"file": ("test.pdf", io.BytesIO(pdf), "application/pdf")})
        assert r.status_code == 200
        # bad type
        r = requests.post(f"{BASE_URL}/api/files/upload", headers=H(admin_token),
                          files={"file": ("bad.exe", io.BytesIO(b"MZ"), "application/x-msdownload")})
        assert r.status_code == 400


# ---------------------------------------------------------------- Feed & engagement
class TestFeedAndEngagement:
    def test_feed_and_engagement(self, member_token):
        r = requests.get(f"{BASE_URL}/api/feed", headers=H(member_token))
        assert r.status_code == 200 and "items" in r.json()
        r = requests.get(f"{BASE_URL}/api/me/engagement", headers=H(member_token))
        assert r.status_code == 200
        assert "profile_completion" in r.json()


# ---------------------------------------------------------------- Global RBAC
class TestGlobalRBAC:
    @pytest.mark.parametrize("path,method", [
        ("/api/finance/transactions", "GET"),
        ("/api/finance/summary", "GET"),
        ("/api/finance/reimbursements", "GET"),
        ("/api/stock/items", "GET"),
        ("/api/documents", "GET"),
        ("/api/priorities", "GET"),
        ("/api/exports/finance", "GET"),
    ])
    def test_management_routes_forbidden_for_pro(self, pro_token, path, method):
        r = requests.request(method, f"{BASE_URL}{path}", headers=H(pro_token))
        assert r.status_code == 403, f"{path}: expected 403 got {r.status_code}"

    @pytest.mark.parametrize("path", ["/api/finance/summary", "/api/priorities",
                                       "/api/stock/items", "/api/exports/members"])
    def test_management_routes_forbidden_for_member(self, member_token, path):
        r = requests.get(f"{BASE_URL}{path}", headers=H(member_token))
        assert r.status_code == 403
