from fastapi import FastAPI, APIRouter, HTTPException, Depends, UploadFile, File, Query, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import Response, StreamingResponse
from fastapi.concurrency import run_in_threadpool
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import httpx
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
import os
import logging
import uuid
import math
import asyncio
import requests
from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field, EmailStr
import bcrypt
import jwt

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
# Configure connection pool for production stability
client = AsyncIOMotorClient(
    mongo_url,
    maxPoolSize=50,
    minPoolSize=5,
    maxIdleTimeMS=30000,
    serverSelectionTimeoutMS=5000
)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGORITHM = os.environ.get('JWT_ALGORITHM', 'HS256')
# Default to 24 hours for security (was 30 days). Can be overridden via env var.
ACCESS_TOKEN_MINUTES = int(os.environ.get('ACCESS_TOKEN_MINUTES', '1440'))

# Upload limits: 50MB default, configurable via env
MAX_UPLOAD_SIZE = int(os.environ.get('MAX_UPLOAD_SIZE_MB', '50')) * 1024 * 1024
MAX_QUERY_LENGTH = 100  # Prevent overly complex regex patterns

# ------------------------- Object Storage (S3-Compatible) -------------------------
# Works with AWS S3, Cloudflare R2, Backblaze B2, or MinIO
import boto3
from botocore.config import Config as BotoConfig
from botocore.exceptions import ClientError

APP_NAME = "brookie"

# S3 configuration from environment variables
S3_ENDPOINT = os.environ.get("S3_ENDPOINT")  # e.g., https://xxx.r2.cloudflarestorage.com
S3_ACCESS_KEY = os.environ.get("S3_ACCESS_KEY")
S3_SECRET_KEY = os.environ.get("S3_SECRET_KEY")
S3_BUCKET = os.environ.get("S3_BUCKET", "brookie")

# Initialize S3 client (lazy - only when needed)
_s3_client = None


def _get_s3():
    """Get or create S3 client."""
    global _s3_client
    if _s3_client is None:
        _s3_client = boto3.client(
            's3',
            endpoint_url=S3_ENDPOINT,
            aws_access_key_id=S3_ACCESS_KEY,
            aws_secret_access_key=S3_SECRET_KEY,
            config=BotoConfig(signature_version='s3v4')
        )
    return _s3_client


def init_storage():
    """Initialize storage - for S3 this just validates the connection."""
    try:
        _get_s3().head_bucket(Bucket=S3_BUCKET)
        logger.info(f"S3 storage connected to bucket: {S3_BUCKET}")
    except ClientError as e:
        logger.warning(f"S3 bucket check failed (may auto-create on first upload): {e}")


def put_object(path: str, data: bytes, content_type: str) -> dict:
    """Upload an object to S3-compatible storage."""
    s3 = _get_s3()
    s3.put_object(
        Bucket=S3_BUCKET,
        Key=path,
        Body=data,
        ContentType=content_type
    )
    return {"path": path, "bucket": S3_BUCKET}


def get_object(path: str, max_retries: int = 2):
    """Fetch object from S3-compatible storage with retries."""
    import time
    s3 = _get_s3()
    last_error = None

    for attempt in range(max_retries + 1):
        try:
            response = s3.get_object(Bucket=S3_BUCKET, Key=path)
            content = response['Body'].read()
            content_type = response.get('ContentType', 'application/octet-stream')
            return content, content_type
        except ClientError as e:
            error_code = e.response.get('Error', {}).get('Code', '')
            if error_code == 'NoSuchKey':
                raise HTTPException(404, "File not found")
            last_error = e
            if attempt < max_retries:
                time.sleep(2 ** attempt)
                continue
            raise
    raise last_error or Exception("Storage fetch failed")


app = FastAPI()
api = APIRouter(prefix="/api")
bearer = HTTPBearer(auto_error=False)

# Rate limiting setup
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("brookie")


# ------------------------- Helpers -------------------------
def now_iso():
    return datetime.now(timezone.utc).isoformat()


def new_id():
    return str(uuid.uuid4())


import re as _re_mod


def _re_escape(s: str) -> str:
    return _re_mod.escape(s)


def hash_pw(pw: str) -> str:
    return bcrypt.hashpw(pw.encode("utf-8")[:72], bcrypt.gensalt(rounds=12)).decode("utf-8")


def verify_pw(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode("utf-8")[:72], hashed.encode("utf-8"))
    except (ValueError, TypeError) as e:
        logger.warning(f"Password verification failed due to encoding error: {type(e).__name__}")
        return False
    except Exception as e:
        logger.exception(f"Unexpected error during password verification: {e}")
        return False


def make_token(user: dict) -> str:
    now = datetime.now(timezone.utc)
    payload = {"sub": user["id"], "role": user["role"], "iat": now,
               "exp": now + timedelta(minutes=ACCESS_TOKEN_MINUTES)}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


async def get_current_user(creds: HTTPAuthorizationCredentials = Depends(bearer)) -> dict:
    if not creds or creds.scheme.lower() != "bearer":
        raise HTTPException(401, "Not authenticated")
    try:
        payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except Exception:
        raise HTTPException(401, "Invalid or expired token")
    user = await db.users.find_one({"id": payload.get("sub")}, {"_id": 0})
    if not user or user.get("disabled"):
        raise HTTPException(401, "User unavailable")
    return user


async def get_optional_user(creds: HTTPAuthorizationCredentials = Depends(bearer)) -> Optional[dict]:
    if not creds:
        return None
    try:
        return await get_current_user(creds)
    except HTTPException as e:
        # Expected auth failures (401) - don't log, just return None
        if e.status_code != 401:
            logger.warning(f"Unexpected auth error: {e.status_code} - {e.detail}")
        return None


def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user["role"] != "admin":
        raise HTTPException(403, "Admin only")
    return user


def public_user(u: dict) -> dict:
    return {"id": u["id"], "username": u.get("username"), "display_name": u.get("display_name"),
            "avatar_url": u.get("avatar_url"), "bio": u.get("bio"), "city": u.get("city"),
            "state": u.get("state"), "lat": u.get("lat"), "lng": u.get("lng"),
            "role": u.get("role"), "is_professional": u.get("is_professional", False),
            "interests": u.get("interests", []), "profile_public": u.get("profile_public", False)}


def haversine(lat1, lon1, lat2, lon2):
    if None in (lat1, lon1, lat2, lon2):
        return None
    R = 3958.8
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


from difflib import SequenceMatcher

def fuzzy_match(query: str, target: str, threshold: float = 0.6) -> tuple:
    """
    Returns (is_match, score) where score is 0-1 similarity ratio.
    A score >= threshold is considered a match.
    """
    query = query.lower().strip()
    target = target.lower().strip()

    # Exact substring match gets highest score
    if query in target:
        return True, 1.0

    # Word-level fuzzy matching
    target_words = target.split()
    best_score = 0.0
    for word in target_words:
        ratio = SequenceMatcher(None, query, word).ratio()
        if ratio > best_score:
            best_score = ratio

    # Also check whole string similarity for multi-word queries
    full_ratio = SequenceMatcher(None, query, target).ratio()
    best_score = max(best_score, full_ratio)

    return best_score >= threshold, best_score


async def log_event(event_type: str, actor_id: Optional[str] = None, professional_id: Optional[str] = None,
                    post_id: Optional[str] = None, metadata: Optional[dict] = None):
    await db.analytics_events.insert_one({
        "id": new_id(), "event_type": event_type, "actor_id": actor_id,
        "professional_id": professional_id, "post_id": post_id,
        "metadata": metadata or {}, "created_at": now_iso()})


async def notify(user_id: str, ntype: str, actor_id: Optional[str], text: str, post_id: Optional[str] = None):
    if user_id == actor_id:
        return
    await db.notifications.insert_one({
        "id": new_id(), "user_id": user_id, "type": ntype, "actor_id": actor_id,
        "post_id": post_id, "text": text, "read": False, "created_at": now_iso()})


async def enrich_post(post: dict, viewer: Optional[dict]) -> dict:
    author = await db.users.find_one({"id": post["author_id"]}, {"_id": 0})
    post["author"] = public_user(author) if author else None
    post["tagged_professional"] = None
    if post.get("tagged_professional_id"):
        pro = await db.professional_profiles.find_one({"id": post["tagged_professional_id"]}, {"_id": 0})
        if pro:
            post["tagged_professional"] = {"id": pro["id"], "username": pro["username"],
                                           "business_name": pro["business_name"], "avatar_url": pro.get("avatar_url"),
                                           "verification_status": pro.get("verification_status")}
    post["liked"] = False
    post["saved"] = False
    if viewer:
        post["liked"] = bool(await db.likes.find_one({"post_id": post["id"], "user_id": viewer["id"]}))
        post["saved"] = bool(await db.saves.find_one({"post_id": post["id"], "user_id": viewer["id"]}))
    return post


async def enrich_posts(posts: list, viewer: Optional[dict]) -> list:
    """Batch enrichment to avoid N+1 queries (production-efficient)."""
    if not posts:
        return []
    author_ids = list({p["author_id"] for p in posts})
    pro_ids = list({p["tagged_professional_id"] for p in posts if p.get("tagged_professional_id")})
    authors = {u["id"]: u for u in await db.users.find({"id": {"$in": author_ids}}, {"_id": 0}).to_list(len(author_ids))}
    pros = {}
    if pro_ids:
        pros = {pr["id"]: pr for pr in await db.professional_profiles.find({"id": {"$in": pro_ids}}, {"_id": 0}).to_list(len(pro_ids))}
    liked_ids: set = set()
    saved_ids: set = set()
    if viewer:
        post_ids = [p["id"] for p in posts]
        liked_ids = {l["post_id"] for l in await db.likes.find({"user_id": viewer["id"], "post_id": {"$in": post_ids}}, {"_id": 0, "post_id": 1}).to_list(len(post_ids))}
        saved_ids = {s["post_id"] for s in await db.saves.find({"user_id": viewer["id"], "post_id": {"$in": post_ids}}, {"_id": 0, "post_id": 1}).to_list(len(post_ids))}
    for p in posts:
        a = authors.get(p["author_id"])
        p["author"] = public_user(a) if a else None
        p["tagged_professional"] = None
        pid = p.get("tagged_professional_id")
        if pid and pid in pros:
            pr = pros[pid]
            p["tagged_professional"] = {"id": pr["id"], "username": pr["username"], "business_name": pr["business_name"],
                                        "avatar_url": pr.get("avatar_url"), "verification_status": pr.get("verification_status")}
        p["liked"] = p["id"] in liked_ids
        p["saved"] = p["id"] in saved_ids
    return posts


