from fastapi import FastAPI, APIRouter, HTTPException, Depends, UploadFile, File, Query
from fastapi.responses import Response, StreamingResponse
from fastapi.concurrency import run_in_threadpool
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import uuid
import math
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
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGORITHM = os.environ.get('JWT_ALGORITHM', 'HS256')
ACCESS_TOKEN_MINUTES = int(os.environ.get('ACCESS_TOKEN_MINUTES', '43200'))

# ------------------------- Object Storage -------------------------
STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")
APP_NAME = "brookie"
_storage_key = None


def init_storage():
    global _storage_key
    if _storage_key:
        return _storage_key
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
    resp.raise_for_status()
    _storage_key = resp.json()["storage_key"]
    return _storage_key


def put_object(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    resp = requests.put(f"{STORAGE_URL}/objects/{path}",
                        headers={"X-Storage-Key": key, "Content-Type": content_type}, data=data, timeout=120)
    resp.raise_for_status()
    return resp.json()


def get_object(path: str):
    global _storage_key
    key = init_storage()
    resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    if resp.status_code == 503:
        _storage_key = None
        key = init_storage()
        resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")


app = FastAPI()
api = APIRouter(prefix="/api")
bearer = HTTPBearer(auto_error=False)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("brookie")


# ------------------------- Helpers -------------------------
def now_iso():
    return datetime.now(timezone.utc).isoformat()


def new_id():
    return str(uuid.uuid4())


def hash_pw(pw: str) -> str:
    return bcrypt.hashpw(pw.encode("utf-8")[:72], bcrypt.gensalt(rounds=12)).decode("utf-8")


def verify_pw(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode("utf-8")[:72], hashed.encode("utf-8"))
    except Exception:
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
    except HTTPException:
        return None


def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user["role"] != "admin":
        raise HTTPException(403, "Admin only")
    return user


def public_user(u: dict) -> dict:
    return {"id": u["id"], "username": u.get("username"), "display_name": u.get("display_name"),
            "avatar_url": u.get("avatar_url"), "bio": u.get("bio"), "city": u.get("city"),
            "state": u.get("state"), "role": u.get("role"), "is_professional": u.get("is_professional", False),
            "interests": u.get("interests", [])}


def haversine(lat1, lon1, lat2, lon2):
    if None in (lat1, lon1, lat2, lon2):
        return None
    R = 3958.8
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


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
async def register(body: RegisterIn):
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
            "disabled": False, "created_at": now_iso()}
    await db.users.insert_one(user)
    return {"access_token": make_token(user), "user": public_user(user)}


