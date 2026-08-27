## [1.2.2] - 2026-08-27

- Added `web_fetch` model tool (`src/fetch.ts`) — fetches URLs via direct Node `fetch`, with 20 s timeout, 5-hop redirect cap, 256 KB body guard, and coarse HTML→markdown stripping (pony: full turndown needs extra deps).
- Restored search provider id to `ddg` (was `enhanced-free` in vendored copy); fixes `configured web provider "ddg" is not registered` error.
- Rebuilt `dist/` artifacts; `README.md` updated for both features.
