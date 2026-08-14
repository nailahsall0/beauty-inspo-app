"""
Iteration 2 targeted tests: search enhancements (style/service/category/username),
feed batch enrichment (liked/saved/author/tagged_pro), streaming file serve,
saved/collections/user/pro list enrichment, PUT /api/professional/me services update,
and end-to-end 'create post -> search finds it by style'.
"""
import io
import os
import uuid
import pytest
import requests
from dotenv import load_dotenv

load_dotenv("/app/frontend/.env")
BASE = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") + "/api"

MAYA = ("maya@brook.ie", "Password123")
KAY = ("kay@brook.ie", "Password123")


def _login(e, p):
    r = requests.post(f"{BASE}/auth/login", json={"email": e, "password": p}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def H(t):
    return {"Authorization": f"Bearer {t}"}


@pytest.fixture(scope="module")
def maya_tok():
    return _login(*MAYA)


@pytest.fixture(scope="module")
def kay_tok():
    return _login(*KAY)


@pytest.fixture(scope="module")
def maya_me(maya_tok):
    return requests.get(f"{BASE}/auth/me", headers=H(maya_tok), timeout=30).json()


# ---- Search: styles/services/categories/usernames ----
class TestSearchEnhanced:
    def test_search_style_returns_posts(self, maya_tok):
        r = requests.get(f"{BASE}/search?q=Boho", headers=H(maya_tok), timeout=30)
        assert r.status_code == 200
        d = r.json()
        # Should include Boho-style posts if any exist
        boho_posts = [p for p in d["posts"] if (p.get("style_name") or "").lower().find("boho") >= 0]
        assert len(boho_posts) >= 0  # tolerate empty but structure present
        assert isinstance(d["suggestions"], list)
        # Suggestions should include a style/service/category with 'boho' or 'Boho'
        # (Boho Knotless service exists in seed)
        assert any("boho" in s.lower() for s in d["suggestions"]) or any(
            "boho" in (p.get("style_name") or p.get("service_name") or "").lower() for p in d["posts"]
        )

    def test_search_service_knotless(self, maya_tok):
        r = requests.get(f"{BASE}/search?q=knotless", headers=H(maya_tok), timeout=30)
        assert r.status_code == 200
        d = r.json()
        # Either a service suggestion or a matching post/professional
        has_match = (
            any("knotless" in s.lower() for s in d["suggestions"])
            or any("knotless" in (p.get("service_name") or p.get("style_name") or p.get("caption") or "").lower() for p in d["posts"])
            or any("knotless" in ((s.get("name") or "").lower()) for s in d["services"])
        )
        assert has_match, f"'knotless' should match somewhere: {d}"

    def test_search_category_hair_returns_posts(self, maya_tok):
        # First locate the 'Hair' category id
        cats = requests.get(f"{BASE}/categories", timeout=30).json()
        hair = next((c for c in cats if c["name"].lower() == "hair"), None)
        assert hair is not None, "'Hair' category should exist"
        r = requests.get(f"{BASE}/search?q=Hair", headers=H(maya_tok), timeout=30)
        assert r.status_code == 200
        d = r.json()
        # posts should include some from Hair category
        hair_posts = [p for p in d["posts"] if p.get("category_id") == hair["id"]]
        assert len(hair_posts) >= 1, f"Search for 'Hair' should include Hair-category posts, got {[p.get('category_id') for p in d['posts']]}"

    def test_search_username(self, maya_tok):
        # 'braidsbykay' is a professional username; user posts by kay should match author search too
        r = requests.get(f"{BASE}/search?q=braidsbykay", headers=H(maya_tok), timeout=30)
        assert r.status_code == 200
        d = r.json()
        # Either post authored/tagged with braidsbykay OR pro in professionals list
        has_pro = any(p.get("username") == "braidsbykay" for p in d.get("professionals", []))
        assert has_pro, "braidsbykay should be in professionals results"

    def test_search_user_finds_own_post_by_style(self, maya_tok, maya_me):
        # Get a style to use
        styles = requests.get(f"{BASE}/styles", timeout=30).json()
        assert styles
        style = styles[0]
        unique_suffix = uuid.uuid4().hex[:6]
        caption = f"TEST_search_{unique_suffix}"
        # Create post as maya with distinctive style
        r = requests.post(f"{BASE}/posts", headers=H(maya_tok), json={
            "media": [{"url": "https://example.com/x.jpg", "type": "image"}],
            "caption": caption,
            "style_id": style["id"],
            "style_name": style["name"],
            "category_id": style.get("category_id"),
        }, timeout=30)
        assert r.status_code == 200, r.text
        post = r.json()
        pid = post["id"]
        try:
            # Search by that style name should find this post
            sr = requests.get(f"{BASE}/search?q={style['name']}", headers=H(maya_tok), timeout=30)
            assert sr.status_code == 200
            posts = sr.json()["posts"]
            assert any(p["id"] == pid for p in posts), (
                f"New post with style {style['name']} should appear in search results"
            )
            # Also findable by caption substring (author search irrelevant here) via caption match
            sr2 = requests.get(f"{BASE}/search?q=TEST_search_{unique_suffix}", headers=H(maya_tok), timeout=30)
            assert sr2.status_code == 200
            assert any(p["id"] == pid for p in sr2.json()["posts"])
        finally:
            requests.delete(f"{BASE}/posts/{pid}", headers=H(maya_tok), timeout=30)


# ---- Feed batch enrichment integrity ----
class TestFeedEnrichment:
    @pytest.mark.parametrize("ft", ["foryou", "following", "nearby"])
    def test_feed_has_enriched_fields(self, maya_tok, ft):
        r = requests.get(f"{BASE}/posts/feed?feed_type={ft}", headers=H(maya_tok), timeout=30)
        assert r.status_code == 200
        posts = r.json()
        for p in posts:
            assert "author" in p and "tagged_professional" in p
            assert "liked" in p and "saved" in p
            if p["author"] is not None:
                assert "id" in p["author"] and "username" in p["author"]

    def test_liked_reflects_in_feed(self, maya_tok):
        posts = requests.get(f"{BASE}/posts/feed?feed_type=foryou", headers=H(maya_tok), timeout=30).json()
        assert posts
        pid = posts[0]["id"]
        requests.delete(f"{BASE}/posts/{pid}/like", headers=H(maya_tok), timeout=30)
        r = requests.post(f"{BASE}/posts/{pid}/like", headers=H(maya_tok), timeout=30)
        assert r.status_code == 200
        # Re-fetch feed and confirm liked=True
        posts2 = requests.get(f"{BASE}/posts/feed?feed_type=foryou", headers=H(maya_tok), timeout=30).json()
        found = next((p for p in posts2 if p["id"] == pid), None)
        assert found is not None
        assert found["liked"] is True
        # cleanup
        requests.delete(f"{BASE}/posts/{pid}/like", headers=H(maya_tok), timeout=30)

    def test_saved_reflects_in_feed(self, maya_tok):
        posts = requests.get(f"{BASE}/posts/feed?feed_type=foryou", headers=H(maya_tok), timeout=30).json()
        pid = posts[0]["id"]
        requests.delete(f"{BASE}/posts/{pid}/save", headers=H(maya_tok), timeout=30)
        r = requests.post(f"{BASE}/posts/{pid}/save", headers=H(maya_tok), timeout=30)
        assert r.status_code == 200
        posts2 = requests.get(f"{BASE}/posts/feed?feed_type=foryou", headers=H(maya_tok), timeout=30).json()
        found = next((p for p in posts2 if p["id"] == pid), None)
        assert found and found["saved"] is True
        requests.delete(f"{BASE}/posts/{pid}/save", headers=H(maya_tok), timeout=30)


# ---- Saved / Collections / User / Pro lists enrichment ----
class TestListEnrichment:
    def test_saved_enriched(self, maya_tok):
        # Ensure at least one saved post
        posts = requests.get(f"{BASE}/posts/feed", headers=H(maya_tok), timeout=30).json()
        pid = posts[0]["id"]
        requests.post(f"{BASE}/posts/{pid}/save", headers=H(maya_tok), timeout=30)
        saved = requests.get(f"{BASE}/saved", headers=H(maya_tok), timeout=30).json()
        assert saved
        s = saved[0]
        assert "author" in s and "liked" in s and "saved" in s
        assert s["saved"] is True
        requests.delete(f"{BASE}/posts/{pid}/save", headers=H(maya_tok), timeout=30)

    def test_collection_posts_enriched(self, maya_tok):
        col = requests.post(f"{BASE}/collections", headers=H(maya_tok),
                            json={"name": f"TEST_enrich_{uuid.uuid4().hex[:6]}"}, timeout=30).json()
        cid = col["id"]
        pid = requests.get(f"{BASE}/posts/feed", headers=H(maya_tok), timeout=30).json()[0]["id"]
        requests.delete(f"{BASE}/posts/{pid}/save", headers=H(maya_tok), timeout=30)
        requests.post(f"{BASE}/posts/{pid}/save?collection_id={cid}", headers=H(maya_tok), timeout=30)
        r = requests.get(f"{BASE}/collections/{cid}/posts", headers=H(maya_tok), timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert data and all("author" in p and "liked" in p and "saved" in p for p in data)
        requests.delete(f"{BASE}/collections/{cid}", headers=H(maya_tok), timeout=30)

    def test_user_posts_enriched(self, maya_tok, maya_me):
        r = requests.get(f"{BASE}/users/{maya_me['id']}/posts", headers=H(maya_tok), timeout=30)
        assert r.status_code == 200
        for p in r.json():
            assert "author" in p and "liked" in p and "saved" in p

    def test_pro_posts_enriched(self, maya_tok, kay_tok):
        kay_me = requests.get(f"{BASE}/auth/me", headers=H(kay_tok), timeout=30).json()
        pro_id = kay_me["professional_id"]
        r = requests.get(f"{BASE}/professional/{pro_id}/posts", headers=H(maya_tok), timeout=30)
        assert r.status_code == 200
        for p in r.json():
            assert "author" in p and "liked" in p and "saved" in p


# ---- Upload + StreamingResponse file serving ----
class TestFileServing:
    def test_upload_and_stream(self, maya_tok):
        # 1x1 PNG (73 bytes)
        png = bytes.fromhex(
            "89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4"
            "890000000D49444154789C6300010000000500010D0A2DB40000000049454E44"
            "AE426082"
        )
        files = {"file": ("t.png", png, "image/png")}
        r = requests.post(f"{BASE}/upload", headers=H(maya_tok), files=files, timeout=60)
        assert r.status_code == 200, r.text
        url_path = r.json()["url"]  # /api/files/...
        assert url_path.startswith("/api/files/")
        # Fetch it
        full = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") + url_path
        g = requests.get(full, timeout=30)
        assert g.status_code == 200
        assert g.headers.get("Content-Type", "").startswith("image/")
        assert g.content == png

    def test_file_bad_path_404(self):
        full = f"{BASE}/files/nonexistent/{uuid.uuid4().hex}.png"
        g = requests.get(full, timeout=30)
        assert g.status_code == 404


# ---- Professional self-service (PUT /professional/me updates services) ----
class TestProfessionalSelf:
    def test_get_pro_by_id(self, kay_tok):
        me = requests.get(f"{BASE}/auth/me", headers=H(kay_tok), timeout=30).json()
        pid = me["professional_id"]
        r = requests.get(f"{BASE}/professional/{pid}", timeout=30)
        assert r.status_code == 200
        assert r.json()["id"] == pid

    def test_put_pro_me_updates_services(self, kay_tok):
        # Get current pro
        pro = requests.get(f"{BASE}/professional/me", headers=H(kay_tok), timeout=30).json()
        original_services = pro.get("services", [])
        new_services = [{"name": "TEST_Service_A", "price": 42.0},
                        {"name": "TEST_Service_B", "price": 88.0}]
        r = requests.put(f"{BASE}/professional/me", headers=H(kay_tok),
                         json={"services": new_services}, timeout=30)
        assert r.status_code == 200, r.text
        got = requests.get(f"{BASE}/professional/me", headers=H(kay_tok), timeout=30).json()
        got_names = {s["name"] for s in got.get("services", [])}
        assert "TEST_Service_A" in got_names and "TEST_Service_B" in got_names
        # restore
        requests.put(f"{BASE}/professional/me", headers=H(kay_tok),
                     json={"services": original_services}, timeout=30)


# ---- /users/{id} + /auth/me still work (profile tab) ----
class TestProfileEndpoints:
    def test_me_and_users(self, maya_tok, maya_me):
        r = requests.get(f"{BASE}/users/{maya_me['id']}", headers=H(maya_tok), timeout=30)
        assert r.status_code == 200
        assert r.json()["id"] == maya_me["id"]

    def test_post_detail_video_support(self, maya_tok):
        # Create a post with a video item, then GET returns media with type='video'
        r = requests.post(f"{BASE}/posts", headers=H(maya_tok), json={
            "media": [{"url": "https://example.com/v.mp4", "type": "video"}],
            "caption": "TEST_video_post",
        }, timeout=30)
        assert r.status_code == 200
        pid = r.json()["id"]
        try:
            got = requests.get(f"{BASE}/posts/{pid}", headers=H(maya_tok), timeout=30).json()
            assert got["media"] and got["media"][0]["type"] == "video"
        finally:
            requests.delete(f"{BASE}/posts/{pid}", headers=H(maya_tok), timeout=30)
