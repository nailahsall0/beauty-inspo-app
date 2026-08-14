"""
brook.ie backend API test suite.
Covers auth, catalog, feed/posts, interactions (like/save/comment/follow),
find-a-pro ranking, professional flows, tag flow, collections, search,
notifications, reports, analytics, admin gating.
"""
import os
import uuid
import pytest
import requests
from dotenv import load_dotenv

load_dotenv("/app/frontend/.env")
BASE = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") + "/api"

ADMIN = ("admin@brook.ie", "BrookAdmin_2026!")
MAYA = ("maya@brook.ie", "Password123")
KAY = ("kay@brook.ie", "Password123")
JANE = ("jane@brook.ie", "Password123")

session = requests.Session()


def _login(email, pw):
    r = session.post(f"{BASE}/auth/login", json={"email": email, "password": pw}, timeout=30)
    assert r.status_code == 200, f"login failed {email}: {r.status_code} {r.text}"
    return r.json()


@pytest.fixture(scope="session")
def maya_tok():
    return _login(*MAYA)["access_token"]


@pytest.fixture(scope="session")
def kay_tok():
    return _login(*KAY)["access_token"]


@pytest.fixture(scope="session")
def jane_tok():
    return _login(*JANE)["access_token"]


@pytest.fixture(scope="session")
def admin_tok():
    return _login(*ADMIN)["access_token"]


def H(t):
    return {"Authorization": f"Bearer {t}"}


# ---- Auth ----
class TestAuth:
    def test_login_all_seeded(self):
        for email, pw in [ADMIN, MAYA, KAY, JANE]:
            r = requests.post(f"{BASE}/auth/login", json={"email": email, "password": pw}, timeout=30)
            assert r.status_code == 200, f"{email}: {r.text}"
            d = r.json()
            assert "access_token" in d and d["user"]["email"] == email

    def test_login_bad_password(self):
        r = requests.post(f"{BASE}/auth/login", json={"email": MAYA[0], "password": "wrong"}, timeout=30)
        assert r.status_code == 401

    def test_register_and_me(self):
        email = f"test_{uuid.uuid4().hex[:8]}@brook.ie"
        uname = f"test_{uuid.uuid4().hex[:8]}"
        r = requests.post(f"{BASE}/auth/register",
                          json={"email": email, "password": "Password123", "display_name": "Test User", "username": uname},
                          timeout=30)
        assert r.status_code == 200, r.text
        tok = r.json()["access_token"]
        me = requests.get(f"{BASE}/auth/me", headers=H(tok), timeout=30)
        assert me.status_code == 200
        assert me.json()["email"] == email
        # duplicate email
        r2 = requests.post(f"{BASE}/auth/register",
                           json={"email": email, "password": "Password123", "display_name": "x", "username": uname + "b"},
                           timeout=30)
        assert r2.status_code == 409

    def test_me_requires_auth(self):
        r = requests.get(f"{BASE}/auth/me", timeout=30)
        assert r.status_code == 401

    def test_update_profile(self, maya_tok):
        r = requests.put(f"{BASE}/users/me", headers=H(maya_tok),
                         json={"bio": "Updated bio for test"}, timeout=30)
        assert r.status_code == 200
        assert r.json()["bio"] == "Updated bio for test"


# ---- Catalog ----
class TestCatalog:
    def test_categories(self):
        r = requests.get(f"{BASE}/categories", timeout=30)
        assert r.status_code == 200
        cats = r.json()
        assert len(cats) >= 5
        assert "id" in cats[0] and "name" in cats[0]

    def test_services(self):
        r = requests.get(f"{BASE}/services", timeout=30)
        assert r.status_code == 200
        assert len(r.json()) >= 10

    def test_services_by_category(self):
        cats = requests.get(f"{BASE}/categories", timeout=30).json()
        r = requests.get(f"{BASE}/services?category_id={cats[0]['id']}", timeout=30)
        assert r.status_code == 200
        for s in r.json():
            assert s["category_id"] == cats[0]["id"]

    def test_styles(self):
        r = requests.get(f"{BASE}/styles", timeout=30)
        assert r.status_code == 200
        assert len(r.json()) >= 5


