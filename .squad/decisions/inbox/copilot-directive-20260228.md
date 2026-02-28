### 2026-02-28T01:02:05Z: User directive
**By:** Michael Brown (via Copilot)
**What:** After every major change (new feature, significant refactor, route changes, portal rebuild), kill the running API server and restart it in the background, logging to `/tmp/loom-server.txt`. Supersedes any prior directive about server restarts. Log file is `/tmp/loom-server.txt` (not `.log`).
**Why:** User request — captured for team memory