# ------------------------- Personalization -------------------------
async def get_user_preferences(user_id: str) -> dict:
    """Aggregate user's implicit preferences from engagement history."""
    # Get saved and liked post IDs in parallel
    saves_task = db.saves.find({"user_id": user_id}, {"_id": 0, "post_id": 1}).to_list(500)
    likes_task = db.likes.find({"user_id": user_id}, {"_id": 0, "post_id": 1}).to_list(500)
    saves, likes = await asyncio.gather(saves_task, likes_task)

    saved_post_ids = [s["post_id"] for s in saves]
    liked_post_ids = [l["post_id"] for l in likes]

    # Batch fetch saved/liked posts for their categories and styles
    all_post_ids = list(set(saved_post_ids + liked_post_ids))
    if not all_post_ids:
        return {"saved_categories": set(), "liked_categories": set(),
                "saved_styles": set(), "liked_styles": set()}

    posts = await db.posts.find(
        {"id": {"$in": all_post_ids}},
        {"_id": 0, "id": 1, "category_id": 1, "style_names": 1}
    ).to_list(len(all_post_ids))
    post_map = {p["id"]: p for p in posts}

    saved_categories = set()
    saved_styles = set()
    liked_categories = set()
    liked_styles = set()

    for pid in saved_post_ids:
        p = post_map.get(pid, {})
        if p.get("category_id"):
            saved_categories.add(p["category_id"])
        for s in p.get("style_names", []):
            saved_styles.add(s.lower())

    for pid in liked_post_ids:
        p = post_map.get(pid, {})
        if p.get("category_id"):
            liked_categories.add(p["category_id"])
        for s in p.get("style_names", []):
            liked_styles.add(s.lower())

    return {
        "saved_categories": saved_categories,
        "liked_categories": liked_categories,
        "saved_styles": saved_styles,
        "liked_styles": liked_styles
    }


def score_post(post: dict, user: dict, user_prefs: dict, following_ids: set) -> float:
    """Calculate personalization score for a post (0-100)."""
    interests = [i.lower() for i in user.get("interests", [])]

    # 1. Interest Score (30% weight)
    interest_score = 0
    post_category = post.get("category_id") or ""
    post_styles = [s.lower() for s in post.get("style_names", [])]
    post_service = (post.get("service_name") or "").lower()

    # Check if category matches any interest (categories are UUIDs, but interests might be names)
    if post_category and post_category.lower() in interests:
        interest_score += 50
    # Style match
    for style in post_styles:
        if style in interests:
            interest_score += 30
            break
    # Service name contains interest keyword
    for interest in interests:
        if interest in post_service:
            interest_score += 20
            break
    interest_score = min(100, interest_score)

    # 2. Engagement Score (25% weight) - based on user's save/like history
    engagement_score = 0
    if post_category in user_prefs.get("saved_categories", set()):
        engagement_score += 50
    elif post_category in user_prefs.get("liked_categories", set()):
        engagement_score += 40
    for style in post_styles:
        if style in user_prefs.get("saved_styles", set()):
            engagement_score += 30
            break
    engagement_score = min(100, engagement_score)

    # 3. Social Score (20% weight) - posts from followed users
    social_score = 100 if post["author_id"] in following_ids else 0

    # 4. Quality Score (15% weight) - post engagement metrics
    likes = post.get("like_count", 0)
    saves = post.get("save_count", 0)
    engagement = likes + (saves * 3)  # Saves worth 3x likes
    quality_score = min(100, 25 * math.log10(engagement + 1)) if engagement > 0 else 0

    # 5. Recency Score (10% weight) - 7-day half-life decay
    try:
        created_str = post.get("created_at", "")
        if created_str:
            created = datetime.fromisoformat(created_str.replace("Z", "+00:00"))
            age_hours = (datetime.now(timezone.utc) - created).total_seconds() / 3600
            recency_score = 100 * (0.5 ** (age_hours / 168))  # 7-day half-life
        else:
            recency_score = 50
    except Exception:
        recency_score = 50  # Default for parsing errors

    # Weighted total
    total = (
        interest_score * 0.30 +
        engagement_score * 0.25 +
        social_score * 0.20 +
        quality_score * 0.15 +
        recency_score * 0.10
    )

    return total


async def _personalized_feed(q: dict, limit: int, viewer: dict) -> list:
    """Generate personalized feed for authenticated user with interests."""
    # Fetch candidate pool (3x limit for scoring diversity)
    candidate_limit = min(limit * 3, 120)
    candidates = await db.posts.find(q, {"_id": 0}).sort("created_at", -1).to_list(candidate_limit)

    if not candidates:
        return []

    # Get user preferences and following list in parallel
    user_prefs, following_docs = await asyncio.gather(
        get_user_preferences(viewer["id"]),
        db.follows.find(
            {"follower_id": viewer["id"]}, {"_id": 0, "following_id": 1}
        ).to_list(1000)
    )
    following_ids = {f["following_id"] for f in following_docs}

    # Score all candidates
    scored = []
    for post in candidates:
        score = score_post(post, viewer, user_prefs, following_ids)
        scored.append((score, post))

    # Sort by score descending, take top N
    scored.sort(key=lambda x: x[0], reverse=True)
    top_posts = [p for _, p in scored[:limit]]

    return await enrich_posts(top_posts, viewer)


# ------------------------- Models -------------------------
class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    display_name: str
    username: str


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class ProfileUpdate(BaseModel):
    display_name: Optional[str] = None
    username: Optional[str] = None
    bio: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    avatar_url: Optional[str] = None
    interests: Optional[List[str]] = None
    profile_public: Optional[bool] = None
    lat: Optional[float] = None
    lng: Optional[float] = None


class MediaItem(BaseModel):
    url: str
    type: str = "image"
    width: Optional[int] = None
    height: Optional[int] = None


class PostIn(BaseModel):
    media: List[MediaItem]
    caption: Optional[str] = ""
    category_id: Optional[str] = None
    service_id: Optional[str] = None
    service_name: Optional[str] = None
    style_id: Optional[str] = None
    style_name: Optional[str] = None
    style_ids: List[str] = []
    style_names: List[str] = []
    custom_category: Optional[str] = None
    attributes: Dict[str, Any] = {}
    city: Optional[str] = None
    state: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    tagged_professional_id: Optional[str] = None
    post_type: str = "customer"


class CommentIn(BaseModel):
    text: str
    parent_id: Optional[str] = None


class ServiceItem(BaseModel):
    id: Optional[str] = None
    name: str
    category_id: Optional[str] = None
    description: Optional[str] = ""
    price: Optional[float] = None
    duration: Optional[str] = None


class ProOnboardIn(BaseModel):
    business_name: str
    username: str
    bio: Optional[str] = ""
    category_ids: List[str] = []
    city: Optional[str] = None
    state: Optional[str] = None
    service_radius: Optional[int] = 25
    booking_url: Optional[str] = None
    instagram: Optional[str] = None
    tiktok: Optional[str] = None
    website: Optional[str] = None
    avatar_url: Optional[str] = None
    cover_url: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    services: List[ServiceItem] = []


class ProUpdateIn(BaseModel):
    business_name: Optional[str] = None
    bio: Optional[str] = None
    category_ids: Optional[List[str]] = None
    city: Optional[str] = None
    state: Optional[str] = None
    service_radius: Optional[int] = None
    booking_url: Optional[str] = None
    instagram: Optional[str] = None
    tiktok: Optional[str] = None
    website: Optional[str] = None
    avatar_url: Optional[str] = None
    cover_url: Optional[str] = None
    services: Optional[List[ServiceItem]] = None


class CollectionIn(BaseModel):
    name: str
    cover_url: Optional[str] = None


class ReportIn(BaseModel):
    target_type: str
    target_id: str
    reason: str
    details: Optional[str] = ""


class ProDetailsIn(BaseModel):
    details: str


class CatalogIn(BaseModel):
    name: str
    category_id: Optional[str] = None
    icon: Optional[str] = None


# ------------------------- Auth -------------------------
@api.post("/auth/register")
@limiter.limit("3/minute")
async def register(request: Request, body: RegisterIn):
    email = body.email.strip().lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(409, "Email already registered")
    uname = body.username.strip().lower()
    if await db.users.find_one({"username": uname}):
        raise HTTPException(409, "Username already taken")
    user = {"id": new_id(), "email": email, "password_hash": hash_pw(body.password),
            "role": "customer", "username": uname, "display_name": body.display_name.strip(),
            "bio": "", "city": None, "state": None, "avatar_url": None, "interests": [],
            "lat": None, "lng": None, "is_professional": False, "professional_id": None,
            "profile_public": False, "disabled": False, "created_at": now_iso()}
    await db.users.insert_one(user)
    return {"access_token": make_token(user), "user": public_user(user)}


@api.post("/auth/login")
@limiter.limit("5/minute")
async def login(request: Request, body: LoginIn):
    email = body.email.strip().lower()
    user = await db.users.find_one({"email": email})
    if not user or user.get("disabled") or not verify_pw(body.password, user["password_hash"]):
        raise HTTPException(401, "Invalid email or password")
    return {"access_token": make_token(user), "user": public_user(user)}


@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    data = public_user(user)
    data["professional_id"] = user.get("professional_id")
    data["email"] = user.get("email")
    return data


