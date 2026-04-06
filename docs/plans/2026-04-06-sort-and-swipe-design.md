# Sort Order + Two-Tier Swipe Controls

**Date:** 2026-04-06
**Version:** 1.3.1 → 1.3.2

## Overview

Two enhancements:
1. **Sort toggle** — allow ascending/descending date sort on link lists and triage
2. **Two-tier swipe** — iOS Mail-style swipe with partial reveal (two buttons) and full-swipe auto-trigger

---

## Feature 1: Sort Order

### Data flow

- **Backend**: `GET /api/links` accepts new `sort_order` query param (`asc` | `desc`, default `desc`)
- **DB query**: Replace hardcoded `ORDER BY l.created_at DESC` with dynamic direction (whitelist-validated)
- **Frontend API**: Add `sort_order` to `ListLinksParams`
- **useLinks hook**: Accept `sortOrder` in filters, pass to API, reset accumulated links on change
- **Preferences**: New `sort_order` key persisted server-side, default `desc`

### UI

**Desktop**: Icon-only toggle button in the header button group (between Triage and Select). Arrow-down when `desc`, arrow-up when `asc`. Tooltip shows "Newest first" / "Oldest first".

**Mobile**: Sort icon button (h-9, matching search input height) placed to the right of the search input in `MobileNav`.

**Triage**: No separate sort UI — inherits sort from parent link list.

---

## Feature 2: Two-Tier Swipe Controls

### Behaviour

| Gesture | Result |
|---------|--------|
| Partial swipe (past ~60px reveal threshold) then release | Card snaps open to reveal two action buttons; stays open until tapped |
| Full swipe (past ~160px) | Auto-triggers outermost action, card animates out |
| Tap revealed button | Triggers that action, card animates out |
| Tap outside / release below reveal threshold | Card snaps back closed |

### Revealed button layout

Swipe left reveals right-side actions:
```
[ Card content slides left ] [ Inner | Outer ]
```
Outer button = the one triggered by full swipe. Each button shows icon + label, coloured by action type.

### Preferences

Four configurable slots replacing the current two:

| Preference key (DB) | Frontend key | Default |
|---|---|---|
| `swipe_left_inner` | `swipeLeftInner` | `archive` |
| `swipe_left_outer` | `swipeLeftOuter` | `delete` |
| `swipe_right_inner` | `swipeRightInner` | `none` |
| `swipe_right_outer` | `swipeRightOuter` | `archive` |

### Migration

On preferences load, if old `swipe_left`/`swipe_right` keys exist:
- Map old value to the **outer** slot
- Set inner slot to a sensible default
- Clear old keys on next save

### Settings UI

Current two dropdowns become four, grouped:
- **Swipe Left**: "Partial" dropdown, "Full swipe" dropdown
- **Swipe Right**: "Partial" dropdown, "Full swipe" dropdown

### Implementation (LinkCard)

Rewrite `useSwipe` hook:
- Two thresholds: `REVEAL_THRESHOLD` (~60px), `FULL_SWIPE_THRESHOLD` (~160px)
- New state: `revealed` (card snapped open showing buttons) vs `swiping` (finger down)
- Revealed state renders tappable action buttons behind the card
- Full swipe past threshold triggers outermost action with animation
- Touch outside revealed card dismisses it

---

## Files changed

| File | Sort | Swipe |
|------|------|-------|
| `src/db/queries/links.ts` | Dynamic ORDER BY | — |
| `src/routes/links.ts` | Accept `sort_order` param | — |
| `frontend/src/api.ts` | Add to `ListLinksParams` | — |
| `frontend/src/hooks/useLinks.ts` | Accept + pass `sortOrder` | — |
| `frontend/src/components/AuthenticatedApp.tsx` | State + toggle button | Wire 4 swipe props |
| `frontend/src/components/MobileNav.tsx` | Sort toggle next to search | — |
| `frontend/src/components/LinkCard.tsx` | — | Rewrite useSwipe, revealed button UI |
| `frontend/src/components/SettingsView.tsx` | — | 4 grouped dropdowns |
| `package.json` (root + frontend) | Version bump | Version bump |
