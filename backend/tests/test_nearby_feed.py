"""
Nearby feed tests — brook.ie iteration 4
Covers:
  - GET /posts/feed?feed_type=nearby with lat/lng/radius -> distance-sorted, filtered by radius
  - Fallback: no lat/lng but viewer has saved coords -> uses saved coords
  - Fallback: no coords at all, viewer has city -> city-string match (admin -> Dublin -> empty)
  - Radius chip honored (10 vs 100 mi should change result set)
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Fallback for CI where the frontend .env var isn't exported
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().strip('"').rstrip("/")
API = f"{BASE_URL}/api"

CINCY_LAT, CINCY_LNG = 39.1031, -84.5120  # Cincinnati (maya's coords)


# -------- fixtures --------
@pytest.fixture(scope="module")
def maya_token():
    r = requests.post(f"{API}/auth/login", json={"email": "maya@brook.ie", "password": "Password123"})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": "admin@brook.ie", "password": "BrookAdmin_2026!"})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def auth(tok):
    return {"Authorization": f"Bearer {tok}"}


# -------- Distance sorting & schema --------
class TestNearbyDistanceSort:
    def test_nearby_returns_distance_field_and_sorted(self, maya_token):
        r = requests.get(
            f"{API}/posts/feed",
            params={"feed_type": "nearby", "lat": CINCY_LAT, "lng": CINCY_LNG, "radius": 100},
            headers=auth(maya_token),
        )
        assert r.status_code == 200, r.text
        posts = r.json()
        assert isinstance(posts, list)
        assert len(posts) > 0, "Expected some nearby posts within 100mi of Cincinnati"

        # Every post has a numeric distance field
        for p in posts:
            assert "distance" in p, f"missing 'distance' in post {p.get('id')}"
            assert p["distance"] is not None, f"distance is None for post {p.get('id')}"
            assert isinstance(p["distance"], (int, float))

        # Ascending order by distance
        distances = [p["distance"] for p in posts]
        assert distances == sorted(distances), f"posts not sorted asc by distance: {distances}"

    def test_radius_50_excludes_columbus(self, maya_token):
        # Columbus is ~100mi from Cincinnati; radius=50 must exclude it.
        r = requests.get(
            f"{API}/posts/feed",
            params={"feed_type": "nearby", "lat": CINCY_LAT, "lng": CINCY_LNG, "radius": 50},
            headers=auth(maya_token),
        )
        assert r.status_code == 200
        posts = r.json()
        for p in posts:
            assert p["distance"] <= 50, f"post {p.get('id')} distance {p['distance']} > 50"
            assert (p.get("city") or "").lower() != "columbus", "Columbus post should have been dropped at r=50"

    def test_radius_150_includes_columbus(self, maya_token):
        # Cincinnati -> Columbus is ~100.4mi; at r=150 the Columbus post must be included.
        r = requests.get(
            f"{API}/posts/feed",
            params={"feed_type": "nearby", "lat": CINCY_LAT, "lng": CINCY_LNG, "radius": 150},
            headers=auth(maya_token),
        )
        assert r.status_code == 200
        posts = r.json()
        cities = {(p.get("city") or "").lower() for p in posts}
        assert "columbus" in cities, f"Expected a Columbus post at r=150 but got cities {cities}"


# -------- Radius chip effect --------
class TestRadiusChips:
    def test_radius_10_vs_150_result_set_shrinks(self, maya_token):
        r10 = requests.get(
            f"{API}/posts/feed",
            params={"feed_type": "nearby", "lat": CINCY_LAT, "lng": CINCY_LNG, "radius": 10},
            headers=auth(maya_token),
        )
        r150 = requests.get(
            f"{API}/posts/feed",
            params={"feed_type": "nearby", "lat": CINCY_LAT, "lng": CINCY_LNG, "radius": 150},
            headers=auth(maya_token),
        )
        assert r10.status_code == 200 and r150.status_code == 200
        p10 = r10.json()
        p150 = r150.json()

        assert len(p10) <= len(p150), f"r=10 returned more posts ({len(p10)}) than r=150 ({len(p150)})"
        # r=10 posts must all be within 10mi
        for p in p10:
            assert p["distance"] <= 10, f"post beyond 10mi survived r=10: {p['distance']}"
        # The Columbus post (~100.4mi) must appear at r=150 but NOT at r=10
        assert len(p150) > len(p10), f"Expected more posts at radius=150 than radius=10 given the seed (got {len(p10)} vs {len(p150)})"


# -------- Fallback behaviour --------
class TestNearbyFallback:
    def test_fallback_uses_viewer_saved_coords_when_no_lat_lng(self, maya_token):
        """maya has saved coords (Cincinnati). No lat/lng in query -> should still return distance-sorted posts."""
        r = requests.get(
            f"{API}/posts/feed",
            params={"feed_type": "nearby", "radius": 100},
            headers=auth(maya_token),
        )
        assert r.status_code == 200, r.text
        posts = r.json()
        assert len(posts) > 0, "Expected fallback to maya's saved coords to return posts"
        # Distance is populated because saved coords were used
        assert all(p.get("distance") is not None for p in posts), "distance missing on fallback-by-coords response"
        # Ascending sort still enforced
        d = [p["distance"] for p in posts]
        assert d == sorted(d)

    def test_admin_dublin_no_coords_returns_empty(self, admin_token):
        """Admin: city=Dublin, no lat/lng, no Dublin posts in seed -> should return empty list (city fallback)."""
        r = requests.get(
            f"{API}/posts/feed",
            params={"feed_type": "nearby", "radius": 100},
            headers=auth(admin_token),
        )
        assert r.status_code == 200, r.text
        posts = r.json()
        assert posts == [], f"Expected empty list for admin (Dublin, no coords, no Dublin posts), got {len(posts)}"


# -------- Sanity: feed schema still returns enrichment fields --------
class TestNearbyEnrichment:
    def test_nearby_posts_have_author_and_id(self, maya_token):
        r = requests.get(
            f"{API}/posts/feed",
            params={"feed_type": "nearby", "lat": CINCY_LAT, "lng": CINCY_LNG, "radius": 100},
            headers=auth(maya_token),
        )
        assert r.status_code == 200
        posts = r.json()
        assert len(posts) > 0
        for p in posts:
            assert "id" in p
            assert "author" in p, "enriched author missing"
            assert "_id" not in p, "Mongo _id must be stripped"