@api.put("/users/me")
async def update_me(body: ProfileUpdate, user: dict = Depends(get_current_user)):
    updates = {k: v for k, v in body.dict().items() if v is not None}
    if "username" in updates:
        updates["username"] = updates["username"].strip().lower()
        existing = await db.users.find_one({"username": updates["username"]})
        if existing and existing["id"] != user["id"]:
            raise HTTPException(409, "Username already taken")
    if updates:
        await db.users.update_one({"id": user["id"]}, {"$set": updates})
    fresh = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    return public_user(fresh)


@api.get("/users/{user_id}")
async def get_user(user_id: str, viewer: Optional[dict] = Depends(get_optional_user)):
    u = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not u:
        u = await db.users.find_one({"username": user_id.lower()}, {"_id": 0})
    if not u:
        raise HTTPException(404, "User not found")
    data = public_user(u)
    data["professional_id"] = u.get("professional_id")
    data["is_following"] = False
    is_owner = viewer and viewer["id"] == u["id"]
    if viewer:
        data["is_following"] = bool(await db.follows.find_one({"follower_id": viewer["id"], "following_id": u["id"]}))
    # Privacy gate: private client profiles are limited to owner (and non-professionals)
    if not u.get("profile_public", False) and not u.get("is_professional") and not is_owner:
        data["private"] = True
        data["followers"] = await db.follows.count_documents({"following_id": u["id"]})
        data["following"] = await db.follows.count_documents({"follower_id": u["id"]})
        data["post_count"] = 0
        return data
    data["private"] = False
    data["followers"] = await db.follows.count_documents({"following_id": u["id"]})
    data["following"] = await db.follows.count_documents({"follower_id": u["id"]})
    data["post_count"] = await db.posts.count_documents({"author_id": u["id"]})
    return data