@api.post("/auth/login")
async def login(body: LoginIn):
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
    data["followers"] = await db.follows.count_documents({"following_id": u["id"]})
    data["following"] = await db.follows.count_documents({"follower_id": u["id"]})
    data["post_count"] = await db.posts.count_documents({"author_id": u["id"]})
    data["is_following"] = False
    if viewer:
        data["is_following"] = bool(await db.follows.find_one({"follower_id": viewer["id"], "following_id": u["id"]}))
    return data


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
async def get_styles():
    return await db.styles.find({"active": True}, {"_id": 0}).sort("name", 1).to_list(500)


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
            "category_id": body.category_id, "service_id": body.service_id, "service_name": body.service_name,
            "style_id": body.style_id, "style_name": body.style_name, "attributes": body.attributes,
            "city": body.city, "state": body.state, "lat": body.lat, "lng": body.lng,
            "tagged_professional_id": body.tagged_professional_id, "tag_status": tag_status,
            "professional_details": None, "professional_details_by": None,
            "like_count": 0, "comment_count": 0, "save_count": 0, "view_count": 0,
            "created_at": now_iso()}
    await db.posts.insert_one(post)
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
               limit: int = 40, viewer: Optional[dict] = Depends(get_optional_user)):
    q: Dict[str, Any] = {}
    if category_id:
        q["category_id"] = category_id
    if feed_type == "following" and viewer:
        following = await db.follows.find({"follower_id": viewer["id"]}, {"_id": 0, "following_id": 1}).to_list(1000)
        ids = [f["following_id"] for f in following]
        q["author_id"] = {"$in": ids if ids else ["__none__"]}
    posts = await db.posts.find(q, {"_id": 0}).sort("created_at", -1).to_list(limit)
    if feed_type == "nearby" and viewer and viewer.get("city"):
        posts.sort(key=lambda p: 0 if (p.get("city") == viewer.get("city")) else 1)
    return await enrich_posts(posts, viewer)


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
               "category_id": body.category_id, "service_id": body.service_id, "service_name": body.service_name,
               "style_id": body.style_id, "style_name": body.style_name, "attributes": body.attributes,
               "city": body.city, "state": body.state}
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
    out = []
    for c in comments:
        author = await db.users.find_one({"id": c["author_id"]}, {"_id": 0})
        c["author"] = public_user(author) if author else None
        out.append(c)
    return out


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
@api.post("/posts/{post_id}/save")
async def save_post(post_id: str, collection_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    post = await db.posts.find_one({"id": post_id})
    if not post:
        raise HTTPException(404, "Post not found")
    existing = await db.saves.find_one({"post_id": post_id, "user_id": user["id"]})
    if not existing:
        await db.saves.insert_one({"id": new_id(), "post_id": post_id, "user_id": user["id"],
                                   "collection_id": collection_id, "created_at": now_iso()})
        await db.posts.update_one({"id": post_id}, {"$inc": {"save_count": 1}})
        await log_event("SAVE", user["id"], None, post_id)
        await notify(post["author_id"], "save", user["id"], f"{user['display_name']} saved your post", post_id)
    elif collection_id:
        await db.saves.update_one({"id": existing["id"]}, {"$set": {"collection_id": collection_id}})
    if collection_id:
        cover = post["media"][0]["url"] if post.get("media") else None
        cnt = await db.saves.count_documents({"collection_id": collection_id})
        await db.collections.update_one({"id": collection_id}, {"$set": {"post_count": cnt, "cover_url": cover}})
    return {"saved": True}


@api.delete("/posts/{post_id}/save")
async def unsave_post(post_id: str, user: dict = Depends(get_current_user)):
    save = await db.saves.find_one({"post_id": post_id, "user_id": user["id"]})
    if save:
        await db.saves.delete_one({"id": save["id"]})
        await db.posts.update_one({"id": post_id}, {"$inc": {"save_count": -1}})
        if save.get("collection_id"):
            cnt = await db.saves.count_documents({"collection_id": save["collection_id"]})
            await db.collections.update_one({"id": save["collection_id"]}, {"$set": {"post_count": cnt}})
    return {"saved": False}


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
    cols = await db.collections.find({"user_id": viewer["id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return cols


@api.post("/collections")
async def create_collection(body: CollectionIn, viewer: dict = Depends(get_current_user)):
    col = {"id": new_id(), "user_id": viewer["id"], "name": body.name, "cover_url": body.cover_url,
           "post_count": 0, "created_at": now_iso()}
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
    await db.saves.update_many({"collection_id": cid}, {"$set": {"collection_id": None}})
    return {"ok": True}


@api.get("/collections/{cid}/posts")
async def collection_posts(cid: str, viewer: dict = Depends(get_current_user)):
    saves = await db.saves.find({"collection_id": cid}, {"_id": 0}).sort("created_at", -1).to_list(500)
    ids = [s["post_id"] for s in saves]
    posts = await db.posts.find({"id": {"$in": ids}}, {"_id": 0}).to_list(500)
    return await enrich_posts(posts, viewer)


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
    await db.users.update_one({"id": user["id"]}, {"$set": {"is_professional": True, "professional_id": pro["id"]}})
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
    posts = await db.posts.find({"author_id": pro["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return await enrich_posts(posts, viewer)


@api.post("/professional/verification/request")
async def request_verification(user: dict = Depends(get_current_user)):
    if not user.get("professional_id"):
        raise HTTPException(404, "No professional profile")
    await db.professional_profiles.update_one({"id": user["professional_id"]}, {"$set": {"verification_status": "PENDING"}})
    return {"verification_status": "PENDING"}


@api.get("/professional/me/analytics")
async def pro_analytics(user: dict = Depends(get_current_user)):
    if not user.get("professional_id"):
        raise HTTPException(404, "No professional profile")
    pid = user["professional_id"]
    posts = await db.posts.find({"author_id": user["id"]}, {"_id": 0}).to_list(500)
    post_ids = [p["id"] for p in posts]
    return {
        "profile_views": await db.analytics_events.count_documents({"event_type": "PROFILE_VIEW", "professional_id": pid}),
        "post_views": sum(p.get("view_count", 0) for p in posts),
        "likes": sum(p.get("like_count", 0) for p in posts),
        "saves": sum(p.get("save_count", 0) for p in posts),
        "followers": await db.follows.count_documents({"following_id": user["id"]}),
        "tag_confirmations": await db.posts.count_documents({"tagged_professional_id": pid, "tag_status": "confirmed"}),
        "booking_clicks": await db.analytics_events.count_documents({"event_type": "BOOKING_CLICK", "professional_id": pid}),
        "post_count": len(post_ids),
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
    pros = await db.professional_profiles.find({}, {"_id": 0}).to_list(1000)
    vlat = viewer.get("lat") if viewer else None
    vlng = viewer.get("lng") if viewer else None
    base_lat = vlat if vlat is not None else plat
    base_lng = vlng if vlng is not None else plng
    results = []
    for pro in pros:
        svc_names = [(s.get("name") or "").lower() for s in pro.get("services", [])]
        score = 0.0
        reasons = {}
        if service_name and service_name.lower() in svc_names:
            score += 35
            reasons["service_match"] = True
        elif service_name and any(service_name.lower() in n or n in service_name.lower() for n in svc_names):
            score += 18
            reasons["service_match"] = "partial"
        if style_name and (style_name.lower() in (pro.get("bio") or "").lower() or any(style_name.lower() in n for n in svc_names)):
            score += 20
            reasons["style_match"] = True
        if category_id and category_id in pro.get("category_ids", []):
            score += 10
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
        pc = await db.posts.count_documents({"author_id": pro["user_id"]})
        score += min(10, pc * 2)
        agg = await db.posts.aggregate([{"$match": {"author_id": pro["user_id"]}},
                                        {"$group": {"_id": None, "likes": {"$sum": "$like_count"}, "saves": {"$sum": "$save_count"}}}]).to_list(1)
        eng = (agg[0]["likes"] + agg[0]["saves"]) if agg else 0
        score += min(10, eng / 5)
        comp = sum(1 for f in [pro.get("bio"), pro.get("avatar_url"), pro.get("cover_url"), pro.get("booking_url"), pro.get("services")] if f)
        score += (comp / 5) * 5
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
    query: Dict[str, Any] = {}
    if category_id:
        query["category_ids"] = category_id
    if city:
        query["city"] = {"$regex": city, "$options": "i"}
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
    await log_event("SEARCH", viewer["id"] if viewer else None, metadata={"q": q})
    ql = q.lower().strip()
    import re as _re
    rx = _re.escape(q.strip())
    services = await db.services.find({"active": True}, {"_id": 0}).to_list(500)
    styles = await db.styles.find({"active": True}, {"_id": 0}).to_list(500)
    categories = await db.categories.find({"active": True}, {"_id": 0}).to_list(200)
    suggestions = [s["name"] for s in services if ql in s["name"].lower()][:5] + \
                  [s["name"] for s in styles if ql in s["name"].lower()][:5] + \
                  [c["name"] for c in categories if ql in c["name"].lower()][:3]
    # category ids whose name matches the query
    cat_ids = [c["id"] for c in categories if ql in c["name"].lower()]
    # author ids whose username/display name matches
    matched_users = await db.users.find(
        {"$or": [{"username": {"$regex": rx, "$options": "i"}}, {"display_name": {"$regex": rx, "$options": "i"}}]},
        {"_id": 0, "id": 1}).to_list(50)
    author_ids = [u["id"] for u in matched_users]
    or_clauses = [
        {"caption": {"$regex": rx, "$options": "i"}},
        {"service_name": {"$regex": rx, "$options": "i"}},
        {"style_name": {"$regex": rx, "$options": "i"}},
    ]
    if cat_ids:
        or_clauses.append({"category_id": {"$in": cat_ids}})
    if author_ids:
        or_clauses.append({"author_id": {"$in": author_ids}})
    posts = await db.posts.find({"$or": or_clauses}, {"_id": 0}).sort("created_at", -1).to_list(40)
    pros = await search_professionals(q=q, viewer=viewer)
    matched_services = [s for s in services if ql in s["name"].lower()][:10]
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
    out = []
    for n in notifs:
        actor = await db.users.find_one({"id": n.get("actor_id")}, {"_id": 0}) if n.get("actor_id") else None
        n["actor"] = public_user(actor) if actor else None
        out.append(n)
    return out


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
    data = await file.read()
    path = f"{APP_NAME}/uploads/{user['id']}/{new_id()}.{ext}"
    content_type = file.content_type or "application/octet-stream"
    try:
        await run_in_threadpool(put_object, path, data, content_type)
    except Exception as e:
        logger.error(f"upload failed: {e}")
        raise HTTPException(502, "Upload failed")
    await db.media.insert_one({"id": new_id(), "owner_id": user["id"], "storage_path": path,
                               "content_type": content_type, "created_at": now_iso()})
    mtype = "video" if content_type.startswith("video") else "image"
    return {"url": f"/api/files/{path}", "type": mtype}


@api.get("/files/{path:path}")
async def get_file(path: str):
    def _open():
        global _storage_key
        key = init_storage()
        r = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, stream=True, timeout=60)
        if r.status_code == 503:
            _storage_key = None
            key = init_storage()
            r = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, stream=True, timeout=60)
        r.raise_for_status()
        return r
    try:
        resp = await run_in_threadpool(_open)
    except Exception:
        raise HTTPException(404, "File not found")
    ctype = resp.headers.get("Content-Type", "application/octet-stream")

    def stream():
        try:
            for chunk in resp.iter_content(64 * 1024):
                if chunk:
                    yield chunk
        finally:
            resp.close()

    headers = {"Cache-Control": "public, max-age=31536000"}
    if resp.headers.get("Content-Length"):
        headers["Content-Length"] = resp.headers["Content-Length"]
    return StreamingResponse(stream(), media_type=ctype, headers=headers)


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
    try:
        await run_in_threadpool(init_storage)
        logger.info("storage initialized")
    except Exception as e:
        logger.warning(f"storage init failed: {e}")


@app.on_event("shutdown")
async def shutdown():
    client.close()
