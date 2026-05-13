# Multi-User Sync — Feature Spec

## Overview

Allow multiple computers on the same school network to use the app simultaneously, with one machine acting as the server and all others connecting via browser. Only one session may be actively editing at any time to prevent data conflicts.

## Architecture

One machine runs the Electron app (Flask server). All other machines access the UI via browser at `http://[server-ip]:5000`. The Electron window on the server machine is treated as a regular browser session — no special local mode. Flask is started with `--host=0.0.0.0` to expose on the network.

```
[Server Mac — Electron window]
         |
    Flask :5000
         |
   ------+------+------
   |            |     |
[Browser     [Browser] [Browser]
 Room 2]      Room 3]   Room 4]
```

## Active Lock

Only one session (tab) may edit at a time. All others are read-only.

### Server-side state

```python
active_lock = {
    "session_id": None,   # UUID identifying the holder
    "held_by": None,      # Human-readable label (hostname or custom name)
    "acquired_at": None,  # ISO timestamp
    "expires": None,      # ISO timestamp (now + 30s, renewed by heartbeat)
}
```

### Lock lifecycle

1. Session opens app → polls `/api/lock/status`
2. Lock is free → session calls `POST /api/lock/acquire` → becomes active editor
3. Lock is held → session enters read-only mode, UI shows "In use by [held_by]"
4. Active session sends `POST /api/lock/heartbeat` every 10s to renew (extend expiry by 30s)
5. Session closes/navigates away → calls `POST /api/lock/release` (best effort via `beforeunload`)
6. If heartbeat stops → lock auto-expires after 30s → any session can acquire it

### Lock API endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/lock/status` | Returns current lock state |
| POST | `/api/lock/acquire` | Attempt to acquire lock. Body: `{session_id, held_by}`. Returns `{ok, lock}` |
| POST | `/api/lock/heartbeat` | Renew lock expiry. Body: `{session_id}`. Returns `{ok}` or `{error: "not_holder"}` |
| POST | `/api/lock/release` | Release lock. Body: `{session_id}`. No-op if not holder |

### Lock status response shape

```json
{
  "locked": true,
  "held_by": "Mrs. Smith's Mac",
  "expires_in": 18,
  "is_holder": false
}
```

`is_holder` is true when the requesting session currently holds the lock (matched by session_id passed as a header or query param).

## Live Sync (Polling)

All sessions poll for external changes so the UI stays current without manual refresh.

### Server-side state

```python
last_modified = {
    "timestamp": "2025-05-10T14:32:01",
    "changed_by": "session-uuid-abc",  # so holder doesn't re-fetch its own changes
    "scope": "kindergarten",           # which grade changed (optional optimisation)
}
```

Updated on every mutating API call (save students, save assignments, save settings, etc.).

### Sync API endpoint

```
GET /api/sync-status
→ { "timestamp": "...", "changed_by": "...", "scope": "kindergarten" }
```

### Client polling loop

Every 3 seconds:

```javascript
async function pollSync() {
  const status = await fetch('/api/sync-status').then(r => r.json());
  const lockStatus = await fetch(`/api/lock/status?session=${sessionId}`).then(r => r.json());

  // Re-render if data changed by someone else
  if (status.timestamp !== lastKnownTimestamp && status.changed_by !== sessionId) {
    lastKnownTimestamp = status.timestamp;
    await showScreen(currentScreen); // re-render current view
  }

  // Update lock UI
  updateLockIndicator(lockStatus);
}
```

Both requests can be batched into a single endpoint `/api/poll` to halve round-trips.

## UI Changes

### Lock indicator — top bar

A persistent indicator in the top navigation bar showing current sync/lock state:

- **Holder:** green dot + "Editing" (no action needed)
- **Free:** grey dot + "Take edit" button → acquires lock on click
- **Locked by other:** amber dot + "In use by [name]" + greyed-out editing controls
- **Lock expired, available:** amber dot + "Session ended — take edit?" button

### Read-only mode

When lock is held by another session:
- All mutating controls disabled (add student, edit settings, run assign, edit mode toggle, save)
- A subtle banner: "Read-only — [Name] is editing"
- Hovering disabled controls shows tooltip: "Wait for [Name] to finish"

### Session identity

Each client generates a UUID on first load and stores it in `localStorage`. On first use, a small prompt asks for a display name ("What should we call this computer?") which is also stored in `localStorage`. This name appears in the lock indicator for other sessions.

## Edge Cases

