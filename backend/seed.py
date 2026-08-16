import asyncio
import os
import uuid
import logging
from datetime import datetime, timezone, timedelta
from pathlib import Path
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
import bcrypt

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("seed")

ROOT = Path(__file__).parent
load_dotenv(ROOT / ".env")
client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]

# Get test account password from environment (required for seeding test accounts)
# This prevents hardcoded credentials in version control
SEED_TEST_PASSWORD = os.environ.get("SEED_TEST_PASSWORD")
if not SEED_TEST_PASSWORD:
    logger.warning("SEED_TEST_PASSWORD not set. Test accounts will not be created.")
    logger.warning("Set SEED_TEST_PASSWORD environment variable to create test accounts.")


def nid():
    return str(uuid.uuid4())


def h(pw):
    return bcrypt.hashpw(pw.encode()[:72], bcrypt.gensalt(rounds=12)).decode()


def iso(days_ago=0, hours=0):
    return (datetime.now(timezone.utc) - timedelta(days=days_ago, hours=hours)).isoformat()


CATEGORIES = [
    ("Hair", "hair", "content-cut"),
    ("Nails", "nails", "hand-back-left"),
    ("Lashes", "lashes", "eye"),
    ("Brows", "brows", "eye-outline"),
    ("Makeup", "makeup", "lipstick"),
    ("Skincare", "skincare", "face-woman-shimmer"),
    ("Waxing", "waxing", "spa"),
    ("Other", "other", "star-four-points"),
]

SERVICES = {
    "Hair": ["Knotless Braids", "Boho Knotless", "Box Braids", "Fulani Braids", "Loc Retwist",
             "Silk Press", "Sew-In", "Wig Install", "Natural Hair Styling"],
    "Nails": ["Gel-X", "Acrylic", "Gel Manicure", "Builder Gel", "Nail Art", "French Tip", "Chrome"],
    "Lashes": ["Classic", "Hybrid", "Volume", "Mega Volume", "Wet Set"],
    "Makeup": ["Natural", "Soft Glam", "Full Glam", "Bridal"],
    "Brows": ["Brow Lamination", "Microblading", "Brow Tint", "Threading"],
    "Skincare": ["Facial", "Chemical Peel", "Dermaplaning"],
    "Waxing": ["Brazilian", "Full Body", "Brow Wax"],
}

STYLES = ["Boho", "Chrome French Tip", "Wispy Cat Eye", "Soft Glam", "Natural", "Bold",
          "Minimal", "Editorial", "Bridal", "Vacation", "Ombre", "Jumbo"]

IMG = {
    "hair1": "https://images.unsplash.com/photo-1522337094846-8a818192de1f?w=800&q=80",
    "hair2": "https://images.unsplash.com/photo-1519699047748-de8e457a634e?w=800&q=80",
    "makeup1": "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=800&q=80",
    "makeup2": "https://images.unsplash.com/photo-1512496015851-a90fb38ba796?w=800&q=80",
    "nails1": "https://images.unsplash.com/photo-1604654894610-df63bc536371?w=800&q=80",
    "nails2": "https://images.unsplash.com/photo-1632345031435-8727f6897d53?w=800&q=80",
    "lashes1": "https://images.unsplash.com/photo-1596704017254-9b121068fb31?w=800&q=80",
    "skin1": "https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=800&q=80",
    "avatar1": "https://images.unsplash.com/photo-1593636677199-11450abb6e7b?w=400&q=80",
    "avatar2": "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=400&q=80",
    "avatar3": "https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?w=400&q=80",
    "avatar4": "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=400&q=80",
    "cover1": "https://images.unsplash.com/photo-1560066984-138dadb4c035?w=1000&q=80",
    "cover2": "https://images.unsplash.com/photo-1633681926022-84c23e8cb2d6?w=1000&q=80",
}


