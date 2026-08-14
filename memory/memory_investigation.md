# Memory & Resource Investigation — brook.ie

## Trigger
User observed the preview environment "repeatedly restarting" and suspected a memory/resource problem.

## Findings
- **Container has ample headroom**: 32 GB total RAM, ~4.4 GB used, ~27 GB available, **0 swap, no OOM events**.
- **Heaviest process** = the **Expo/Metro dev server** (~370 MB RSS) — expected for a JS bundler in dev.
- **Backend** (uvicorn) uses only ~26 MB RSS.
- **MongoDB** wiredTiger cache capped at 0.25 GB.
- The backend runs with `uvicorn --reload` in the dev/preview environment. `--reload` (and Metro's file watcher) **restart on every file save** — this is the "restart" behavior observed. **It does not occur in production**, which serves a pre-built bundle and runs the API without `--reload`.

**Conclusion:** The restarts are normal dev hot-reload, not a leak or resource exhaustion. No memory limit was raised (no limit issue exists).

## Application-level fixes made for production efficiency
1. **N+1 query elimination (biggest win):** feed/saved/search/profile post lists previously issued 3–5 Mongo queries **per post** (author, tagged pro, liked, saved) → ~160 queries for a 40-post feed. Added `enrich_posts()` batch loader → **~5 queries total** regardless of page size.
2. **Streaming file serving:** `/api/files/{path}` now streams object storage responses in 64 KB chunks via `StreamingResponse` instead of loading the entire file into memory. Prevents memory spikes when serving large videos.

## Stress test (production-shaped load)
- 800 requests (400 `/posts/feed` + 400 `/search`) hammered directly against the API.
- **Backend RSS before: 26,964 KB. After: 26,964 KB — exactly 0 growth.**
- Result: memory is **flat and stable** under sustained load. No leak.

## Recommendation for production
- Deploy runs uvicorn without `--reload` (handled by platform) → no restart churn.
- Media served via streaming; images already optimized (expo-image caching + width-limited URLs).
