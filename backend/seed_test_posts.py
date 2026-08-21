import asyncio
import os
import uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

ROOT = Path(__file__).parent
load_dotenv(ROOT / ".env")
client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]


def nid():
    return str(uuid.uuid4())


def iso(days_ago=0, hours=0):
    return (datetime.now(timezone.utc) - timedelta(days=days_ago, hours=hours)).isoformat()


# Test posts with various orientations
# Using Unsplash for high-quality beauty/hair images
TEST_POSTS = [
    # Portrait images (taller than wide)
    {
        "caption": "Fresh knotless braids for the summer",
        "service_name": "Knotless Braids",
        "style_name": "Medium Knotless",
        "category": "hair",
        "media": [{
            "url": "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=800",
            "type": "image",
            "width": 800,
            "height": 1200,  # Portrait
        }],
    },
    {
        "caption": "Goddess locs giving everything",
        "service_name": "Goddess Locs",
        "style_name": "Hip Length",
        "category": "hair",
        "media": [{
            "url": "https://images.unsplash.com/photo-1595959183082-7b570b7e1dfa?w=800",
            "type": "image",
            "width": 800,
            "height": 1000,  # Portrait
        }],
    },
    # Landscape images (wider than tall)
    {
        "caption": "Nail art for days",
        "service_name": "Nail Art",
        "style_name": "Almond Shape",
        "category": "nails",
        "media": [{
            "url": "https://images.unsplash.com/photo-1604654894610-df63bc536371?w=1200",
            "type": "image",
            "width": 1200,
            "height": 800,  # Landscape
        }],
    },
    {
        "caption": "Clean makeup for everyday glam",
        "service_name": "Full Glam",
        "style_name": "Natural Glam",
        "category": "makeup",
        "media": [{
            "url": "https://images.unsplash.com/photo-1512496015851-a90fb38ba796?w=1200",
            "type": "image",
            "width": 1200,
            "height": 675,  # Wide landscape
        }],
    },
    # Square-ish images
    {
        "caption": "Lash extensions on point",
        "service_name": "Lash Extensions",
        "style_name": "Hybrid Set",
        "category": "lashes",
        "media": [{
            "url": "https://images.unsplash.com/photo-1583001931096-959e9a1a6223?w=800",
            "type": "image",
            "width": 800,
            "height": 800,  # Square
        }],
    },
    {
        "caption": "Brow lamination is a game changer",
        "service_name": "Brow Lamination",
        "style_name": "Fluffy Brows",
        "category": "brows",
        "media": [{
            "url": "https://images.unsplash.com/photo-1588528402605-6e7fdb0a6bf9?w=900",
            "type": "image",
            "width": 900,
            "height": 900,  # Square
        }],
    },
    # Very tall portrait
    {
        "caption": "Silk press looking silky",
        "service_name": "Silk Press",
        "style_name": "Long & Sleek",
        "category": "hair",
        "media": [{
            "url": "https://images.unsplash.com/photo-1580618672591-eb180b1a973f?w=600",
            "type": "image",
            "width": 600,
            "height": 1000,  # Tall portrait
        }],
    },
    {
        "caption": "Spring nails ready",
        "service_name": "Gel Manicure",
        "style_name": "Coffin Shape",
        "category": "nails",
        "media": [{
            "url": "https://images.unsplash.com/photo-1607779097040-26e80aa78e66?w=800",
            "type": "image",
            "width": 800,
            "height": 1200,  # Portrait
        }],
    },
    # More variety
    {
        "caption": "Skincare routine paying off",
        "service_name": "Facial",
        "style_name": "Hydrating Facial",
        "category": "skincare",
        "media": [{
            "url": "https://images.unsplash.com/photo-1596755389378-c31d21fd1273?w=1000",
            "type": "image",
            "width": 1000,
            "height": 667,  # Landscape
        }],
    },
    {
        "caption": "Box braids for the win",
        "service_name": "Box Braids",
        "style_name": "Medium Box Braids",
        "category": "hair",
        "media": [{
            "url": "https://images.unsplash.com/photo-1589156280159-27698a70f29e?w=800",
            "type": "image",
            "width": 800,
            "height": 1067,  # Portrait
        }],
    },
]

# Sample video URLs (using public domain/CC videos)
VIDEO_POSTS = [
    {
        "caption": "Hair tutorial - how I do my edges",
        "service_name": "Edge Control",
        "style_name": "Baby Hair Styling",
        "category": "hair",
        "media": [{
            "url": "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
            "type": "video",
            "width": 1280,
            "height": 720,  # Landscape video
        }],
    },
    {
        "caption": "Quick nail art timelapse",
        "service_name": "Nail Art",
        "style_name": "French Tips",
        "category": "nails",
        "media": [{
            "url": "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4",
            "type": "video",
            "width": 720,
            "height": 1280,  # Portrait video
        }],
    },
]


async def seed_posts():
    # Find nailahniang user
    user = await db.users.find_one({"username": "nailahniang"})
    if not user:
        print("User 'nailahniang' not found!")
        return

    user_id = user["id"]
    print(f"Found user: {user['display_name']} ({user_id})")

    # Create image posts
    for i, post_data in enumerate(TEST_POSTS):
        post = {
            "id": nid(),
            "author_id": user_id,
            "caption": post_data["caption"],
            "media": post_data["media"],
            "category": post_data["category"],
            "service_name": post_data.get("service_name"),
            "style_name": post_data.get("style_name"),
            "post_type": "customer",
            "visibility": "public",
            "like_count": 0,
            "save_count": 0,
            "comment_count": 0,
            "created_at": iso(days_ago=i),
        }
        await db.posts.insert_one(post)
        print(f"Created post: {post_data['caption'][:40]}... ({post_data['media'][0]['width']}x{post_data['media'][0]['height']})")

    # Create video posts
    for i, post_data in enumerate(VIDEO_POSTS):
        post = {
            "id": nid(),
            "author_id": user_id,
            "caption": post_data["caption"],
            "media": post_data["media"],
            "category": post_data["category"],
            "service_name": post_data.get("service_name"),
            "style_name": post_data.get("style_name"),
            "post_type": "customer",
            "visibility": "public",
            "like_count": 0,
            "save_count": 0,
            "comment_count": 0,
            "created_at": iso(days_ago=len(TEST_POSTS) + i),
        }
        await db.posts.insert_one(post)
        print(f"Created video: {post_data['caption'][:40]}... ({post_data['media'][0]['width']}x{post_data['media'][0]['height']})")

    print(f"\nCreated {len(TEST_POSTS)} image posts and {len(VIDEO_POSTS)} video posts for nailahniang")


if __name__ == "__main__":
    asyncio.run(seed_posts())