# ---- Feed / posts ----
class TestFeed:
    def test_foryou_feed(self, maya_tok):
        r = requests.get(f"{BASE}/posts/feed?feed_type=foryou", headers=H(maya_tok), timeout=30)
        assert r.status_code == 200
        posts = r.json()
        assert len(posts) >= 1
        p = posts[0]
        assert "author" in p and p["author"] is not None
        assert "liked" in p and "saved" in p

    def test_following_feed(self, maya_tok):
        r = requests.get(f"{BASE}/posts/feed?feed_type=following", headers=H(maya_tok), timeout=30)
        assert r.status_code == 200

    def test_nearby_feed(self, maya_tok):
        r = requests.get(f"{BASE}/posts/feed?feed_type=nearby", headers=H(maya_tok), timeout=30)
        assert r.status_code == 200

    def test_post_detail_increments_view(self, maya_tok):
        posts = requests.get(f"{BASE}/posts/feed", headers=H(maya_tok), timeout=30).json()
        pid = posts[0]["id"]
        v1 = requests.get(f"{BASE}/posts/{pid}", headers=H(maya_tok), timeout=30).json()["view_count"]
        v2 = requests.get(f"{BASE}/posts/{pid}", headers=H(maya_tok), timeout=30).json()["view_count"]
        assert v2 == v1 + 1


# ---- Likes / Saves / Comments ----
class TestInteractions:
    def _pid(self, tok):
        return requests.get(f"{BASE}/posts/feed", headers=H(tok), timeout=30).json()[0]["id"]

    def test_like_unlike(self, maya_tok):
        pid = self._pid(maya_tok)
        requests.delete(f"{BASE}/posts/{pid}/like", headers=H(maya_tok), timeout=30)
        r = requests.post(f"{BASE}/posts/{pid}/like", headers=H(maya_tok), timeout=30)
        assert r.status_code == 200 and r.json()["liked"] is True
        r2 = requests.delete(f"{BASE}/posts/{pid}/like", headers=H(maya_tok), timeout=30)
        assert r2.status_code == 200 and r2.json()["liked"] is False

    def test_comment_and_reply(self, maya_tok):
        pid = self._pid(maya_tok)
        r = requests.post(f"{BASE}/posts/{pid}/comments", headers=H(maya_tok),
                          json={"text": "TEST_comment"}, timeout=30)
        assert r.status_code == 200
        cid = r.json()["id"]
        r2 = requests.post(f"{BASE}/posts/{pid}/comments", headers=H(maya_tok),
                           json={"text": "TEST_reply", "parent_id": cid}, timeout=30)
        assert r2.status_code == 200
        assert r2.json()["parent_id"] == cid
        listing = requests.get(f"{BASE}/posts/{pid}/comments", timeout=30).json()
        assert any(c["id"] == cid for c in listing)

    def test_save_unsave(self, maya_tok):
        pid = self._pid(maya_tok)
        requests.delete(f"{BASE}/posts/{pid}/save", headers=H(maya_tok), timeout=30)
        r = requests.post(f"{BASE}/posts/{pid}/save", headers=H(maya_tok), timeout=30)
        assert r.status_code == 200 and r.json()["saved"] is True
        saved = requests.get(f"{BASE}/saved", headers=H(maya_tok), timeout=30).json()
        assert any(p["id"] == pid for p in saved)
        requests.delete(f"{BASE}/posts/{pid}/save", headers=H(maya_tok), timeout=30)


# ---- Follows ----
class TestFollows:
    def test_follow_unfollow(self, maya_tok, kay_tok):
        me = requests.get(f"{BASE}/auth/me", headers=H(kay_tok), timeout=30).json()
        kid = me["id"]
        requests.delete(f"{BASE}/users/{kid}/follow", headers=H(maya_tok), timeout=30)
        r = requests.post(f"{BASE}/users/{kid}/follow", headers=H(maya_tok), timeout=30)
        assert r.status_code == 200 and r.json()["following"] is True
        u = requests.get(f"{BASE}/users/{kid}", headers=H(maya_tok), timeout=30).json()
        assert u["is_following"] is True and u["followers"] >= 1
        r2 = requests.delete(f"{BASE}/users/{kid}/follow", headers=H(maya_tok), timeout=30)
        assert r2.json()["following"] is False


