"""
Iteration 3 targeted tests:
- Followers/Following list endpoints
- Client privacy (private profile) vs Professional (public)
- Collections many-to-many (add/remove/multi-collection membership, thumbs, post_count, sorting)
- Save behavior (flat save, add-to-collection ensures saved, unsave removes from collections)
- Styles normalized find-or-create (no duplicates on Boho/boho/BOHO), usage_count increment
- Categories: no test/dev categories present; 8 real categories
- Create post with custom_category, custom service_name, style_names[] + searchable
- Regression: feed enrichment, professional endpoints
"""
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


@pytest.fixture(scope="module")
def kay_me(kay_tok):
    return requests.get(f"{BASE}/auth/me", headers=H(kay_tok), timeout=30).json()


# ---- Followers / Following endpoints ----
class TestFollowersFollowing:
    def test_followers_endpoint_shape(self, maya_tok, kay_me):
        # ensure maya follows kay for a non-empty list
        requests.post(f"{BASE}/users/{kay_me['id']}/follow", headers=H(maya_tok), timeout=30)
        r = requests.get(f"{BASE}/users/{kay_me['id']}/followers", headers=H(maya_tok), timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)
        assert len(data) >= 1
        item = data[0]
        for k in ["id", "username", "display_name", "avatar_url", "is_professional",
                  "professional_id", "is_following", "is_me"]:
            assert k in item, f"missing {k} in follower item: {item}"

    def test_following_endpoint_shape(self, maya_tok, maya_me, kay_me):
        requests.post(f"{BASE}/users/{kay_me['id']}/follow", headers=H(maya_tok), timeout=30)
        r = requests.get(f"{BASE}/users/{maya_me['id']}/following", headers=H(maya_tok), timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        # maya follows kay -> kay must appear
        assert any(u["id"] == kay_me["id"] for u in data), f"kay must be in maya's following list: {data}"
        # is_me should be False for other users
        kay_entry = next(u for u in data if u["id"] == kay_me["id"])
        assert kay_entry["is_me"] is False

    def test_counts_match_user_endpoint(self, maya_tok, kay_me):
        # ensure at least one follow relation
        requests.post(f"{BASE}/users/{kay_me['id']}/follow", headers=H(maya_tok), timeout=30)
        user = requests.get(f"{BASE}/users/{kay_me['id']}", headers=H(maya_tok), timeout=30).json()
        followers = requests.get(f"{BASE}/users/{kay_me['id']}/followers", headers=H(maya_tok), timeout=30).json()
        following = requests.get(f"{BASE}/users/{kay_me['id']}/following", headers=H(maya_tok), timeout=30).json()
        assert user["followers"] == len(followers)
        assert user["following"] == len(following)


# ---- Privacy: client (private) vs professional (public) ----
class TestPrivacy:
    def test_new_user_default_private(self):
        email = f"TEST_priv_{uuid.uuid4().hex[:8]}@brook.ie"
        r = requests.post(f"{BASE}/auth/register",
                          json={"email": email, "password": "Password123",
                                "display_name": "TESTPriv", "username": f"testpriv{uuid.uuid4().hex[:6]}"},
                          timeout=30)
        assert r.status_code == 200, r.text
        tok = r.json()["access_token"]
        me = requests.get(f"{BASE}/auth/me", headers=H(tok), timeout=30).json()
        assert me.get("profile_public") is False, f"new client should default to private, got {me}"

    def test_private_client_hidden_from_others(self, kay_tok):
        # Register a fresh private client
        email = f"TEST_hidden_{uuid.uuid4().hex[:8]}@brook.ie"
        uname = f"hidden{uuid.uuid4().hex[:6]}"
        r = requests.post(f"{BASE}/auth/register",
                          json={"email": email, "password": "Password123",
                                "display_name": "TESTHidden", "username": uname},
                          timeout=30)
        assert r.status_code == 200
        tok = r.json()["access_token"]
        me = requests.get(f"{BASE}/auth/me", headers=H(tok), timeout=30).json()
        # Create a post while private
        p = requests.post(f"{BASE}/posts", headers=H(tok), json={
            "media": [{"url": "https://example.com/x.jpg", "type": "image"}],
            "caption": "TEST_hidden_post",
        }, timeout=30)
        assert p.status_code == 200

        # Owner sees full data
        own = requests.get(f"{BASE}/users/{me['id']}", headers=H(tok), timeout=30).json()
        assert own.get("private") is False
        assert own.get("post_count", 0) >= 1

        # Viewer (kay is a pro but also viewer): the code allows any non-owner non-professional to be gated;
        # actually gate condition: (not public) and (not is_professional owner-target). We are testing the
        # OWNER user being private; viewer_type does not matter. Viewer must see private:True.
        others = requests.get(f"{BASE}/users/{me['id']}", headers=H(kay_tok), timeout=30).json()
        assert others.get("private") is True, f"private client must be private to others: {others}"
        assert others.get("post_count") == 0
        assert "posts" not in others or not others.get("posts")

    def test_put_me_toggle_public(self, maya_tok, maya_me):
        original = requests.get(f"{BASE}/users/{maya_me['id']}", headers=H(maya_tok), timeout=30).json().get("profile_public")
        # Set to True
        r = requests.put(f"{BASE}/users/me", headers=H(maya_tok),
                         json={"profile_public": True}, timeout=30)
        assert r.status_code == 200
        assert r.json().get("profile_public") is True
        # Set to False
        r = requests.put(f"{BASE}/users/me", headers=H(maya_tok),
                         json={"profile_public": False}, timeout=30)
        assert r.status_code == 200
        assert r.json().get("profile_public") is False
        # restore
        if original is not None:
            requests.put(f"{BASE}/users/me", headers=H(maya_tok),
                         json={"profile_public": original}, timeout=30)

    def test_professional_is_public(self, maya_tok, kay_me):
        # Kay is a pro from seed; viewing her as maya must NOT be private
        u = requests.get(f"{BASE}/users/{kay_me['id']}", headers=H(maya_tok), timeout=30).json()
        assert u.get("private") is False
        assert u.get("post_count", 0) >= 0
        assert u.get("is_professional") is True


# ---- Collections many-to-many ----
class TestCollectionsMany:
    def test_multi_collection_membership(self, maya_tok):
        # Create two collections
        c1 = requests.post(f"{BASE}/collections", headers=H(maya_tok),
                           json={"name": f"TEST_m2m_A_{uuid.uuid4().hex[:6]}"}, timeout=30).json()
        c2 = requests.post(f"{BASE}/collections", headers=H(maya_tok),
                           json={"name": f"TEST_m2m_B_{uuid.uuid4().hex[:6]}"}, timeout=30).json()
        # Grab a post
        pid = requests.get(f"{BASE}/posts/feed", headers=H(maya_tok), timeout=30).json()[0]["id"]
        # cleanup any prior state
        requests.delete(f"{BASE}/posts/{pid}/save", headers=H(maya_tok), timeout=30)
        try:
            # Add via ?post_id=
            r1 = requests.post(f"{BASE}/collections/{c1['id']}/items?post_id={pid}", headers=H(maya_tok), timeout=30)
            assert r1.status_code == 200, r1.text
            r2 = requests.post(f"{BASE}/collections/{c2['id']}/items?post_id={pid}", headers=H(maya_tok), timeout=30)
            assert r2.status_code == 200, r2.text
            # Verify both collections contain it via /posts/{id}/collections
            pc = requests.get(f"{BASE}/posts/{pid}/collections", headers=H(maya_tok), timeout=30).json()
            cids = set(pc.get("collection_ids", []))
            assert c1["id"] in cids and c2["id"] in cids, f"post {pid} should be in both, got {cids}"
            # Each collection's thumbs and post_count auto-populated
            c1_get = next(c for c in requests.get(f"{BASE}/collections", headers=H(maya_tok), timeout=30).json() if c["id"] == c1["id"])
            c2_get = next(c for c in requests.get(f"{BASE}/collections", headers=H(maya_tok), timeout=30).json() if c["id"] == c2["id"])
            assert c1_get["post_count"] >= 1 and isinstance(c1_get.get("thumbs"), list) and len(c1_get["thumbs"]) >= 1
            assert c2_get["post_count"] >= 1 and isinstance(c2_get.get("thumbs"), list) and len(c2_get["thumbs"]) >= 1
            # Adding to a collection also ensures /saved contains it (flat save)
            saved = requests.get(f"{BASE}/saved", headers=H(maya_tok), timeout=30).json()
            assert any(p["id"] == pid for p in saved), "adding to collection should ensure flat-save"
            # DELETE from c1 only -> still in c2
            r = requests.delete(f"{BASE}/collections/{c1['id']}/items/{pid}", headers=H(maya_tok), timeout=30)
            assert r.status_code == 200
            pc = requests.get(f"{BASE}/posts/{pid}/collections", headers=H(maya_tok), timeout=30).json()
            cids = set(pc.get("collection_ids", []))
            assert c1["id"] not in cids and c2["id"] in cids
            # /collections/{cid}/posts returns posts
            posts_in_c2 = requests.get(f"{BASE}/collections/{c2['id']}/posts", headers=H(maya_tok), timeout=30).json()
            assert any(p["id"] == pid for p in posts_in_c2)
        finally:
            requests.delete(f"{BASE}/collections/{c1['id']}", headers=H(maya_tok), timeout=30)
            requests.delete(f"{BASE}/collections/{c2['id']}", headers=H(maya_tok), timeout=30)
            requests.delete(f"{BASE}/posts/{pid}/save", headers=H(maya_tok), timeout=30)

    def test_collections_sorted_by_last_used(self, maya_tok):
        c1 = requests.post(f"{BASE}/collections", headers=H(maya_tok),
                           json={"name": f"TEST_sortA_{uuid.uuid4().hex[:6]}"}, timeout=30).json()
        c2 = requests.post(f"{BASE}/collections", headers=H(maya_tok),
                           json={"name": f"TEST_sortB_{uuid.uuid4().hex[:6]}"}, timeout=30).json()
        pid = requests.get(f"{BASE}/posts/feed", headers=H(maya_tok), timeout=30).json()[0]["id"]
        try:
            # touch c1 first, then c2 -> c2 must sort before c1
            requests.post(f"{BASE}/collections/{c1['id']}/items?post_id={pid}", headers=H(maya_tok), timeout=30)
            import time; time.sleep(1.1)  # ensure distinct last_used_at
            requests.post(f"{BASE}/collections/{c2['id']}/items?post_id={pid}", headers=H(maya_tok), timeout=30)
            cols = requests.get(f"{BASE}/collections", headers=H(maya_tok), timeout=30).json()
            names = [c["name"] for c in cols]
            i1 = names.index(c1["name"])
            i2 = names.index(c2["name"])
            assert i2 < i1, f"c2 (touched later) should sort before c1: {names}"
        finally:
            requests.delete(f"{BASE}/collections/{c1['id']}", headers=H(maya_tok), timeout=30)
            requests.delete(f"{BASE}/collections/{c2['id']}", headers=H(maya_tok), timeout=30)
            requests.delete(f"{BASE}/posts/{pid}/save", headers=H(maya_tok), timeout=30)


# ---- Save behavior ----
class TestSaveBehavior:
    def test_unsave_removes_from_all_collections(self, maya_tok):
        col = requests.post(f"{BASE}/collections", headers=H(maya_tok),
                            json={"name": f"TEST_unsave_{uuid.uuid4().hex[:6]}"}, timeout=30).json()
        pid = requests.get(f"{BASE}/posts/feed", headers=H(maya_tok), timeout=30).json()[0]["id"]
        try:
            requests.post(f"{BASE}/collections/{col['id']}/items?post_id={pid}", headers=H(maya_tok), timeout=30)
            # confirm in collection
            pc = requests.get(f"{BASE}/posts/{pid}/collections", headers=H(maya_tok), timeout=30).json()
            assert col["id"] in pc.get("collection_ids", [])
            # DELETE save
            r = requests.delete(f"{BASE}/posts/{pid}/save", headers=H(maya_tok), timeout=30)
            assert r.status_code == 200
            # Now not in any collection
            pc = requests.get(f"{BASE}/posts/{pid}/collections", headers=H(maya_tok), timeout=30).json()
            assert col["id"] not in pc.get("collection_ids", [])
            # Not in /saved either
            saved = requests.get(f"{BASE}/saved", headers=H(maya_tok), timeout=30).json()
            assert not any(p["id"] == pid for p in saved)
            # Collection post_count updated to 0
            cols = requests.get(f"{BASE}/collections", headers=H(maya_tok), timeout=30).json()
            found = next((c for c in cols if c["id"] == col["id"]), None)
            assert found and found["post_count"] == 0
        finally:
            requests.delete(f"{BASE}/collections/{col['id']}", headers=H(maya_tok), timeout=30)


# ---- Styles normalized find-or-create ----
class TestStylesNormalized:
    def test_no_duplicate_boho(self, maya_tok):
        # Snapshot current 'boho' style
        before = [s for s in requests.get(f"{BASE}/styles?q=Boho", timeout=30).json() if s["searchable_name"] == "boho"]
        base_count = before[0]["usage_count"] if before else 0
        # Create with three variants
        for variant in ["Boho", "boho", "BOHO"]:
            r = requests.post(f"{BASE}/styles", headers=H(maya_tok),
                              json={"name": variant}, timeout=30)
            assert r.status_code == 200, r.text
        after = [s for s in requests.get(f"{BASE}/styles?q=Boho", timeout=30).json() if s["searchable_name"] == "boho"]
        assert len(after) == 1, f"should be exactly one 'boho' searchable, got {len(after)}"
        assert after[0]["usage_count"] >= base_count + 3, f"usage_count should increment by 3, was {base_count} now {after[0]['usage_count']}"

    def test_style_search_sorted_by_usage(self, maya_tok):
        r = requests.get(f"{BASE}/styles?q=boh", timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        for s in data:
            assert "boh" in s["searchable_name"].lower()
        # Sorted desc by usage_count
        counts = [s.get("usage_count", 0) for s in data]
        assert counts == sorted(counts, reverse=True), f"styles must be sorted by usage_count desc: {counts}"

    def test_new_custom_style_has_metadata(self, maya_tok, maya_me):
        name = f"TESTStyle_{uuid.uuid4().hex[:6]}"
        r = requests.post(f"{BASE}/styles", headers=H(maya_tok),
                          json={"name": name}, timeout=30)
        assert r.status_code == 200
        s = r.json()
        assert s["searchable_name"] == name.lower()
        assert s["usage_count"] == 1
        assert s.get("created_by") == maya_me["id"]
        assert "created_at" in s


# ---- Categories ----
class TestCategories:
    def test_no_test_categories_and_8_real(self):
        r = requests.get(f"{BASE}/categories", timeout=30)
        assert r.status_code == 200
        cats = r.json()
        for c in cats:
            n = c["name"].lower()
            assert not n.startswith("test"), f"test category present: {c['name']}"
            assert not c["name"].startswith("TEST_cat"), f"TEST_cat present: {c['name']}"
        names = {c["name"] for c in cats}
        expected = {"Hair", "Nails", "Lashes", "Brows", "Makeup", "Skincare", "Waxing", "Other"}
        assert expected.issubset(names), f"missing expected categories: {expected - names}"


# ---- Create post with custom data & style search ----
class TestCreatePostCustom:
    def test_custom_category_service_and_styles(self, maya_tok):
        # Pick 'Other' category
        cats = requests.get(f"{BASE}/categories", timeout=30).json()
        other = next((c for c in cats if c["name"] == "Other"), None)
        assert other is not None
        # Ensure a style that will be indexed
        style_name = f"TESTStyle_{uuid.uuid4().hex[:6]}"
        second_style = "Boho"
        r = requests.post(f"{BASE}/posts", headers=H(maya_tok), json={
            "media": [{"url": "https://example.com/x.jpg", "type": "image"}],
            "caption": f"TEST_custom_{uuid.uuid4().hex[:6]}",
            "category_id": other["id"],
            "custom_category": "MyCustomCategory",
            "service_name": "CustomAirbrush",  # free-text custom service
            "style_names": [style_name, second_style],
        }, timeout=30)
        assert r.status_code == 200, r.text
        post = r.json()
        pid = post["id"]
        try:
            got = requests.get(f"{BASE}/posts/{pid}", headers=H(maya_tok), timeout=30).json()
            assert got.get("custom_category") == "MyCustomCategory"
            assert got.get("service_name") == "CustomAirbrush"
            assert style_name in (got.get("style_names") or [])
            assert second_style in (got.get("style_names") or [])
            # SPEC: style_name should equal style_names[0] when only style_names is passed
            # (Currently the server does not auto-populate style_name from style_names[0])
            assert got.get("style_name") == style_name, (
                f"BUG: server should auto-set style_name to style_names[0] when style_name not provided. "
                f"style_name={got.get('style_name')} vs expected {style_name}"
            )
            # SPEC: search by a name in style_names[] should find the post
            sr = requests.get(f"{BASE}/search?q={style_name}", headers=H(maya_tok), timeout=30).json()
            assert any(p["id"] == pid for p in sr.get("posts", [])), (
                f"BUG: search endpoint only matches 'style_name' (singular) but not style_names[] array. "
                f"Post not found for q={style_name}: {sr}"
            )
        finally:
            requests.delete(f"{BASE}/posts/{pid}", headers=H(maya_tok), timeout=30)


# ---- Regression: feed still enriched & pro endpoints ----
class TestRegression:
    @pytest.mark.parametrize("ft", ["foryou", "following", "nearby"])
    def test_feed_enriched(self, maya_tok, ft):
        r = requests.get(f"{BASE}/posts/feed?feed_type={ft}", headers=H(maya_tok), timeout=30)
        assert r.status_code == 200
        for p in r.json():
            for k in ["author", "tagged_professional", "liked", "saved"]:
                assert k in p

    def test_professional_endpoint(self, kay_tok):
        me = requests.get(f"{BASE}/auth/me", headers=H(kay_tok), timeout=30).json()
        pid = me["professional_id"]
        r = requests.get(f"{BASE}/professional/{pid}", timeout=30)
        assert r.status_code == 200
        assert r.json()["id"] == pid

    def test_search(self, maya_tok):
        r = requests.get(f"{BASE}/search?q=Boho", headers=H(maya_tok), timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert "posts" in d and "professionals" in d and "suggestions" in d

    def test_notifications(self, maya_tok):
        r = requests.get(f"{BASE}/notifications", headers=H(maya_tok), timeout=30)
        assert r.status_code == 200
