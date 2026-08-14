# brook.ie — Product Requirements & Build Log

## Original Problem Statement
Mobile-first beauty discovery platform connecting beauty inspiration with local beauty professionals. Core journey: **Discover a look → Understand it → Find pros who can do it → View their work/services/pricing → Book/contact.** Three roles: customer, professional, admin.

## Architecture
- **Frontend:** Expo (React Native) SDK 54, expo-router file-based routing, custom design system (Cormorant Garamond display + Manrope body), warm ivory/espresso editorial theme with soft lavender + pink accents.
- **Backend:** FastAPI + MongoDB (motor), JWT email/password auth (bcrypt), uuid string IDs (no ObjectId leakage), all routes under `/api`.
- **Media:** Emergent Managed Object Storage (`/api/upload`, `/api/files/{path}`).
- **Ranking:** deterministic "find a professional" scoring (service 35 / style 20 / location 20 / activity 10 / engagement 10 / completeness 5).

## User Personas
1. **Customer** — discovers looks, saves to collections, follows pros, posts their own looks, tags the pro who did it.
2. **Professional** — has an underlying user account + pro profile; posts work, manages services/pricing/portfolio, confirms tags, adds pro details, views analytics.
3. **Admin** — verifies pros, handles reports, manages categories/services/styles.

## Implemented (2026-06)
- Auth: register (→ interests onboarding) / login / me / profile edit + avatar upload.
- Home: brand header, search, category chip row (horizontal), Recommended Pros carousel, For You / Following / Nearby feeds, masonry visual feed.
- Discover: type-ahead search with suggestions + Looks / Professionals / Services tabs; trending.
- Post detail: hero media (image/video), expandable details sheet, professional attribution, distinct pro-details block, like/comment/reply/save, report, **"Find Someone Who Can Do This"** CTA.
- Find-a-pro: ranked results (best match highlighted, distance, starting price).
- Professional: onboarding, public profile (cover, verified badge, services & pricing, portfolio grid, socials, Book Appointment w/ click tracking), Pro Studio dashboard, analytics, edit profile+services, verification request.
- Professional tagging: tag on create → pro confirm/reject → confirmed attribution → pro adds structured details.
- Saved: saved posts + collections (create/rename/delete, add/remove).
- Social: likes, comments, replies, follows, notifications (badge on home bell).
- Admin: overview stats, verify pros, resolve reports, add categories/styles.
- Seed: 8 categories, 35 services, 12 styles, 5 accounts, 8 posts, sample tag/collection/notification.

## Implemented — Iteration 3 (UI/Profile/Collections/Create audit)
- Home feed: photo-only tiles; **video posts autoplay muted + loop** with no play-icon overlay (expo-video).
- Profile: **followers/following counts open real lists** (`/connections/[id]`); **posts count scrolls to Looks**; "Client"/"Professional" role chip; interests removed from profile (used only for Home).
- Privacy: `profile_public` on users — clients default **private** (gated from discovery), pros public; toggle in Edit Profile.
- Collections: proper **many-to-many** (`collection_items`); **press-and-hold / folder icon** on a post opens a SaveSheet to add to one or many collections or create new; tap = quick save; **Pinterest-style 1/2/3/2×2 thumbnails** that auto-update.
- Create post: **custom "Other" category** input, **custom/Other service** input (never a dead end), and **searchable style tags** with create-custom + multi-select.
- Styles are **structured & normalized** (id, name, searchable_name, usage_count, category_id, created_by, created_at) — Boho/boho/BOHO dedupe.
- Removed leftover test categories from DB. Search matches style_names[] + custom_category.

## Backlog (P1/P2)
- P1: OS-native share sheet; edit/delete own posts from UI; location distance filters (5/10/25/50 mi) on Discover.
- P2: Reviews, native booking, messaging (architecture-ready), AI "Find this look".
- P2: Split server.py into routers; richer professional post form.

## Run
- Backend auto-runs (supervisor `backend`), Expo on `expo`. Reseed: `cd /app/backend && python seed.py`.
- Credentials in `/app/memory/test_credentials.md`.

## Assumptions
- User approved MongoDB over Postgres/Prisma.
- "Blend both" design → warm neutrals + lavender/pink pops, no green.
- Verification is admin-manual for MVP.