@api.get("/users/{user_id}/followers")
async def get_followers(user_id: str, viewer: Optional[dict] = Depends(get_optional_user)):
    rels = await db.follows.find({"following_id": user_id}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return await _users_from_rels([r["follower_id"] for r in rels], viewer)


@api.get("/users/{user_id}/following")
async def get_following(user_id: str, viewer: Optional[dict] = Depends(get_optional_user)):
    rels = await db.follows.find({"follower_id": user_id}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return await _users_from_rels([r["following_id"] for r in rels], viewer)


async def _users_from_rels(ids: list, viewer: Optional[dict]):
    if not ids:
        return []
    users = {u["id"]: u for u in await db.users.find({"id": {"$in": ids}}, {"_id": 0}).to_list(len(ids))}
    my_following = set()
    if viewer:
        my_following = {f["following_id"] for f in await db.follows.find({"follower_id": viewer["id"]}, {"_id": 0, "following_id": 1}).to_list(2000)}
    out = []
    for uid in ids:
        u = users.get(uid)
        if not u:
            continue
        out.append({"id": u["id"], "username": u.get("username"), "display_name": u.get("display_name"),
                    "avatar_url": u.get("avatar_url"), "is_professional": u.get("is_professional", False),
                    "professional_id": u.get("professional_id"),
                    "is_following": u["id"] in my_following, "is_me": bool(viewer and viewer["id"] == u["id"])})
    return out


# ------------------------- Catalog: categories / services / styles -------------------------
@api.get("/categories")
async def get_categories():
    return await db.categories.find({"active": True}, {"_id": 0}).sort("order", 1).to_list(200)


@api.get("/services")
async def get_services(category_id: Optional[str] = None):
    q = {"active": True}
    if category_id:
        q["category_id"] = category_id
    return await db.services.find(q, {"_id": 0}).sort("name", 1).to_list(500)


@api.get("/styles")
async def get_styles(q: Optional[str] = None):
    query = {"active": True}
    if q:
        query["searchable_name"] = {"$regex": _re_escape(q.strip().lower()), "$options": "i"}
    return await db.styles.find(query, {"_id": 0}).sort("usage_count", -1).to_list(500)


@api.post("/styles")
async def create_style(body: CatalogIn, user: dict = Depends(get_current_user)):
    """Find-or-create a style, normalized to avoid duplicates (Boho == boho == BOHO)."""
    name = body.name.strip()
    if not name:
        raise HTTPException(400, "Style name required")
    key = name.lower()
    existing = await db.styles.find_one({"searchable_name": key}, {"_id": 0})
    if existing:
        await db.styles.update_one({"id": existing["id"]}, {"$inc": {"usage_count": 1}})
        return existing
    style = {"id": new_id(), "name": name, "searchable_name": key, "category_id": body.category_id,
             "usage_count": 1, "active": True, "created_by": user["id"], "created_at": now_iso()}
    await db.styles.insert_one(style)
    style.pop("_id", None)
    return style


# ------------------------- Posts -------------------------
@api.post("/posts")
async def create_post(body: PostIn, user: dict = Depends(get_current_user)):
    post_type = "professional" if user.get("is_professional") and body.post_type == "professional" else "customer"
    tag_status = None
    if body.tagged_professional_id:
        tag_status = "pending"
        if user.get("professional_id") == body.tagged_professional_id:
            tag_status = "confirmed"
    post = {"id": new_id(), "author_id": user["id"], "post_type": post_type,
            "media": [m.dict() for m in body.media], "caption": body.caption or "",
            "category_id": body.category_id, "custom_category": body.custom_category,
            "service_id": body.service_id, "service_name": body.service_name,
            "style_id": body.style_id, "style_name": body.style_name or (body.style_names[0] if body.style_names else None),
            "style_names": body.style_names or ([body.style_name] if body.style_name else []),
            "attributes": body.attributes,
            "city": body.city, "state": body.state, "lat": body.lat, "lng": body.lng,
            "tagged_professional_id": body.tagged_professional_id, "tag_status": tag_status,
            "professional_details": None, "professional_details_by": None,
            "like_count": 0, "comment_count": 0, "save_count": 0, "view_count": 0,
            "created_at": now_iso()}
    await db.posts.insert_one(post)
    for sname in (post["style_names"] or []):
        await db.styles.update_one({"searchable_name": sname.strip().lower()}, {"$inc": {"usage_count": 1}})
    if body.tagged_professional_id and tag_status == "pending":
        pro = await db.professional_profiles.find_one({"id": body.tagged_professional_id})
        if pro:
            await notify(pro["user_id"], "tag_request", user["id"],
                         f"{user['display_name']} tagged you in a post", post["id"])
            await log_event("PROFESSIONAL_TAG", user["id"], body.tagged_professional_id, post["id"])
    post.pop("_id", None)
    return await enrich_post(post, user)


@api.get("/posts/feed")
async def feed(feed_type: str = "foryou", category_id: Optional[str] = None,
               lat: Optional[float] = None, lng: Optional[float] = None,
               radius: int = 25, limit: int = 40,
               viewer: Optional[dict] = Depends(get_optional_user)):
    q: Dict[str, Any] = {}
    if category_id:
        q["category_id"] = category_id

    if feed_type == "following" and viewer:
        following = await db.follows.find({"follower_id": viewer["id"]}, {"_id": 0, "following_id": 1}).to_list(1000)
        ids = [f["following_id"] for f in following]
        q["author_id"] = {"$in": ids if ids else ["__none__"]}
        posts = await db.posts.find(q, {"_id": 0}).sort("created_at", -1).to_list(limit)
        return await enrich_posts(posts, viewer)

    if feed_type == "nearby":
        return await _nearby_feed(q, lat, lng, radius, limit, viewer)

    # "foryou" feed - personalized for authenticated users with interests
    if feed_type == "foryou" and viewer and viewer.get("interests"):
        return await _personalized_feed(q, limit, viewer)

    # Fallback: chronological for anonymous users or users without interests
    posts = await db.posts.find(q, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return await enrich_posts(posts, viewer)


def _post_coords(p: dict, pros: dict) -> tuple:
    """Best available coordinates for a post: its own, else its tagged pro's."""
    plat, plng = p.get("lat"), p.get("lng")
    if plat is None or plng is None:
        pro = pros.get(p.get("tagged_professional_id"))
        if pro:
            plat, plng = pro.get("lat"), pro.get("lng")
    return plat, plng


async def _nearby_feed(q: Dict[str, Any], lat: Optional[float], lng: Optional[float],
                       radius: int, limit: int, viewer: Optional[dict]) -> list:
    # Determine the reference point: device coords > viewer's saved coords.
    base_lat = lat if lat is not None else (viewer.get("lat") if viewer else None)
    base_lng = lng if lng is not None else (viewer.get("lng") if viewer else None)
    viewer_city = (viewer.get("city") if viewer else None) or None

    # Pull a generous candidate set, then rank locally.
    candidates = await db.posts.find(q, {"_id": 0}).sort("created_at", -1).to_list(400)
    if not candidates:
        return []

    pro_ids = [c["tagged_professional_id"] for c in candidates if c.get("tagged_professional_id")]
    pros = {}
    if pro_ids:
        pros = {pr["id"]: pr for pr in await db.professional_profiles.find(
            {"id": {"$in": list(set(pro_ids))}}, {"_id": 0}).to_list(len(set(pro_ids)))}

    selected: list = []
    dist_map: Dict[str, float] = {}
    if base_lat is not None and base_lng is not None:
        # Filter posts by actual GPS distance - only include posts with coordinates
        for p in candidates:
            plat, plng = _post_coords(p, pros)
            if plat is None or plng is None:
                continue  # Skip posts without GPS coordinates
            d = haversine(base_lat, base_lng, plat, plng)
            if d is not None and d <= radius:
                dist_map[p["id"]] = round(d, 1)
                selected.append(p)
        selected.sort(key=lambda p: dist_map[p["id"]])
    elif viewer_city:
        # No viewer coordinates - match posts by city AND require posts to have coordinates
        vc = viewer_city.strip().lower()
        for p in candidates:
            pc = (p.get("city") or "").strip().lower()
            plat, plng = _post_coords(p, pros)
            # Only include if city matches AND post has GPS coordinates
            if pc and pc == vc and plat is not None and plng is not None:
                selected.append(p)
    else:
        return []

    selected = selected[:limit]
    enriched = await enrich_posts(selected, viewer)
    for p in enriched:
        p["distance"] = dist_map.get(p["id"])
    return enriched


@api.get("/posts/{post_id}")
async def get_post(post_id: str, viewer: Optional[dict] = Depends(get_optional_user)):
    post = await db.posts.find_one({"id": post_id}, {"_id": 0})
    if not post:
        raise HTTPException(404, "Post not found")
    await db.posts.update_one({"id": post_id}, {"$inc": {"view_count": 1}})
    pro = await db.professional_profiles.find_one({"id": post.get("tagged_professional_id")}) if post.get("tagged_professional_id") else None
    await log_event("POST_VIEW", viewer["id"] if viewer else None, pro["id"] if pro else None, post_id)
    return await enrich_post(post, viewer)


@api.put("/posts/{post_id}")
async def update_post(post_id: str, body: PostIn, user: dict = Depends(get_current_user)):
    post = await db.posts.find_one({"id": post_id})
    if not post:
        raise HTTPException(404, "Post not found")
    if post["author_id"] != user["id"] and user["role"] != "admin":
        raise HTTPException(403, "Not allowed")
    updates = {"media": [m.dict() for m in body.media], "caption": body.caption or "",
               "category_id": body.category_id, "custom_category": body.custom_category,
               "service_id": body.service_id, "service_name": body.service_name,
               "style_id": body.style_id,
               "style_name": body.style_name or (body.style_names[0] if body.style_names else None),
               "style_names": body.style_names or ([body.style_name] if body.style_name else []),
               "attributes": body.attributes, "city": body.city, "state": body.state}
    await db.posts.update_one({"id": post_id}, {"$set": updates})
    fresh = await db.posts.find_one({"id": post_id}, {"_id": 0})
    return await enrich_post(fresh, user)


@api.delete("/posts/{post_id}")
async def delete_post(post_id: str, user: dict = Depends(get_current_user)):
    post = await db.posts.find_one({"id": post_id})
    if not post:
        raise HTTPException(404, "Post not found")
    if post["author_id"] != user["id"] and user["role"] != "admin":
        raise HTTPException(403, "Not allowed")
    await db.posts.delete_one({"id": post_id})
    await db.likes.delete_many({"post_id": post_id})
    await db.saves.delete_many({"post_id": post_id})
    await db.comments.delete_many({"post_id": post_id})
    return {"ok": True}


@api.get("/users/{user_id}/posts")
async def user_posts(user_id: str, viewer: Optional[dict] = Depends(get_optional_user)):
    u = await db.users.find_one({"id": user_id}) or await db.users.find_one({"username": user_id.lower()})
    if not u:
        raise HTTPException(404, "User not found")
    posts = await db.posts.find({"author_id": u["id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return await enrich_posts(posts, viewer)


# ------------------------- Likes -------------------------
@api.post("/posts/{post_id}/like")
async def like_post(post_id: str, user: dict = Depends(get_current_user)):
    post = await db.posts.find_one({"id": post_id})
    if not post:
        raise HTTPException(404, "Post not found")
    if not await db.likes.find_one({"post_id": post_id, "user_id": user["id"]}):
        await db.likes.insert_one({"id": new_id(), "post_id": post_id, "user_id": user["id"], "created_at": now_iso()})
        await db.posts.update_one({"id": post_id}, {"$inc": {"like_count": 1}})
        await notify(post["author_id"], "like", user["id"], f"{user['display_name']} liked your post", post_id)
        await log_event("LIKE", user["id"], None, post_id)
    fresh = await db.posts.find_one({"id": post_id}, {"_id": 0})
    return {"liked": True, "like_count": fresh["like_count"]}


@api.delete("/posts/{post_id}/like")
async def unlike_post(post_id: str, user: dict = Depends(get_current_user)):
    res = await db.likes.delete_one({"post_id": post_id, "user_id": user["id"]})
    if res.deleted_count:
        await db.posts.update_one({"id": post_id}, {"$inc": {"like_count": -1}})
    fresh = await db.posts.find_one({"id": post_id}, {"_id": 0})
    return {"liked": False, "like_count": fresh["like_count"] if fresh else 0}


# ------------------------- Comments -------------------------
@api.get("/posts/{post_id}/comments")
async def get_comments(post_id: str):
    comments = await db.comments.find({"post_id": post_id}, {"_id": 0}).sort("created_at", 1).to_list(500)
    if not comments:
        return []
    # Batch load authors to avoid N+1 queries
    author_ids = list({c["author_id"] for c in comments})
    authors = {u["id"]: u for u in await db.users.find({"id": {"$in": author_ids}}, {"_id": 0}).to_list(len(author_ids))}
    for c in comments:
        author = authors.get(c["author_id"])
        c["author"] = public_user(author) if author else None
    return comments


@api.post("/posts/{post_id}/comments")
async def add_comment(post_id: str, body: CommentIn, user: dict = Depends(get_current_user)):
    post = await db.posts.find_one({"id": post_id})
    if not post:
        raise HTTPException(404, "Post not found")
    comment = {"id": new_id(), "post_id": post_id, "author_id": user["id"], "parent_id": body.parent_id,
               "text": body.text, "created_at": now_iso()}
    await db.comments.insert_one(comment)
    await db.posts.update_one({"id": post_id}, {"$inc": {"comment_count": 1}})
    await log_event("COMMENT", user["id"], None, post_id)
    if body.parent_id:
        parent = await db.comments.find_one({"id": body.parent_id})
        if parent:
            await notify(parent["author_id"], "reply", user["id"], f"{user['display_name']} replied to your comment", post_id)
    else:
        await notify(post["author_id"], "comment", user["id"], f"{user['display_name']} commented on your post", post_id)
    comment.pop("_id", None)
    comment["author"] = public_user(user)
    return comment


# ------------------------- Saves & Collections -------------------------
async def _sync_collection(cid: str):
    items = await db.collection_items.find({"collection_id": cid}, {"_id": 0}).sort("created_at", -1).to_list(500)
    ids = [i["post_id"] for i in items]
    thumbs = []
    if ids:
        posts = await db.posts.find({"id": {"$in": ids}}, {"_id": 0, "id": 1, "media": 1}).to_list(500)
        pmap = {p["id"]: p for p in posts}
        for pid in ids:
            p = pmap.get(pid)
            if p and p.get("media"):
                thumbs.append(p["media"][0]["url"])
            if len(thumbs) >= 4:
                break
    await db.collections.update_one({"id": cid}, {"$set": {"post_count": len(ids), "thumbs": thumbs,
                                                           "cover_url": thumbs[0] if thumbs else None}})


@api.post("/posts/{post_id}/save")
async def save_post(post_id: str, collection_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    post = await db.posts.find_one({"id": post_id})
    if not post:
        raise HTTPException(404, "Post not found")
    existing = await db.saves.find_one({"post_id": post_id, "user_id": user["id"]})
    if not existing:
        await db.saves.insert_one({"id": new_id(), "post_id": post_id, "user_id": user["id"],
                                   "created_at": now_iso()})
        await db.posts.update_one({"id": post_id}, {"$inc": {"save_count": 1}})
        await log_event("SAVE", user["id"], None, post_id)
        await notify(post["author_id"], "save", user["id"], f"{user['display_name']} saved your post", post_id)
    if collection_id:
        await _add_to_collection(collection_id, post_id, user["id"])
    return {"saved": True}


@api.delete("/posts/{post_id}/save")
async def unsave_post(post_id: str, user: dict = Depends(get_current_user)):
    save = await db.saves.find_one({"post_id": post_id, "user_id": user["id"]})
    if save:
        await db.saves.delete_one({"id": save["id"]})
        await db.posts.update_one({"id": post_id}, {"$inc": {"save_count": -1}})
    # remove from all collections owned by user
    items = await db.collection_items.find({"post_id": post_id, "user_id": user["id"]}, {"_id": 0}).to_list(100)
    await db.collection_items.delete_many({"post_id": post_id, "user_id": user["id"]})
    for cid in {i["collection_id"] for i in items}:
        await _sync_collection(cid)
    return {"saved": False}


async def _add_to_collection(cid: str, post_id: str, user_id: str):
    col = await db.collections.find_one({"id": cid, "user_id": user_id})
    if not col:
        raise HTTPException(404, "Collection not found")
    if not await db.collection_items.find_one({"collection_id": cid, "post_id": post_id}):
        await db.collection_items.insert_one({"id": new_id(), "collection_id": cid, "post_id": post_id,
                                              "user_id": user_id, "created_at": now_iso()})
    # ensure a flat save exists too
    if not await db.saves.find_one({"post_id": post_id, "user_id": user_id}):
        await db.saves.insert_one({"id": new_id(), "post_id": post_id, "user_id": user_id, "created_at": now_iso()})
        await db.posts.update_one({"id": post_id}, {"$inc": {"save_count": 1}})
    await db.collections.update_one({"id": cid}, {"$set": {"last_used_at": now_iso()}})
    await _sync_collection(cid)


@api.post("/collections/{cid}/items")
async def add_collection_item(cid: str, post_id: str, user: dict = Depends(get_current_user)):
    await _add_to_collection(cid, post_id, user["id"])
    return {"ok": True}


@api.delete("/collections/{cid}/items/{post_id}")
async def remove_collection_item(cid: str, post_id: str, user: dict = Depends(get_current_user)):
    await db.collection_items.delete_many({"collection_id": cid, "post_id": post_id, "user_id": user["id"]})
    await _sync_collection(cid)
    return {"ok": True}


@api.get("/posts/{post_id}/collections")
async def post_collections(post_id: str, user: dict = Depends(get_current_user)):
    """Return the user's collections that contain this post (for save UI)."""
    items = await db.collection_items.find({"post_id": post_id, "user_id": user["id"]}, {"_id": 0, "collection_id": 1}).to_list(100)
    return {"collection_ids": [i["collection_id"] for i in items]}


@api.get("/saved")
async def get_saved(viewer: dict = Depends(get_current_user)):
    saves = await db.saves.find({"user_id": viewer["id"]}, {"_id": 0}).sort("created_at", -1).to_list(500)
    ids = [s["post_id"] for s in saves]
    posts = await db.posts.find({"id": {"$in": ids}}, {"_id": 0}).to_list(500)
    pmap = {p["id"]: p for p in posts}
    ordered = [pmap[i] for i in ids if i in pmap]
    return await enrich_posts(ordered, viewer)


@api.get("/collections")
async def list_collections(viewer: dict = Depends(get_current_user)):
    cols = await db.collections.find({"user_id": viewer["id"]}, {"_id": 0}).sort([("last_used_at", -1), ("created_at", -1)]).to_list(200)
    return cols


@api.post("/collections")
async def create_collection(body: CollectionIn, viewer: dict = Depends(get_current_user)):
    col = {"id": new_id(), "user_id": viewer["id"], "name": body.name, "cover_url": body.cover_url,
           "thumbs": [], "post_count": 0, "created_at": now_iso(), "last_used_at": now_iso()}
    await db.collections.insert_one(col)
    col.pop("_id", None)
    return col


@api.put("/collections/{cid}")
async def rename_collection(cid: str, body: CollectionIn, viewer: dict = Depends(get_current_user)):
    col = await db.collections.find_one({"id": cid, "user_id": viewer["id"]})
    if not col:
        raise HTTPException(404, "Not found")
    await db.collections.update_one({"id": cid}, {"$set": {"name": body.name}})
    return {"ok": True}


@api.delete("/collections/{cid}")
async def delete_collection(cid: str, viewer: dict = Depends(get_current_user)):
    await db.collections.delete_one({"id": cid, "user_id": viewer["id"]})
    await db.collection_items.delete_many({"collection_id": cid})
    return {"ok": True}


@api.get("/collections/{cid}/posts")
async def collection_posts(cid: str, viewer: dict = Depends(get_current_user)):
    items = await db.collection_items.find({"collection_id": cid}, {"_id": 0}).sort("created_at", -1).to_list(500)
    ids = [i["post_id"] for i in items]
    posts = await db.posts.find({"id": {"$in": ids}}, {"_id": 0}).to_list(500)
    pmap = {p["id"]: p for p in posts}
    ordered = [pmap[i] for i in ids if i in pmap]
    return await enrich_posts(ordered, viewer)


# ------------------------- Follows -------------------------
@api.post("/users/{user_id}/follow")
async def follow_user(user_id: str, viewer: dict = Depends(get_current_user)):
    if user_id == viewer["id"]:
        raise HTTPException(400, "Cannot follow yourself")
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(404, "User not found")
    if not await db.follows.find_one({"follower_id": viewer["id"], "following_id": user_id}):
        await db.follows.insert_one({"id": new_id(), "follower_id": viewer["id"], "following_id": user_id, "created_at": now_iso()})
        await notify(user_id, "follow", viewer["id"], f"{viewer['display_name']} followed you")
        await log_event("FOLLOW", viewer["id"], target.get("professional_id"))
    return {"following": True}


@api.delete("/users/{user_id}/follow")
async def unfollow_user(user_id: str, viewer: dict = Depends(get_current_user)):
    await db.follows.delete_one({"follower_id": viewer["id"], "following_id": user_id})
    return {"following": False}


# ------------------------- Professional -------------------------
@api.post("/professional/onboard")
async def pro_onboard(body: ProOnboardIn, user: dict = Depends(get_current_user)):
    if user.get("professional_id"):
        raise HTTPException(409, "Professional profile already exists")
    uname = body.username.strip().lower()
    existing = await db.professional_profiles.find_one({"username": uname})
    if existing:
        raise HTTPException(409, "Professional username already taken")
    services = []
    for s in body.services:
        sd = s.dict()
        sd["id"] = sd.get("id") or new_id()
        services.append(sd)
    pro = {"id": new_id(), "user_id": user["id"], "business_name": body.business_name, "username": uname,
           "bio": body.bio or "", "category_ids": body.category_ids, "city": body.city, "state": body.state,
           "service_radius": body.service_radius or 25, "booking_url": body.booking_url,
           "instagram": body.instagram, "tiktok": body.tiktok, "website": body.website,
           "avatar_url": body.avatar_url or user.get("avatar_url"), "cover_url": body.cover_url,
           "lat": body.lat if body.lat is not None else user.get("lat"),
           "lng": body.lng if body.lng is not None else user.get("lng"),
           "services": services, "verification_status": "NOT_VERIFIED", "created_at": now_iso()}
    await db.professional_profiles.insert_one(pro)
    await db.users.update_one({"id": user["id"]}, {"$set": {"is_professional": True, "professional_id": pro["id"], "profile_public": True}})
    pro.pop("_id", None)
    return pro


@api.get("/professional/me")
async def pro_me(user: dict = Depends(get_current_user)):
    if not user.get("professional_id"):
        raise HTTPException(404, "No professional profile")
    pro = await db.professional_profiles.find_one({"id": user["professional_id"]}, {"_id": 0})
    return pro


@api.put("/professional/me")
async def pro_update(body: ProUpdateIn, user: dict = Depends(get_current_user)):
    if not user.get("professional_id"):
        raise HTTPException(404, "No professional profile")
    updates = {k: v for k, v in body.dict().items() if v is not None}
    if "services" in updates:
        svcs = []
        for s in updates["services"]:
            s["id"] = s.get("id") or new_id()
            svcs.append(s)
        updates["services"] = svcs
    await db.professional_profiles.update_one({"id": user["professional_id"]}, {"$set": updates})
    pro = await db.professional_profiles.find_one({"id": user["professional_id"]}, {"_id": 0})
    return pro


@api.get("/professional/{pro_id}")
async def get_professional(pro_id: str, viewer: Optional[dict] = Depends(get_optional_user)):
    pro = await db.professional_profiles.find_one({"id": pro_id}, {"_id": 0})
    if not pro:
        pro = await db.professional_profiles.find_one({"username": pro_id.lower()}, {"_id": 0})
    if not pro:
        raise HTTPException(404, "Professional not found")
    owner = await db.users.find_one({"id": pro["user_id"]}, {"_id": 0})
    pro["owner"] = public_user(owner) if owner else None
    pro["followers"] = await db.follows.count_documents({"following_id": pro["user_id"]})
    pro["post_count"] = await db.posts.count_documents({"author_id": pro["user_id"]})
    pro["is_following"] = False
    if viewer:
        pro["is_following"] = bool(await db.follows.find_one({"follower_id": viewer["id"], "following_id": pro["user_id"]}))
    await log_event("PROFILE_VIEW", viewer["id"] if viewer else None, pro["id"])
    return pro


@api.get("/professional/{pro_id}/posts")
async def pro_posts(pro_id: str, viewer: Optional[dict] = Depends(get_optional_user)):
    pro = await db.professional_profiles.find_one({"id": pro_id}, {"_id": 0}) or \
        await db.professional_profiles.find_one({"username": pro_id.lower()}, {"_id": 0})
    if not pro:
        raise HTTPException(404, "Professional not found")
    # Only show posts made as professional, not personal customer posts
    posts = await db.posts.find(
        {"author_id": pro["user_id"], "post_type": "professional"}, {"_id": 0}
    ).sort("created_at", -1).to_list(200)
    return await enrich_posts(posts, viewer)


@api.post("/professional/verification/request")
@limiter.limit("2/hour")
async def request_verification(request: Request, user: dict = Depends(get_current_user)):
    if not user.get("professional_id"):
        raise HTTPException(404, "No professional profile")
    await db.professional_profiles.update_one({"id": user["professional_id"]}, {"$set": {"verification_status": "PENDING"}})
    return {"verification_status": "PENDING"}


@api.get("/professional/me/analytics")
async def pro_analytics(user: dict = Depends(get_current_user)):
    if not user.get("professional_id"):
        raise HTTPException(404, "No professional profile")
    pid = user["professional_id"]

    # Use aggregation to sum post stats without loading all posts into memory
    post_stats_pipeline = [
        {"$match": {"author_id": user["id"]}},
        {"$group": {
            "_id": None,
            "post_count": {"$sum": 1},
            "post_views": {"$sum": {"$ifNull": ["$view_count", 0]}},
            "likes": {"$sum": {"$ifNull": ["$like_count", 0]}},
            "saves": {"$sum": {"$ifNull": ["$save_count", 0]}}
        }}
    ]
    post_stats = await db.posts.aggregate(post_stats_pipeline).to_list(1)
    stats = post_stats[0] if post_stats else {"post_count": 0, "post_views": 0, "likes": 0, "saves": 0}

    return {
        "profile_views": await db.analytics_events.count_documents({"event_type": "PROFILE_VIEW", "professional_id": pid}),
        "post_views": stats["post_views"],
        "likes": stats["likes"],
        "saves": stats["saves"],
        "followers": await db.follows.count_documents({"following_id": user["id"]}),
        "tag_confirmations": await db.posts.count_documents({"tagged_professional_id": pid, "tag_status": "confirmed"}),
        "booking_clicks": await db.analytics_events.count_documents({"event_type": "BOOKING_CLICK", "professional_id": pid}),
        "post_count": stats["post_count"],
    }


# ------------------------- Professional Tagging -------------------------
@api.post("/posts/{post_id}/tag")
async def tag_professional(post_id: str, professional_id: str, user: dict = Depends(get_current_user)):
    post = await db.posts.find_one({"id": post_id})
    if not post or post["author_id"] != user["id"]:
        raise HTTPException(403, "Not allowed")
    pro = await db.professional_profiles.find_one({"id": professional_id})
    if not pro:
        raise HTTPException(404, "Professional not found")
    status = "confirmed" if user.get("professional_id") == professional_id else "pending"
    await db.posts.update_one({"id": post_id}, {"$set": {"tagged_professional_id": professional_id, "tag_status": status}})
    if status == "pending":
        await notify(pro["user_id"], "tag_request", user["id"], f"{user['display_name']} tagged you in a post", post_id)
        await log_event("PROFESSIONAL_TAG", user["id"], professional_id, post_id)
    return {"tag_status": status}


@api.post("/posts/{post_id}/tag/respond")
async def respond_tag(post_id: str, accept: bool, user: dict = Depends(get_current_user)):
    if not user.get("professional_id"):
        raise HTTPException(403, "Not a professional")
    post = await db.posts.find_one({"id": post_id})
    if not post or post.get("tagged_professional_id") != user["professional_id"]:
        raise HTTPException(403, "Not allowed")
    status = "confirmed" if accept else "rejected"
    update = {"tag_status": status}
    if not accept:
        update["tagged_professional_id"] = None
    await db.posts.update_one({"id": post_id}, {"$set": update})
    await notify(post["author_id"], "tag_confirmed" if accept else "tag_rejected", user["id"],
                 f"{user['display_name']} {'confirmed' if accept else 'rejected'} your tag", post_id)
    return {"tag_status": status}


@api.post("/posts/{post_id}/professional-details")
async def add_pro_details(post_id: str, body: ProDetailsIn, user: dict = Depends(get_current_user)):
    if not user.get("professional_id"):
        raise HTTPException(403, "Not a professional")
    post = await db.posts.find_one({"id": post_id})
    if not post or post.get("tagged_professional_id") != user["professional_id"] or post.get("tag_status") != "confirmed":
        raise HTTPException(403, "You must be a confirmed tagged professional")
    await db.posts.update_one({"id": post_id}, {"$set": {"professional_details": body.details, "professional_details_by": user["professional_id"]}})
    await notify(post["author_id"], "pro_details", user["id"], f"{user['display_name']} added professional details to your post", post_id)
    return {"ok": True}


# ------------------------- Find a professional (ranking) -------------------------
@api.get("/posts/{post_id}/professionals")
async def find_professionals(post_id: str, viewer: Optional[dict] = Depends(get_optional_user)):
    post = await db.posts.find_one({"id": post_id}, {"_id": 0})
    if not post:
        raise HTTPException(404, "Post not found")
    await log_event("FIND_PROFESSIONAL_CLICK", viewer["id"] if viewer else None, None, post_id)
    return await _rank_professionals(post.get("category_id"), post.get("service_name"), post.get("style_name"),
                                     post.get("lat"), post.get("lng"), post.get("city"), viewer)


async def _rank_professionals(category_id, service_name, style_name, plat, plng, pcity, viewer):
    """Rank professionals using aggregation pipeline to avoid N+1 queries."""
    vlat = viewer.get("lat") if viewer else None
    vlng = viewer.get("lng") if viewer else None
    base_lat = vlat if vlat is not None else plat
    base_lng = vlng if vlng is not None else plng

    # Use aggregation pipeline to join professionals with their post stats in one query
    pipeline = [
        {"$lookup": {
            "from": "posts",
            "localField": "user_id",
            "foreignField": "author_id",
            "pipeline": [
                {"$group": {
                    "_id": None,
                    "post_count": {"$sum": 1},
                    "total_likes": {"$sum": {"$ifNull": ["$like_count", 0]}},
                    "total_saves": {"$sum": {"$ifNull": ["$save_count", 0]}}
                }}
            ],
            "as": "post_stats"
        }},
        {"$addFields": {
            "post_count": {"$ifNull": [{"$arrayElemAt": ["$post_stats.post_count", 0]}, 0]},
            "total_engagement": {"$add": [
                {"$ifNull": [{"$arrayElemAt": ["$post_stats.total_likes", 0]}, 0]},
                {"$ifNull": [{"$arrayElemAt": ["$post_stats.total_saves", 0]}, 0]}
            ]}
        }},
        {"$project": {"post_stats": 0, "_id": 0}},
        {"$limit": 500}  # Reasonable limit to prevent memory issues
    ]

    pros = await db.professional_profiles.aggregate(pipeline).to_list(500)

    results = []
    for pro in pros:
        svc_names = [(s.get("name") or "").lower() for s in pro.get("services", [])]
        score = 0.0
        reasons = {}

        # Service match scoring
        if service_name and service_name.lower() in svc_names:
            score += 35
            reasons["service_match"] = True
        elif service_name and any(service_name.lower() in n or n in service_name.lower() for n in svc_names):
            score += 18
            reasons["service_match"] = "partial"

        # Style match scoring
        if style_name and (style_name.lower() in (pro.get("bio") or "").lower() or any(style_name.lower() in n for n in svc_names)):
            score += 20
            reasons["style_match"] = True

        # Category match scoring
        if category_id and category_id in pro.get("category_ids", []):
            score += 10

        # Distance scoring
        dist = haversine(base_lat, base_lng, pro.get("lat"), pro.get("lng"))
        if dist is not None:
            radius = pro.get("service_radius", 25) or 25
            if dist <= radius:
                score += 20 * max(0.3, 1 - dist / (radius * 2))
                reasons["serves_area"] = True
            else:
                score += max(0, 8 - dist / 15)
        elif pcity and pro.get("city") and pcity.lower() == pro.get("city").lower():
            score += 15
            reasons["same_city"] = True

        # Post count scoring (from aggregation)
        pc = pro.get("post_count", 0)
        score += min(10, pc * 2)

        # Engagement scoring (from aggregation)
        eng = pro.get("total_engagement", 0)
        score += min(10, eng / 5)

        # Profile completeness scoring
        comp = sum(1 for f in [pro.get("bio"), pro.get("avatar_url"), pro.get("cover_url"), pro.get("booking_url"), pro.get("services")] if f)
        score += (comp / 5) * 5

        # Verification bonus
        if pro.get("verification_status") == "VERIFIED":
            score += 3

        results.append({"professional": {
            "id": pro["id"], "username": pro["username"], "business_name": pro["business_name"],
            "avatar_url": pro.get("avatar_url"), "cover_url": pro.get("cover_url"), "bio": pro.get("bio"),
            "city": pro.get("city"), "state": pro.get("state"), "verification_status": pro.get("verification_status"),
            "services": pro.get("services", []),
            "starting_price": min([s["price"] for s in pro.get("services", []) if s.get("price")], default=None),
        }, "score": round(score, 1), "distance": round(dist, 1) if dist is not None else None, "reasons": reasons})

    results.sort(key=lambda r: r["score"], reverse=True)
    return results[:20]


@api.get("/professionals/search")
async def search_professionals(q: Optional[str] = None, category_id: Optional[str] = None,
                               city: Optional[str] = None, max_distance: Optional[int] = None,
                               viewer: Optional[dict] = Depends(get_optional_user)):
    # Validate query lengths
    if q and len(q) > MAX_QUERY_LENGTH:
        raise HTTPException(400, f"Search query too long. Maximum {MAX_QUERY_LENGTH} characters.")
    if city and len(city) > MAX_QUERY_LENGTH:
        raise HTTPException(400, f"City query too long. Maximum {MAX_QUERY_LENGTH} characters.")

    query: Dict[str, Any] = {}
    if category_id:
        query["category_ids"] = category_id
    if city:
        query["city"] = {"$regex": _re_escape(city), "$options": "i"}  # Escape regex metacharacters
    pros = await db.professional_profiles.find(query, {"_id": 0}).to_list(500)
    if q:
        ql = q.lower()
        pros = [p for p in pros if ql in (p.get("business_name") or "").lower() or ql in (p.get("username") or "").lower()
                or ql in (p.get("bio") or "").lower()
                or any(ql in (s.get("name") or "").lower() for s in p.get("services", []))]
    vlat = viewer.get("lat") if viewer else None
    vlng = viewer.get("lng") if viewer else None
    out = []
    for p in pros:
        dist = haversine(vlat, vlng, p.get("lat"), p.get("lng"))
        if max_distance and dist is not None and dist > max_distance:
            continue
        out.append({"id": p["id"], "username": p["username"], "business_name": p["business_name"],
                    "avatar_url": p.get("avatar_url"), "cover_url": p.get("cover_url"), "bio": p.get("bio"),
                    "city": p.get("city"), "state": p.get("state"), "verification_status": p.get("verification_status"),
                    "starting_price": min([s["price"] for s in p.get("services", []) if s.get("price")], default=None),
                    "distance": round(dist, 1) if dist is not None else None})
    out.sort(key=lambda r: (r["distance"] is None, r["distance"] if r["distance"] is not None else 9999))
    return out


# ------------------------- Search -------------------------
@api.get("/search")
async def search(q: str, viewer: Optional[dict] = Depends(get_optional_user)):
    # Validate query length to prevent overly complex regex patterns
    q = q.strip()
    if len(q) > MAX_QUERY_LENGTH:
        raise HTTPException(400, f"Search query too long. Maximum {MAX_QUERY_LENGTH} characters.")
    if not q:
        raise HTTPException(400, "Search query cannot be empty")

    await log_event("SEARCH", viewer["id"] if viewer else None, metadata={"q": q})
    ql = q.lower()
    rx = _re_escape(q)  # Use existing helper function for consistent escaping

    services = await db.services.find({"active": True}, {"_id": 0}).to_list(500)
    styles = await db.styles.find({"active": True}, {"_id": 0}).to_list(500)
    categories = await db.categories.find({"active": True}, {"_id": 0}).to_list(200)

    # Fuzzy match services, styles, categories with scores
    def score_items(items, key="name"):
        scored = []
        for item in items:
            match, score = fuzzy_match(ql, item.get(key, ""))
            if match:
                scored.append((item, score))
        return sorted(scored, key=lambda x: -x[1])

    scored_services = score_items(services)
    scored_styles = score_items(styles)
    scored_categories = score_items(categories)

    # Build suggestions from top fuzzy matches
    suggestions = (
        [s[0]["name"] for s in scored_services[:5]] +
        [s[0]["name"] for s in scored_styles[:5]] +
        [c[0]["name"] for c in scored_categories[:3]]
    )

    # Category IDs for post filtering (only high-confidence fuzzy matches)
    cat_ids = [c[0]["id"] for c in scored_categories if c[1] >= 0.7]

    # Author IDs whose username/display name matches
    matched_users = await db.users.find(
        {"$or": [{"username": {"$regex": rx, "$options": "i"}}, {"display_name": {"$regex": rx, "$options": "i"}}]},
        {"_id": 0, "id": 1}).to_list(50)
    author_ids = [u["id"] for u in matched_users]

    or_clauses = [
        {"caption": {"$regex": rx, "$options": "i"}},
        {"service_name": {"$regex": rx, "$options": "i"}},
        {"style_name": {"$regex": rx, "$options": "i"}},
        {"style_names": {"$regex": rx, "$options": "i"}},
        {"custom_category": {"$regex": rx, "$options": "i"}},
    ]
    if cat_ids:
        or_clauses.append({"category_id": {"$in": cat_ids}})
    if author_ids:
        or_clauses.append({"author_id": {"$in": author_ids}})

    # Fetch more candidates for relevance scoring
    posts = await db.posts.find({"$or": or_clauses}, {"_id": 0}).sort("created_at", -1).to_list(100)

    # Score and sort posts by relevance
    def score_search_post(post):
        score = 0.0
        service = (post.get("service_name") or "").lower()
        style = (post.get("style_name") or "").lower()
        styles = " ".join(post.get("style_names") or []).lower()
        caption = (post.get("caption") or "").lower()

        # Direct matches in key fields score highest
        if ql in service:
            score += 3.0
        elif fuzzy_match(ql, service, 0.7)[0]:
            score += 2.0

        if ql in style or ql in styles:
            score += 2.5
        elif fuzzy_match(ql, style, 0.7)[0] or fuzzy_match(ql, styles, 0.7)[0]:
            score += 1.5

        if ql in caption:
            score += 1.0

        # Engagement boost
        engagement = post.get("like_count", 0) + post.get("save_count", 0) * 2
        if engagement > 0:
            score += min(0.5, math.log10(engagement + 1) * 0.2)

        return score

    scored_posts = [(p, score_search_post(p)) for p in posts]
    scored_posts.sort(key=lambda x: -x[1])
    posts = [p[0] for p in scored_posts[:40]]

    pros = await search_professionals(q=q, viewer=viewer)
    matched_services = [s[0] for s in scored_services[:10]]

    return {
        "suggestions": list(dict.fromkeys(suggestions))[:8],
        "posts": await enrich_posts(posts, viewer),
        "professionals": pros[:10],
        "services": matched_services,
    }


# ------------------------- Notifications -------------------------
@api.get("/notifications")
async def get_notifications(viewer: dict = Depends(get_current_user)):
    notifs = await db.notifications.find({"user_id": viewer["id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    if not notifs:
        return []
    # Batch load actors to avoid N+1 queries
    actor_ids = list({n["actor_id"] for n in notifs if n.get("actor_id")})
    actors = {}
    if actor_ids:
        actors = {u["id"]: u for u in await db.users.find({"id": {"$in": actor_ids}}, {"_id": 0}).to_list(len(actor_ids))}
    for n in notifs:
        actor = actors.get(n.get("actor_id")) if n.get("actor_id") else None
        n["actor"] = public_user(actor) if actor else None
    return notifs


@api.get("/notifications/unread-count")
async def unread_count(viewer: dict = Depends(get_current_user)):
    return {"count": await db.notifications.count_documents({"user_id": viewer["id"], "read": False})}


@api.post("/notifications/read")
async def mark_read(viewer: dict = Depends(get_current_user)):
    await db.notifications.update_many({"user_id": viewer["id"]}, {"$set": {"read": True}})
    return {"ok": True}


# ------------------------- Reports -------------------------
@api.post("/reports")
async def create_report(body: ReportIn, viewer: dict = Depends(get_current_user)):
    report = {"id": new_id(), "reporter_id": viewer["id"], "target_type": body.target_type,
              "target_id": body.target_id, "reason": body.reason, "details": body.details,
              "status": "open", "created_at": now_iso()}
    await db.reports.insert_one(report)
    report.pop("_id", None)
    return report


# ------------------------- Analytics events -------------------------
@api.post("/analytics/booking-click")
async def booking_click(professional_id: str, viewer: Optional[dict] = Depends(get_optional_user)):
    await log_event("BOOKING_CLICK", viewer["id"] if viewer else None, professional_id)
    return {"ok": True}


# ------------------------- Media Upload -------------------------
@api.post("/upload")
async def upload(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    ext = (file.filename or "file").split(".")[-1].lower()
    content_type = file.content_type or "application/octet-stream"

    # Read file content
    try:
        data = await file.read()
        if len(data) > MAX_UPLOAD_SIZE:
            raise HTTPException(413, f"File too large. Maximum size: {MAX_UPLOAD_SIZE // (1024*1024)}MB")
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error reading upload: {e}")
        raise HTTPException(400, "Error reading file")
    path = f"{APP_NAME}/uploads/{user['id']}/{new_id()}.{ext}"

    try:
        await run_in_threadpool(put_object, path, data, content_type)
    except requests.exceptions.RequestException as e:
        logger.error(f"Storage upload failed: {e}")
        raise HTTPException(502, "Upload to storage failed")
    except Exception as e:
        logger.exception(f"Unexpected upload error: {e}")
        raise HTTPException(502, "Upload failed")

    await db.media.insert_one({"id": new_id(), "owner_id": user["id"], "storage_path": path,
                               "content_type": content_type, "created_at": now_iso()})
    mtype = "video" if content_type.startswith("video") else "image"
    return {"url": f"/api/files/{path}", "type": mtype}


@api.get("/files/{path:path}")
async def get_file(path: str):
    """Serve files from S3-compatible storage."""
    try:
        content, content_type = await run_in_threadpool(get_object, path)
    except HTTPException:
        raise
    except ClientError as e:
        error_code = e.response.get('Error', {}).get('Code', '')
        if error_code == 'NoSuchKey':
            raise HTTPException(404, "File not found")
        logger.error(f"S3 error fetching {path}: {e}")
        raise HTTPException(502, "Storage error")
    except Exception as e:
        logger.exception(f"Unexpected error fetching file {path}: {e}")
        raise HTTPException(500, "Internal error")

    headers = {
        "Cache-Control": "public, max-age=31536000",
        "Content-Length": str(len(content))
    }
    return Response(content=content, media_type=content_type, headers=headers)


# ------------------------- Messaging -------------------------

class ConnectionManager:
    """Manages WebSocket connections for real-time messaging."""
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}  # user_id -> [connections]

    async def connect(self, websocket: WebSocket, user_id: str):
        await websocket.accept()
        if user_id not in self.active_connections:
            self.active_connections[user_id] = []
        self.active_connections[user_id].append(websocket)

    def disconnect(self, websocket: WebSocket, user_id: str):
        if user_id in self.active_connections:
            self.active_connections[user_id] = [
                ws for ws in self.active_connections[user_id] if ws != websocket
            ]
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]

    async def send_to_user(self, user_id: str, message: dict):
        if user_id in self.active_connections:
            for connection in self.active_connections[user_id]:
                try:
                    await connection.send_json(message)
                except:
                    pass

ws_manager = ConnectionManager()


async def send_push_notification(push_token: str, title: str, body: str, data: dict = None):
    """Send push notification via Expo Push API."""
    if not push_token or not push_token.startswith("ExponentPushToken"):
        return
    message = {
        "to": push_token,
        "sound": "default",
        "title": title,
        "body": body,
        "data": data or {}
    }
    try:
        async with httpx.AsyncClient() as client:
            await client.post(
                "https://exp.host/--/api/v2/push/send",
                json=message,
                headers={"Content-Type": "application/json"}
            )
    except Exception as e:
        logger.error(f"Push notification failed: {e}")


class SendMessageBody(BaseModel):
    text: str = Field(..., min_length=1, max_length=2000)
    post_id: Optional[str] = None  # Optional post reference


class StartConversationBody(BaseModel):
    professional_id: str
    text: str = Field(..., min_length=1, max_length=2000)
    post_id: Optional[str] = None


@api.get("/conversations")
async def list_conversations(user: dict = Depends(get_current_user)):
    """List all conversations for the current user."""
    convos = await db.conversations.find(
        {"participants": user["id"]}, {"_id": 0}
    ).sort("last_message_at", -1).to_list(100)

    # Enrich with participant info and last message
    for c in convos:
        other_id = [p for p in c["participants"] if p != user["id"]][0]
        other_user = await db.users.find_one({"id": other_id}, {"_id": 0, "password_hash": 0})
        c["other_user"] = other_user

        # Get professional info if this is a pro conversation
        if c.get("professional_id"):
            pro = await db.professional_profiles.find_one({"id": c["professional_id"]}, {"_id": 0})
            c["professional"] = pro

        # Get last message
        last_msgs = await db.messages.find(
            {"conversation_id": c["id"]}, {"_id": 0}
        ).sort("created_at", -1).limit(1).to_list(1)
        c["last_message"] = last_msgs[0] if last_msgs else None

        # Unread count
        c["unread_count"] = await db.messages.count_documents({
            "conversation_id": c["id"],
            "sender_id": {"$ne": user["id"]},
            "read": False
        })

    return convos


@api.post("/conversations")
async def start_conversation(body: StartConversationBody, user: dict = Depends(get_current_user)):
    """Start a new conversation with a professional."""
    # Get the professional
    pro = await db.professional_profiles.find_one({"id": body.professional_id}, {"_id": 0})
    if not pro:
        raise HTTPException(404, "Professional not found")

    pro_user_id = pro["user_id"]

    # Check if conversation already exists
    existing = await db.conversations.find_one({
        "participants": {"$all": [user["id"], pro_user_id]},
        "professional_id": body.professional_id
    })

    if existing:
        # Add message to existing conversation
        conv_id = existing["id"]
    else:
        # Create new conversation
        conv_id = new_id()
        await db.conversations.insert_one({
            "id": conv_id,
            "participants": [user["id"], pro_user_id],
            "professional_id": body.professional_id,
            "created_at": now_iso(),
            "last_message_at": now_iso()
        })

    # Create the message
    msg_id = new_id()
    msg = {
        "id": msg_id,
        "conversation_id": conv_id,
        "sender_id": user["id"],
        "text": body.text,
        "post_id": body.post_id,
        "read": False,
        "created_at": now_iso()
    }
    await db.messages.insert_one(msg)
    msg.pop("_id", None)  # Remove MongoDB ObjectId before returning

    # Update conversation last_message_at
    await db.conversations.update_one(
        {"id": conv_id},
        {"$set": {"last_message_at": now_iso()}}
    )

    # Enrich message with post info if tagged
    if body.post_id:
        post = await db.posts.find_one({"id": body.post_id}, {"_id": 0})
        msg["post"] = post

    # Add sender info
    msg["sender"] = {
        "id": user["id"],
        "username": user.get("username"),
        "display_name": user.get("display_name"),
        "avatar_url": user.get("avatar_url")
    }

    # Send real-time update to recipient
    await ws_manager.send_to_user(pro_user_id, {
        "type": "new_message",
        "conversation_id": conv_id,
        "message": msg
    })

    # Send push notification
    pro_user = await db.users.find_one({"id": pro_user_id}, {"_id": 0})
    if pro_user and pro_user.get("push_token"):
        sender_name = user.get("display_name") or user.get("username") or "Someone"
        await send_push_notification(
            pro_user["push_token"],
            f"Message from {sender_name}",
            body.text[:100],
            {"conversation_id": conv_id}
        )

    return {"conversation_id": conv_id, "message": msg}


@api.get("/conversations/{conv_id}/messages")
async def get_messages(conv_id: str, limit: int = 50, before: Optional[str] = None, user: dict = Depends(get_current_user)):
    """Get messages in a conversation."""
    # Verify user is participant
    convo = await db.conversations.find_one({"id": conv_id}, {"_id": 0})
    if not convo or user["id"] not in convo["participants"]:
        raise HTTPException(404, "Conversation not found")

    query = {"conversation_id": conv_id}
    if before:
        query["created_at"] = {"$lt": before}

    messages = await db.messages.find(query, {"_id": 0}).sort("created_at", -1).to_list(limit)

    # Enrich with sender info and post info
    sender_ids = list(set(m["sender_id"] for m in messages))
    senders = {u["id"]: u for u in await db.users.find(
        {"id": {"$in": sender_ids}}, {"_id": 0, "password_hash": 0}
    ).to_list(len(sender_ids))}

    post_ids = [m["post_id"] for m in messages if m.get("post_id")]
    posts = {}
    if post_ids:
        posts = {p["id"]: p for p in await db.posts.find(
            {"id": {"$in": post_ids}}, {"_id": 0}
        ).to_list(len(post_ids))}

    for m in messages:
        m["sender"] = senders.get(m["sender_id"])
        if m.get("post_id"):
            m["post"] = posts.get(m["post_id"])

    # Mark messages as read
    await db.messages.update_many(
        {"conversation_id": conv_id, "sender_id": {"$ne": user["id"]}, "read": False},
        {"$set": {"read": True}}
    )

    return messages[::-1]  # Return in chronological order


@api.post("/conversations/{conv_id}/messages")
async def send_message(conv_id: str, body: SendMessageBody, user: dict = Depends(get_current_user)):
    """Send a message in an existing conversation."""
    # Verify user is participant
    convo = await db.conversations.find_one({"id": conv_id}, {"_id": 0})
    if not convo or user["id"] not in convo["participants"]:
        raise HTTPException(404, "Conversation not found")

    # Get recipient
    recipient_id = [p for p in convo["participants"] if p != user["id"]][0]

    # Create message
    msg_id = new_id()
    msg = {
        "id": msg_id,
        "conversation_id": conv_id,
        "sender_id": user["id"],
        "text": body.text,
        "post_id": body.post_id,
        "read": False,
        "created_at": now_iso()
    }
    await db.messages.insert_one(msg)
    msg.pop("_id", None)  # Remove MongoDB ObjectId before returning

    # Update conversation
    await db.conversations.update_one(
        {"id": conv_id},
        {"$set": {"last_message_at": now_iso()}}
    )

    # Enrich message
    msg["sender"] = {
        "id": user["id"],
        "username": user.get("username"),
        "display_name": user.get("display_name"),
        "avatar_url": user.get("avatar_url")
    }
    if body.post_id:
        post = await db.posts.find_one({"id": body.post_id}, {"_id": 0})
        msg["post"] = post

    # Send real-time update
    await ws_manager.send_to_user(recipient_id, {
        "type": "new_message",
        "conversation_id": conv_id,
        "message": msg
    })

    # Send push notification
    recipient = await db.users.find_one({"id": recipient_id}, {"_id": 0})
    if recipient and recipient.get("push_token"):
        sender_name = user.get("display_name") or user.get("username") or "Someone"
        await send_push_notification(
            recipient["push_token"],
            f"Message from {sender_name}",
            body.text[:100],
            {"conversation_id": conv_id}
        )

    return msg


@api.get("/conversations/unread-count")
async def unread_count(user: dict = Depends(get_current_user)):
    """Get total unread message count."""
    # Get all user's conversations
    convos = await db.conversations.find(
        {"participants": user["id"]}, {"id": 1}
    ).to_list(100)
    conv_ids = [c["id"] for c in convos]

    count = await db.messages.count_documents({
        "conversation_id": {"$in": conv_ids},
        "sender_id": {"$ne": user["id"]},
        "read": False
    })
    return {"count": count}


@api.put("/users/me/push-token")
async def update_push_token(body: dict, user: dict = Depends(get_current_user)):
    """Update user's Expo push token."""
    token = body.get("push_token")
    if token and not token.startswith("ExponentPushToken"):
        raise HTTPException(400, "Invalid push token format")
    await db.users.update_one({"id": user["id"]}, {"$set": {"push_token": token}})
    return {"ok": True}


@app.websocket("/ws/{token}")
async def websocket_endpoint(websocket: WebSocket, token: str):
    """WebSocket endpoint for real-time messaging."""
    # Authenticate via token
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("sub")
        if not user_id:
            await websocket.close(code=4001)
            return
    except jwt.PyJWTError:
        await websocket.close(code=4001)
        return

    await ws_manager.connect(websocket, user_id)
    try:
        while True:
            # Keep connection alive, handle pings
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket, user_id)


# ------------------------- Admin -------------------------
@api.get("/admin/stats")
async def admin_stats(admin: dict = Depends(require_admin)):
    return {
        "users": await db.users.count_documents({}),
        "professionals": await db.professional_profiles.count_documents({}),
        "posts": await db.posts.count_documents({}),
        "reports": await db.reports.count_documents({"status": "open"}),
        "pending_verifications": await db.professional_profiles.count_documents({"verification_status": "PENDING"}),
    }


@api.get("/admin/reports")
async def admin_reports(admin: dict = Depends(require_admin)):
    return await db.reports.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)


@api.post("/admin/reports/{rid}/resolve")
async def resolve_report(rid: str, action: str, admin: dict = Depends(require_admin)):
    await db.reports.update_one({"id": rid}, {"$set": {"status": "resolved", "action": action}})
    return {"ok": True}


@api.get("/admin/verifications")
async def admin_verifications(admin: dict = Depends(require_admin)):
    pros = await db.professional_profiles.find({"verification_status": {"$in": ["PENDING", "NOT_VERIFIED"]}}, {"_id": 0}).to_list(200)
    return pros


@api.post("/admin/professional/{pro_id}/verify")
async def verify_pro(pro_id: str, status: str, admin: dict = Depends(require_admin)):
    if status not in ["VERIFIED", "REJECTED", "PENDING", "NOT_VERIFIED"]:
        raise HTTPException(400, "Invalid status")
    await db.professional_profiles.update_one({"id": pro_id}, {"$set": {"verification_status": status}})
    return {"ok": True}


@api.get("/admin/users")
async def admin_users(admin: dict = Depends(require_admin)):
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).sort("created_at", -1).to_list(500)
    return users


@api.post("/admin/users/{uid}/suspend")
async def suspend_user(uid: str, disabled: bool = True, admin: dict = Depends(require_admin)):
    await db.users.update_one({"id": uid}, {"$set": {"disabled": disabled}})
    return {"ok": True}


@api.delete("/admin/posts/{pid}")
async def admin_delete_post(pid: str, admin: dict = Depends(require_admin)):
    await db.posts.delete_one({"id": pid})
    return {"ok": True}


@api.post("/admin/categories")
async def admin_create_category(body: CatalogIn, admin: dict = Depends(require_admin)):
    cat = {"id": new_id(), "name": body.name, "slug": body.name.lower().replace(" ", "-"),
           "icon": body.icon or "star-four-points", "active": True,
           "order": await db.categories.count_documents({})}
    await db.categories.insert_one(cat)
    cat.pop("_id", None)
    return cat


@api.post("/admin/services")
async def admin_create_service(body: CatalogIn, admin: dict = Depends(require_admin)):
    svc = {"id": new_id(), "name": body.name, "category_id": body.category_id, "active": True}
    await db.services.insert_one(svc)
    svc.pop("_id", None)
    return svc


@api.post("/admin/styles")
async def admin_create_style(body: CatalogIn, admin: dict = Depends(require_admin)):
    st = {"id": new_id(), "name": body.name, "active": True}
    await db.styles.insert_one(st)
    st.pop("_id", None)
    return st


@api.put("/admin/categories/{cid}")
async def admin_update_category(cid: str, active: bool, admin: dict = Depends(require_admin)):
    await db.categories.update_one({"id": cid}, {"$set": {"active": active}})
    return {"ok": True}


@api.get("/")
async def root():
    return {"message": "brook.ie API", "status": "ok"}


app.include_router(api)
app.add_middleware(CORSMiddleware, allow_credentials=True, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.on_event("startup")
async def startup():
    await db.users.create_index("username")
    await db.posts.create_index([("created_at", -1)])
    await db.posts.create_index("author_id")
    # Indexes for personalized feed preference aggregation
    await db.saves.create_index("user_id")
    await db.likes.create_index("user_id")
    try:
        await run_in_threadpool(init_storage)
        logger.info("storage initialized")
    except Exception as e:
        logger.warning(f"storage init failed: {e}")


@app.on_event("shutdown")
async def shutdown():
    client.close()
