"""Prompt 10 : QR carte de visite publique + loyalty.stamp PRO_STANDARD + éditeur enrichi guides."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://pilotage-voix.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"email": "associationlavoixduchien@gmail.com", "password": "VoixDuChien2026!"}
PRO1 = {"email": "pro1.demo@lavoixduchien.fr", "password": "Demo2026!"}
MEMBRE1 = {"email": "membre1.demo@lavoixduchien.fr", "password": "Demo2026!"}
PRO1_USER_ID = "user_d1bbe5aea587"

TAG = f"TEST_p10_{uuid.uuid4().hex[:6]}"


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, f"Login {email} -> {r.status_code} {r.text}"
    body = r.json()
    return body.get("access_token") or body.get("token")


@pytest.fixture(scope="module")
def admin_token():
    return _login(**ADMIN)


@pytest.fixture(scope="module")
def pro_token():
    return _login(**PRO1)


@pytest.fixture(scope="module")
def member_token():
    return _login(**MEMBRE1)


# ================ Public business card (no auth) ================
class TestPublicCard:
    def test_public_card_active_pro(self):
        r = requests.get(f"{API}/public/professionals/{PRO1_USER_ID}")
        assert r.status_code == 200, r.text
        data = r.json()
        # champs publics attendus
        for key in ("company_name", "professional_category", "description", "specialties",
                    "services", "service_area", "departments", "website", "social_links",
                    "phone", "email", "has_logo", "display_name", "city", "department",
                    "has_avatar", "user_id"):
            assert key in data, f"Missing public field {key}"
        # aucune donnée sensible
        for forbidden in ("partnership_percentage", "contract_status", "contract_reference",
                          "contract_url", "promo_codes", "documents", "logo"):
            assert forbidden not in data, f"Sensitive field leaked: {forbidden}"
        assert data["user_id"] == PRO1_USER_ID
        assert isinstance(data["has_logo"], bool)

    def test_public_card_unknown_returns_404(self):
        r = requests.get(f"{API}/public/professionals/user_does_not_exist")
        assert r.status_code == 404

    def test_public_card_for_particulier_returns_404(self, member_token):
        # Récupérer le user_id du membre
        me = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {member_token}"}).json()
        uid = me["user"]["user_id"]
        r = requests.get(f"{API}/public/professionals/{uid}")
        assert r.status_code == 404

    def test_public_card_image_missing_logo_returns_404(self):
        r = requests.get(f"{API}/public/professionals/{PRO1_USER_ID}/image?kind=logo")
        # Doit être 404 (pas de logo) ou 200 si un logo existe — jamais 500
        assert r.status_code in (200, 404), f"Unexpected {r.status_code} {r.text[:200]}"

    def test_public_card_no_auth_required(self):
        # Sans header d'auth explicitement
        s = requests.Session()
        r = s.get(f"{API}/public/professionals/{PRO1_USER_ID}")
        assert r.status_code == 200


# ================ loyalty.stamp RBAC ================
class TestLoyaltyPermission:
    def test_pro_standard_has_loyalty_stamp(self, pro_token):
        r = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {pro_token}"})
        assert r.status_code == 200
        u = r.json().get("user", {})
        perms = u.get("permissions") or []
        assert "loyalty.stamp" in perms, f"Missing loyalty.stamp, got {perms}"
        assert u.get("access_level") == "PRO_STANDARD"

    def test_particulier_lacks_loyalty_stamp(self, member_token):
        r = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {member_token}"})
        assert r.status_code == 200
        u = r.json().get("user", {})
        perms = u.get("permissions") or []
        assert "loyalty.stamp" not in perms


# ================ Guides : éditeur enrichi HTML ================
class TestGuidesRichContent:
    guide_id = None

    def test_create_guide_with_html(self, admin_token):
        html = "<h2>Titre</h2><p><strong>gras</strong></p><ul><li>a</li></ul>"
        payload = {
            "title": f"{TAG} Guide HTML [TEST]",
            "summary": "Test éditeur enrichi",
            "module": "ACCUEIL",
            "content": html,
            "role_scopes": ["BUREAU"],
            "visibility": "ALL",
        }
        r = requests.post(f"{API}/guides", json=payload,
                          headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["content"] == html
        assert data["status"] == "PUBLISHED"
        TestGuidesRichContent.guide_id = data["guide_id"]

    def test_guide_html_persisted(self, admin_token):
        assert TestGuidesRichContent.guide_id
        r = requests.get(f"{API}/guides",
                         headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 200
        items = r.json()["items"]
        found = next((g for g in items if g["guide_id"] == TestGuidesRichContent.guide_id), None)
        assert found is not None
        assert "<strong>gras</strong>" in found["content"]
        assert "<ul>" in found["content"]

    def test_content_too_short_rejected(self, admin_token):
        payload = {
            "title": f"{TAG} short [TEST]",
            "summary": "x",
            "module": "ACCUEIL",
            "content": "short",  # < 10 chars
            "role_scopes": ["BUREAU"],
            "visibility": "ALL",
        }
        r = requests.post(f"{API}/guides", json=payload,
                          headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 422

    def test_zzz_cleanup_guide(self, admin_token):
        if TestGuidesRichContent.guide_id:
            r = requests.delete(f"{API}/guides/{TestGuidesRichContent.guide_id}?reason=test",
                                headers={"Authorization": f"Bearer {admin_token}"})
            assert r.status_code in (200, 204)