async def run():
    # wipe
    for c in ["users", "professional_profiles", "categories", "services", "styles", "posts",
              "comments", "likes", "follows", "saves", "collections", "notifications",
              "reports", "analytics_events", "media"]:
        await db[c].delete_many({})

    # categories
    cat_ids = {}
    for i, (name, slug, icon) in enumerate(CATEGORIES):
        cid = nid()
        cat_ids[name] = cid
        await db.categories.insert_one({"id": cid, "name": name, "slug": slug, "icon": icon, "active": True, "order": i})

    # services
    svc_ids = {}
    for cat, names in SERVICES.items():
        for n in names:
            sid = nid()
            svc_ids[n] = sid
            await db.services.insert_one({"id": sid, "name": n, "category_id": cat_ids[cat], "active": True})

    # styles
    for s in STYLES:
        await db.styles.insert_one({"id": nid(), "name": s, "active": True})

    # admin
    await db.users.insert_one({"id": nid(), "email": os.environ["ADMIN_EMAIL"], "password_hash": h(os.environ["ADMIN_PASSWORD"]),
                               "role": "admin", "username": "admin", "display_name": "brook.ie Admin",
                               "bio": "", "city": "Dublin", "state": "IE", "avatar_url": None, "interests": [],
                               "lat": None, "lng": None, "is_professional": False, "professional_id": None,
                               "disabled": False, "created_at": iso(30)})

    # demo customer (only created if SEED_TEST_PASSWORD is set)
    cust_id = None
    if SEED_TEST_PASSWORD:
        cust_id = nid()
        await db.users.insert_one({"id": cust_id, "email": "maya@brook.ie", "password_hash": h(SEED_TEST_PASSWORD),
                                   "role": "customer", "username": "maya", "display_name": "Maya Rivera",
                                   "bio": "Beauty lover exploring new looks ✨", "city": "Cincinnati", "state": "OH",
                                   "avatar_url": IMG["avatar4"], "interests": ["Hair", "Nails", "Lashes"],
                                   "lat": 39.1031, "lng": -84.5120, "is_professional": False, "professional_id": None,
                                   "disabled": False, "created_at": iso(10)})
    else:
        logger.info("Skipping demo customer account (SEED_TEST_PASSWORD not set)")

    # professionals: (user fields, pro fields, services list, city coords)
    pros_data = [
        {
            "email": "kay@brook.ie", "username": "braidsbykay", "display": "Kay Johnson",
            "business": "Braids by Kay", "avatar": IMG["avatar1"], "cover": IMG["cover1"],
            "bio": "Boho + Knotless Specialist. Cincinnati based. Boho braids are my signature.",
            "cat": ["Hair"], "city": "Cincinnati", "state": "OH", "lat": 39.1015, "lng": -84.5125,
            "verified": "VERIFIED", "booking": "https://calendly.com/braidsbykay",
            "ig": "braidsbykay", "tiktok": "braidsbykay",
            "services": [("Boho Knotless", 220, "6 hrs"), ("Medium Knotless", 200, "5 hrs"),
                         ("Fulani Braids", 180, "4 hrs"), ("Knotless Braids", 190, "5 hrs")],
            "posts": [("hair1", "Boho Knotless", "Boho", {"Size": "Medium", "Length": "Waist", "Hair": "X-Pression", "Price": "$250", "Duration": "~6 hours"}),
                      ("hair2", "Fulani Braids", "Bold", {"Size": "Large", "Length": "Mid-back", "Price": "$180"})],
        },
        {
            "email": "jane@brook.ie", "username": "hairbyjane", "display": "Jane Doe",
            "business": "Hair by Jane", "avatar": IMG["avatar2"], "cover": IMG["cover2"],
            "bio": "Knotless & natural hair specialist serving Cincinnati.",
            "cat": ["Hair"], "city": "Cincinnati", "state": "OH", "lat": 39.1500, "lng": -84.4800,
            "verified": "NOT_VERIFIED", "booking": "https://styleseat.com/hairbyjane",
            "ig": "hairbyjane", "tiktok": None,
            "services": [("Knotless Braids", 200, "5 hrs"), ("Silk Press", 90, "2 hrs"),
                         ("Natural Hair Styling", 120, "3 hrs")],
            "posts": [("hair2", "Knotless Braids", "Natural", {"Length": "Waist", "Price": "$200"})],
        },
        {
            "email": "lash@brook.ie", "username": "lashedbylexi", "display": "Lexi Moore",
            "business": "Lashed by Lexi", "avatar": IMG["avatar3"], "cover": IMG["lashes1"],
            "bio": "Wispy cat eye & volume lash artist. Soft, fluffy, natural sets.",
            "cat": ["Lashes"], "city": "Cincinnati", "state": "OH", "lat": 39.1200, "lng": -84.5300,
            "verified": "VERIFIED", "booking": "https://vagaro.com/lashedbylexi",
            "ig": "lashedbylexi", "tiktok": "lashedbylexi",
            "services": [("Volume", 130, "2.5 hrs"), ("Hybrid", 110, "2 hrs"), ("Wet Set", 95, "1.5 hrs")],
            "posts": [("lashes1", "Volume", "Wispy Cat Eye", {"Style": "Wispy", "Price": "$130"})],
        },
        {
            "email": "nails@brook.ie", "username": "nailsbynova", "display": "Nova Chen",
            "business": "Nails by Nova", "avatar": IMG["avatar4"], "cover": IMG["nails1"],
            "bio": "Chrome & nail art specialist. Gel-X queen. Detailed sets only.",
            "cat": ["Nails"], "city": "Columbus", "state": "OH", "lat": 39.9612, "lng": -82.9988,
            "verified": "NOT_VERIFIED", "booking": "https://booksy.com/nailsbynova",
            "ig": "nailsbynova", "tiktok": None,
            "services": [("Gel-X", 75, "1.5 hrs"), ("Chrome", 85, "2 hrs"), ("Nail Art", 95, "2 hrs")],
            "posts": [("nails1", "Chrome", "Chrome French Tip", {"Shape": "Almond", "Price": "$85"}),
                      ("nails2", "Nail Art", "Editorial", {"Shape": "Coffin", "Price": "$95"})],
        },
    ]

    pro_ids = []
    pro_user_ids = []

    # Only create professional accounts if SEED_TEST_PASSWORD is set
    if not SEED_TEST_PASSWORD:
        logger.info("Skipping professional accounts (SEED_TEST_PASSWORD not set)")
        pros_data = []  # Skip all professionals

    for pd in pros_data:
        uid = nid()
        pid = nid()
        await db.users.insert_one({"id": uid, "email": pd["email"], "password_hash": h(SEED_TEST_PASSWORD),
                                   "role": "customer", "username": pd["username"], "display_name": pd["display"],
                                   "bio": pd["bio"], "city": pd["city"], "state": pd["state"],
                                   "avatar_url": pd["avatar"], "interests": pd["cat"],
                                   "lat": pd["lat"], "lng": pd["lng"], "is_professional": True,
                                   "professional_id": pid, "disabled": False, "created_at": iso(20)})
        services = [{"id": nid(), "name": n, "category_id": cat_ids[pd["cat"][0]], "description": "",
                     "price": price, "duration": dur} for (n, price, dur) in pd["services"]]
        await db.professional_profiles.insert_one({
            "id": pid, "user_id": uid, "business_name": pd["business"], "username": pd["username"],
            "bio": pd["bio"], "category_ids": [cat_ids[c] for c in pd["cat"]], "city": pd["city"],
            "state": pd["state"], "service_radius": 30, "booking_url": pd["booking"],
            "instagram": pd["ig"], "tiktok": pd["tiktok"], "website": None,
            "avatar_url": pd["avatar"], "cover_url": pd["cover"], "lat": pd["lat"], "lng": pd["lng"],
            "services": services, "verification_status": pd["verified"], "created_at": iso(20)})
        pro_ids.append(pid)
        pro_user_ids.append(uid)
        # pro posts
        for j, (imgkey, svc, style, attrs) in enumerate(pd["posts"]):
            await db.posts.insert_one({
                "id": nid(), "author_id": uid, "post_type": "professional",
                "media": [{"url": IMG[imgkey], "type": "image", "width": 800, "height": 1000}],
                "caption": f"{svc} · {pd['city']}", "category_id": cat_ids[pd["cat"][0]],
                "service_id": svc_ids.get(svc), "service_name": svc, "style_id": None, "style_name": style,
                "attributes": attrs, "city": pd["city"], "state": pd["state"], "lat": pd["lat"], "lng": pd["lng"],
                "tagged_professional_id": pid, "tag_status": "confirmed",
                "professional_details": None, "professional_details_by": None,
                "like_count": 40 + j * 12, "comment_count": 3 + j, "save_count": 15 + j * 5,
                "view_count": 200 + j * 50, "created_at": iso(j, 3)})

    # customer post tagging braidsbykay (only if customer and professionals were created)
    cust_post_id = None
    if cust_id and pro_ids:
        cust_post_id = nid()
        await db.posts.insert_one({
            "id": cust_post_id, "author_id": cust_id, "post_type": "customer",
            "media": [{"url": IMG["hair1"], "type": "image", "width": 800, "height": 1000}],
            "caption": "Birthday hair", "category_id": cat_ids["Hair"],
            "service_id": svc_ids.get("Boho Knotless"), "service_name": "Boho Knotless",
            "style_id": None, "style_name": "Boho",
            "attributes": {"Length": "Waist", "Size": "Medium"}, "city": "Cincinnati", "state": "OH",
            "lat": 39.1031, "lng": -84.5120, "tagged_professional_id": pro_ids[0], "tag_status": "confirmed",
            "professional_details": "Medium boho knotless. Waist length. 3 packs X-Pression. Human hair pieces. Approximately 6 hours",
            "professional_details_by": pro_ids[0],
            "like_count": 88, "comment_count": 5, "save_count": 30, "view_count": 340, "created_at": iso(1)})

        # a makeup + skincare post from customer
        await db.posts.insert_one({
            "id": nid(), "author_id": cust_id, "post_type": "customer",
            "media": [{"url": IMG["makeup1"], "type": "image", "width": 800, "height": 1000}],
            "caption": "Soft glam for date night", "category_id": cat_ids["Makeup"],
            "service_id": svc_ids.get("Soft Glam"), "service_name": "Soft Glam", "style_id": None, "style_name": "Soft Glam",
            "attributes": {"Finish": "Dewy"}, "city": "Cincinnati", "state": "OH", "lat": 39.1031, "lng": -84.5120,
            "tagged_professional_id": None, "tag_status": None,
            "professional_details": None, "professional_details_by": None,
            "like_count": 54, "comment_count": 2, "save_count": 20, "view_count": 180, "created_at": iso(2)})

        # follows, likes, collection for demo customer
        await db.follows.insert_one({"id": nid(), "follower_id": cust_id, "following_id": pro_user_ids[0], "created_at": iso(3)})
        await db.likes.insert_one({"id": nid(), "post_id": cust_post_id, "user_id": pro_user_ids[0], "created_at": iso(0)})
        col_id = nid()
        await db.collections.insert_one({"id": col_id, "user_id": cust_id, "name": "Birthday Hair",
                                         "cover_url": IMG["hair1"], "post_count": 1, "created_at": iso(3)})
        await db.saves.insert_one({"id": nid(), "post_id": cust_post_id, "user_id": cust_id,
                                   "collection_id": col_id, "created_at": iso(1)})
        await db.posts.update_one({"id": cust_post_id}, {"$inc": {"save_count": 1}})

        # a pending tag notification for a pro
        if len(pro_user_ids) > 1:
            await db.notifications.insert_one({"id": nid(), "user_id": pro_user_ids[1], "type": "tag_request",
                                               "actor_id": cust_id, "post_id": cust_post_id,
                                               "text": "Maya Rivera tagged you in a post", "read": False, "created_at": iso(0)})

    print("Seed complete.")
    print(f"  Admin:    {os.environ['ADMIN_EMAIL']} / (password from ADMIN_PASSWORD env var)")
    if SEED_TEST_PASSWORD:
        print("  Customer: maya@brook.ie / (password from SEED_TEST_PASSWORD env var)")
        print("  Pro:      kay@brook.ie / (password from SEED_TEST_PASSWORD env var) (braidsbykay, verified)")
    else:
        print("  NOTE: Test accounts not created. Set SEED_TEST_PASSWORD env var to create them.")
    print(f"  Categories: {await db.categories.count_documents({})}, Services: {await db.services.count_documents({})}, Posts: {await db.posts.count_documents({})}")
    client.close()


if __name__ == "__main__":
    asyncio.run(run())
