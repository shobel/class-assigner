# Per-Grade Locks + Per-Grade Rules - Implementation Plan

## Goal
Allow multiple users to edit different grades simultaneously without conflicts.

## Architecture

### Backend Changes ✅ STARTED
- [x] Change `active_lock` dict → `active_locks` dict with grade_id keys
- [x] Update `/api/lock/status` - add `grade_id` parameter
- [x] Update `/api/lock/acquire` - add `grade_id` parameter
- [x] Update `/api/lock/heartbeat` - add `grade_id` parameter  
- [x] Update `/api/lock/release` - add `grade_id` parameter (supports releasing all)
- [ ] Update all grade-specific endpoints to check grade lock
- [ ] Remove lock checks from school-year/config endpoints (allow without lock)

### Frontend Changes - TODO
- [ ] Remove global lock state (`window.readOnlyMode`, `window.lockStatus`)
- [ ] Add per-grade lock state (`window.gradeLocks = {kindergarten: {...}, ...}`)
- [ ] Remove global read-only banner
- [ ] When opening a grade (`showScreen('students')`):
  - Try to acquire lock for that grade
  - Start heartbeat for that grade
  - Show lock status in grade header
- [ ] When switching grades:
  - Release previous grade lock
  - Acquire new grade lock
- [ ] Update `data-mutates` check:
  - Disable controls only if current grade is locked by someone else
  - Not a global disable anymore

### Per-Grade Rules - TODO
- [ ] Add `custom_rules` field to grade data:
  ```python
  {
    'students': [...],
    'assignments': [...],
    'custom_rules': {  # Optional override
      'properties': [...]
    }
  }
  ```
- [ ] In grade settings UI:
  - Show "Rules for [Grade Name]"
  - Show current: "Using global rules" or "Custom rules ✏️"
  - Button: "Customize for this grade"
  - Button: "Reset to global"
- [ ] When solver runs, use `grade.custom_rules` if exists, else global `config.properties`

## Benefits
- ✅ Multiple users work in parallel (different grades)
- ✅ Per-grade customization (K needs heavy behavior weight)
- ✅ Simpler mental model (I own this grade)
- ✅ No global bottleneck

## Migration
- Existing data: no changes needed (custom_rules is optional)
- Frontend: breaking change (need full refactor of sync-client.js)

## Current Status
- Backend lock endpoints updated for per-grade
- Need to complete frontend refactor
- This is a BIG change - maybe 1-2 hours of work

## Next Steps
1. Finish backend endpoint updates (remove old lock checks)
2. Refactor sync-client.js for per-grade locks
3. Update homeroom-app.js to acquire/release on grade switch
4. Test with 2 users editing different grades
5. Add per-grade rules UI
