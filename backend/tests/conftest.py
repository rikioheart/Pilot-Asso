import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://pilotage-voix.preview.emergentagent.com").rstrip("/")

ADMIN_EMAIL = "associationlavoixduchien@gmail.com"
ADMIN_PASSWORD = "VoixDuChien2026!"
DEMO_PWD = "Demo2026!"
PRO_STD = "pro1.demo@lavoixduchien.fr"
PRO_COORD = "pro2.demo@lavoixduchien.fr"
MEMBER = "membre1.demo@lavoixduchien.fr"
BENEVOLE = "benevole.demo@lavoixduchien.fr"
PENDING = "attente.demo@lavoixduchien.fr"


def _login(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=15)
    if r.status_code != 200:
        return None, None
    d = r.json()
    return d.get("access_token"), d.get("user")


@pytest.fixture(scope="session")
def base_url():
    return BASE_URL


@pytest.fixture(scope="session")
def admin_token():
    tok, _ = _login(ADMIN_EMAIL, ADMIN_PASSWORD)
    if not tok:
        pytest.skip("Admin login failed")
    return tok


@pytest.fixture(scope="session")
def admin_user():
    _, u = _login(ADMIN_EMAIL, ADMIN_PASSWORD)
    return u


@pytest.fixture(scope="session")
def pro_token():
    tok, _ = _login(PRO_STD, DEMO_PWD)
    if not tok:
        pytest.skip("Pro login failed")
    return tok


@pytest.fixture(scope="session")
def pro_user():
    _, u = _login(PRO_STD, DEMO_PWD)
    return u


@pytest.fixture(scope="session")
def member_token():
    tok, _ = _login(MEMBER, DEMO_PWD)
    if not tok:
        pytest.skip("Member login failed")
    return tok


@pytest.fixture(scope="session")
def member_user():
    _, u = _login(MEMBER, DEMO_PWD)
    return u


def auth_headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