# ---- Professional ----
class TestProfessional:
    def test_pro_me(self, kay_tok):
        r = requests.get(f"{BASE}/professional/me", headers=H(kay_tok), timeout=30)
        assert r.status_code == 200
        assert r.json()["username"] == "braidsbykay"

    def test_get_pro_by_username(self):
        r = requests.get(f"{BASE}/professional/braidsbykay", timeout=30)
        assert r.status_code == 200
        assert r.json()["verification_status"] == "VERIFIED"

    def test_pro_posts(self):
        r = requests.get(f"{BASE}/professional/braidsbykay/posts", timeout=30)
        assert r.status_code == 200

    def test_pro_analytics(self, kay_tok):
        r = requests.get(f"{BASE}/professional/me/analytics", headers=H(kay_tok), timeout=30)
        assert r.status_code == 200
        d = r.json()
        for k in ["profile_views", "post_views", "likes", "saves", "followers",
                  "tag_confirmations", "booking_clicks", "post_count"]:
            assert k in d

    def test_customer_cannot_get_pro_me(self, maya_tok):
        r = requests.get(f"{BASE}/professional/me", headers=H(maya_tok), timeout=30)
        assert r.status_code == 404

    def test_onboard_new_pro(self):
        email = f"pro_{uuid.uuid4().hex[:8]}@brook.ie"
        uname = f"pro_{uuid.uuid4().hex[:8]}"
        r = requests.post(f"{BASE}/auth/register",
                          json={"email": email, "password": "Password123", "display_name": "New Pro", "username": uname},
                          timeout=30)
        tok = r.json()["access_token"]
        onboard = requests.post(f"{BASE}/professional/onboard", headers=H(tok), json={
            "business_name": "TEST Salon", "username": uname + "_biz",
            "bio": "test bio", "city": "Dublin", "state": "IE",
            "services": [{"name": "Test Service", "price": 50}]
        }, timeout=30)
        assert onboard.status_code == 200, onboard.text
        me = requests.get(f"{BASE}/auth/me", headers=H(tok), timeout=30).json()
        assert me["is_professional"] is True
        assert me["professional_id"] is not None


# ---- Find-a-pro ranking ----
class TestFindPro:
    def test_ranking(self, maya_tok):
        posts = requests.get(f"{BASE}/posts/feed", headers=H(maya_tok), timeout=30).json()
        pid = posts[0]["id"]
        r = requests.get(f"{BASE}/posts/{pid}/professionals", headers=H(maya_tok), timeout=30)
        assert r.status_code == 200
        results = r.json()
        assert isinstance(results, list) and len(results) >= 1
        r0 = results[0]
        assert "professional" in r0 and "score" in r0 and "reasons" in r0
        # scores are non-ascending
        scores = [r_["score"] for r_ in results]
        assert scores == sorted(scores, reverse=True)

    def test_pro_search(self):
        r = requests.get(f"{BASE}/professionals/search?q=braid", timeout=30)
        assert r.status_code == 200


# ---- Tag flow ----
class TestTagFlow:
    def test_tag_flow(self, maya_tok, jane_tok):
        # Maya creates a post tagging Jane
        jane_me = requests.get(f"{BASE}/auth/me", headers=H(jane_tok), timeout=30).json()
        jane_pro_id = jane_me["professional_id"]
        assert jane_pro_id
        r = requests.post(f"{BASE}/posts", headers=H(maya_tok), json={
            "media": [{"url": "https://example.com/x.jpg", "type": "image"}],
            "caption": "TEST tag post", "tagged_professional_id": jane_pro_id
        }, timeout=30)
        assert r.status_code == 200, r.text
        post = r.json()
        assert post["tag_status"] == "pending"
        pid = post["id"]
        # Jane confirms
        r2 = requests.post(f"{BASE}/posts/{pid}/tag/respond?accept=true", headers=H(jane_tok), timeout=30)
        assert r2.status_code == 200 and r2.json()["tag_status"] == "confirmed"
        # Jane adds pro details
        r3 = requests.post(f"{BASE}/posts/{pid}/professional-details", headers=H(jane_tok),
                           json={"details": "TEST pro details"}, timeout=30)
        assert r3.status_code == 200
        # Non-tagged pro cannot add details
        r4 = requests.post(f"{BASE}/posts/{pid}/professional-details",
                           headers=H(_login(*KAY)["access_token"]),
                           json={"details": "should fail"}, timeout=30)
        assert r4.status_code == 403
        # Cleanup
        requests.delete(f"{BASE}/posts/{pid}", headers=H(maya_tok), timeout=30)