| Scenario | Behaviour |
|----------|-----------|
| Holder closes browser tab | `beforeunload` fires `POST /lock/release`. Lock clears immediately. |
| Holder's computer sleeps/crashes | Heartbeat stops. Lock auto-expires after 30s. Others see countdown. |
| Two sessions try to acquire simultaneously | Server uses a simple mutex (Python threading.Lock) around the acquire check. First writer wins, second gets `{ok: false}`. |
| Holder navigates between grades | Lock stays held. Heartbeat continues. |
| Server machine Electron window | Treated identically to any browser session. Acquires lock, heartbeats, releases. No special path. |
| Single user (no other sessions) | Lock acquired immediately on page load. No UI change from current experience. |
| Running assignment (long operation) | Lock must be held for duration of solver run. If it expires mid-run, the save is still accepted (lock check is only on acquire, not on save). |

## Flask startup change

```python
# app.py — change host binding
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=False)
```

No Electron changes needed. The Electron window continues to load `http://localhost:5000` as today.

## What does NOT change

- Data storage (JSON files on disk, same as today)
- The solver / assignment logic
- Electron packaging
- The `.classify` backup/restore feature
- Any existing API endpoints (lock/sync are additive)

## Implementation order

1. ✅ `--host=0.0.0.0` binding (trivial, unlocks multi-machine access immediately)
2. ✅ `/api/sync-status` + client polling (read-only sync, no lock needed yet)
3. ✅ Lock endpoints + server-side mutex
4. ✅ Client lock acquisition on page load + heartbeat loop
5. ✅ Read-only UI mode when locked by another session
6. ✅ Session naming prompt + lock indicator in top bar
7. ✅ Backend lock enforcement on all mutating endpoints
8. ✅ Frontend fetch wrapper to auto-include session ID

## Implementation Status

### ✅ Completed

All features from the spec have been implemented:

**Backend (`webapp/app.py`):**
- Lock state management with threading mutex
- Sync state tracking (timestamp, changed_by, scope)
- Lock API endpoints: `/api/lock/{acquire,release,heartbeat,status}`
- Sync API endpoint: `/api/sync-status`
- Lock enforcement on all mutating POST/PUT/DELETE endpoints
- `update_last_modified()` called after all data mutations
- Server binds to `0.0.0.0:5001` for network access

**Frontend:**
- `sync-client.js` - Full sync client implementation
  - Session identity (UUID + name in localStorage)
  - Lock acquisition on page load
  - Heartbeat every 10 seconds
  - Poll for changes every 3 seconds
  - Auto-release lock on page unload
- `sync.css` - Read-only mode styles
  - Body class `read-only-mode` disables all controls
  - Visual banner indicating read-only status
  - Lock indicator styles
- Fetch wrapper automatically adds `X-Session-ID` header to all requests
- Lock indicator in UI header
- Session name prompt on first use (defaults to hostname)

**Testing:**
- `test_multi_user_sync.py` - Backend test suite
  - Tests lock acquisition, enforcement, expiry, heartbeat
  - All tests pass ✓
- `webapp/static/test_frontend_sync.html` - Frontend test page
  - Interactive testing of lock operations
  - Verify fetch headers included
  - Real-time lock status monitoring

### How to Test

**Quick Test (Single Machine):**
1. Start server: `python webapp/app.py`
2. Open `http://localhost:5001` in two browser windows
3. First window should acquire edit mode automatically
4. Second window should show "Read-only — [name] is editing"
5. Make changes in first window → second window auto-refreshes
6. Close first window → second window gets edit mode after 30s

**Multi-Machine Test:**
1. Find server IP: Run `ifconfig` or `ipconfig` on server machine
2. Start server: `python webapp/app.py`
3. Server shows: "Access from other machines: http://[ip]:5001"
4. On another device on same network, open `http://[ip]:5001`
5. Verify lock behavior as above

**Backend Tests:**
```bash
python3 test_multi_user_sync.py
# All tests should pass
```

### Files Changed/Added

**Backend:**
- Modified: `webapp/app.py` - Added lock state, sync endpoints, lock checks on mutations

**Frontend:**
- Added: `webapp/static/js/sync-client.js` - Sync client (complete implementation)
- Added: `webapp/static/css/sync.css` - Read-only mode styles
- Modified: `webapp/templates/homeroom.html` - Include sync scripts, add lock indicator

**Tests:**
- Added: `test_multi_user_sync.py` - Backend test suite
- Added: `webapp/static/test_frontend_sync.html` - Frontend test page

**Documentation:**
- Modified: `MULTI_USER_SYNC.md` - This file (added implementation status)