# ---- Collections ----
class TestCollections:
    def test_collection_crud(self, maya_tok):
        r = requests.post(f"{BASE}/collections", headers=H(maya_tok),
                          json={"name": f"TEST_col_{uuid.uuid4().hex[:6]}"}, timeout=30)
        assert r.status_code == 200
        cid = r.json()["id"]
        # add post via save
        pid = requests.get(f"{BASE}/posts/feed", headers=H(maya_tok), timeout=30).json()[0]["id"]
        requests.delete(f"{BASE}/posts/{pid}/save", headers=H(maya_tok), timeout=30)
        s = requests.post(f"{BASE}/posts/{pid}/save?collection_id={cid}", headers=H(maya_tok), timeout=30)
        assert s.status_code == 200
        cp = requests.get(f"{BASE}/collections/{cid}/posts", headers=H(maya_tok), timeout=30)
        assert cp.status_code == 200 and any(p["id"] == pid for p in cp.json())
        d = requests.delete(f"{BASE}/collections/{cid}", headers=H(maya_tok), timeout=30)
        assert d.status_code == 200


# ---- Search ----
class TestSearch:
    def test_search(self, maya_tok):
        r = requests.get(f"{BASE}/search?q=braid", headers=H(maya_tok), timeout=30)
        assert r.status_code == 200
        d = r.json()
        for k in ["suggestions", "posts", "professionals", "services"]:
            assert k in d


# ---- Notifications ----
class TestNotifications:
    def test_notifications(self, jane_tok):
        r = requests.get(f"{BASE}/notifications", headers=H(jane_tok), timeout=30)
        assert r.status_code == 200
        c = requests.get(f"{BASE}/notifications/unread-count", headers=H(jane_tok), timeout=30)
        assert c.status_code == 200 and "count" in c.json()
        m = requests.post(f"{BASE}/notifications/read", headers=H(jane_tok), timeout=30)
        assert m.status_code == 200


# ---- Reports & analytics ----
class TestReports:
    def test_create_report(self, maya_tok):
        pid = requests.get(f"{BASE}/posts/feed", headers=H(maya_tok), timeout=30).json()[0]["id"]
        r = requests.post(f"{BASE}/reports", headers=H(maya_tok),
                          json={"target_type": "post", "target_id": pid, "reason": "TEST"}, timeout=30)
        assert r.status_code == 200

    def test_booking_click(self):
        pros = requests.get(f"{BASE}/professionals/search?q=braid", timeout=30).json()
        r = requests.post(f"{BASE}/analytics/booking-click?professional_id={pros[0]['id']}", timeout=30)
        assert r.status_code == 200


# ---- Admin gating ----
class TestAdmin:
    def test_admin_stats(self, admin_tok):
        r = requests.get(f"{BASE}/admin/stats", headers=H(admin_tok), timeout=30)
        assert r.status_code == 200
        for k in ["users", "professionals", "posts", "reports", "pending_verifications"]:
            assert k in r.json()

    def test_non_admin_403(self, maya_tok):
        for path in ["/admin/stats", "/admin/reports", "/admin/verifications", "/admin/users"]:
            r = requests.get(f"{BASE}{path}", headers=H(maya_tok), timeout=30)
            assert r.status_code == 403, f"{path} should be 403 for non-admin"

    def test_admin_verifications(self, admin_tok):
        r = requests.get(f"{BASE}/admin/verifications", headers=H(admin_tok), timeout=30)
        assert r.status_code == 200

    def test_admin_create_category(self, admin_tok):
        r = requests.post(f"{BASE}/admin/categories", headers=H(admin_tok),
                         json={"name": f"TEST_cat_{uuid.uuid4().hex[:6]}"}, timeout=30)
        assert r.status_code == 200
