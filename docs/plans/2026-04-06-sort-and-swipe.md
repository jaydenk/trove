# Sort Order + Two-Tier Swipe Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:executing-plans to implement this plan task-by-task.

**Goal:** Add date sort toggle (asc/desc) to link lists, and upgrade swipe gestures to iOS Mail-style two-tier (partial reveal + full swipe) with four configurable action slots.

**Architecture:** Backend gets a new `sort_order` query param with whitelist validation. Frontend persists sort preference server-side alongside existing prefs. LinkCard's `useSwipe` hook is rewritten with two thresholds and a "revealed" state that renders tappable action buttons.

**Tech Stack:** Bun, Hono, SQLite (backend); React 18, TypeScript, Tailwind CSS (frontend)

---

### Task 0: Backend — Add sort_order to listLinks query

**Files:**
- Modify: `src/db/queries/links.ts:60-69` (ListLinksFilters interface)
- Modify: `src/db/queries/links.ts:245` (ORDER BY clause)
- Modify: `src/routes/links.ts:25-52` (route handler)
- Test: `src/routes/__tests__/links.test.ts`

**Step 1: Write the failing test**

Add to `src/routes/__tests__/links.test.ts` inside the existing `describe("links routes")` block, after the existing tests:

```typescript
describe("GET /api/links sort_order", () => {
  test("returns links in ascending order when sort_order=asc", async () => {
    const app = createApp();
    // Insert links with known timestamps
    db.query(
      `INSERT INTO links (id, user_id, url, title, domain, collection_id, status, extraction_status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'saved', 'completed', ?)`
    ).run("link-old", userId, "https://example.com/old", "Old Link", "example.com", inboxId, "2024-01-01T00:00:00Z");
    db.query(
      `INSERT INTO links (id, user_id, url, title, domain, collection_id, status, extraction_status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'saved', 'completed', ?)`
    ).run("link-new", userId, "https://example.com/new", "New Link", "example.com", inboxId, "2025-01-01T00:00:00Z");

    const res = await app.request("/api/links?sort_order=asc", {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data[0].id).toBe("link-old");
    expect(body.data[1].id).toBe("link-new");
  });

  test("returns links in descending order by default", async () => {
    const app = createApp();
    db.query(
      `INSERT INTO links (id, user_id, url, title, domain, collection_id, status, extraction_status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'saved', 'completed', ?)`
    ).run("link-old", userId, "https://example.com/old", "Old Link", "example.com", inboxId, "2024-01-01T00:00:00Z");
    db.query(
      `INSERT INTO links (id, user_id, url, title, domain, collection_id, status, extraction_status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'saved', 'completed', ?)`
    ).run("link-new", userId, "https://example.com/new", "New Link", "example.com", inboxId, "2025-01-01T00:00:00Z");

    const res = await app.request("/api/links", {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data[0].id).toBe("link-new");
    expect(body.data[1].id).toBe("link-old");
  });

  test("ignores invalid sort_order values", async () => {
    const app = createApp();
    insertLink("link-1", "https://example.com/1", "Link 1");

    const res = await app.request("/api/links?sort_order=DROP TABLE", {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    expect(res.status).toBe(200);
    // Falls back to default DESC — doesn't crash
    const body = await res.json();
    expect(body.data.length).toBe(1);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test src/routes/__tests__/links.test.ts`
Expected: FAIL — `sort_order` param not yet handled

**Step 3: Implement sort_order support**

In `src/db/queries/links.ts`, add `sort_order` to the interface:

```typescript
export interface ListLinksFilters {
  q?: string;
  collection_id?: string;
  tag?: string;
  domain?: string;
  status?: string;
  source?: string;
  page?: number;
  limit?: number;
  sort_order?: "asc" | "desc";
}
```

In the same file, replace line 245's hardcoded ORDER BY:

```typescript
// Whitelist sort direction — default to DESC
const sortDirection = filters.sort_order === "asc" ? "ASC" : "DESC";
const dataSql = `SELECT l.*${selectSnippet} ${fromClause} ${whereClause} ORDER BY l.created_at ${sortDirection} LIMIT ? OFFSET ?`;
```

In `src/routes/links.ts`, read the new param and pass it through (after the existing `source` line):

```typescript
const sort_order = c.req.query("sort_order") as "asc" | "desc" | undefined;
```

And add `sort_order` to the object passed to `listLinks()`.

**Step 4: Run test to verify it passes**

Run: `bun test src/routes/__tests__/links.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/db/queries/links.ts src/routes/links.ts src/routes/__tests__/links.test.ts
git commit -m "feat: add sort_order param to listLinks API"
```

---

### Task 1: Frontend API + hook — Wire sort_order through

**Files:**
- Modify: `frontend/src/api.ts:244-253` (ListLinksParams)
- Modify: `frontend/src/hooks/useLinks.ts` (UseLinksFilters, fetchPage, filter reset)

**Step 1: Add sort_order to ListLinksParams**

In `frontend/src/api.ts`, add to the `ListLinksParams` interface:

```typescript
export interface ListLinksParams {
  q?: string;
  collection_id?: string;
  tag?: string;
  domain?: string;
  status?: string;
  source?: string;
  page?: number;
  limit?: number;
  sort_order?: "asc" | "desc";
}
```

**Step 2: Add sortOrder to useLinks**

In `frontend/src/hooks/useLinks.ts`:

Add `sortOrder` to the `UseLinksFilters` interface:

```typescript
export interface UseLinksFilters {
  q?: string;
  collectionId?: string;
  tag?: string;
  status?: string;
  sortOrder?: "asc" | "desc";
}
```

Destructure it alongside the others (line 26):

```typescript
const { q, collectionId, tag, status, sortOrder } = filters;
```

Add `sortOrder` to the filtersRef, the filter change detection (the `useEffect` that resets), and the `fetchPage` callback's API call:

```typescript
// In filtersRef initial value and update:
const filtersRef = useRef({ q, collectionId, tag, status, sortOrder });

// In the reset useEffect — add sortOrder to the comparison:
prev.sortOrder !== sortOrder

// In fetchPage's api.links.list call — add:
sort_order: sortOrder || undefined,

// Add sortOrder to fetchPage's dependency array
```

**Step 3: Verify frontend type-checks**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add frontend/src/api.ts frontend/src/hooks/useLinks.ts
git commit -m "feat: wire sort_order through frontend API client and useLinks hook"
```

---

### Task 2: Frontend — Sort preference state + toggle UI

**Files:**
- Modify: `frontend/src/components/AuthenticatedApp.tsx` (preference state, toggle button in desktop header)
- Modify: `frontend/src/components/MobileNav.tsx` (sort toggle next to search, new props)

**Step 1: Add sort preference state in AuthenticatedApp**

In `frontend/src/components/AuthenticatedApp.tsx`, near the other preference state (around line 158):

```typescript
const [sortOrder, setSortOrderState] = useState<"asc" | "desc">("desc");
```

In the preferences loading effect (around line 163), add after the `showImages` handling:

```typescript
const so = prefs.sortOrder ?? prefs.sort_order;
if (so === "asc" || so === "desc") {
  setSortOrderState(so);
}
```

Add the setter callback (after the other preference setters, around line 220):

```typescript
const setSortOrder = useCallback((value: "asc" | "desc") => {
  setSortOrderState(value);
  api.preferences.set({ sort_order: value }).catch(() => {});
}, []);

const toggleSortOrder = useCallback(() => {
  setSortOrder(sortOrder === "desc" ? "asc" : "desc");
}, [sortOrder, setSortOrder]);
```

**Step 2: Pass sortOrder to useLinks**

Find where `useLinks(linkFilters)` is called and add `sortOrder` to the filters object:

```typescript
const linkFilters = useMemo(() => ({
  // ...existing filters...
  sortOrder,
}), [/* ...existing deps..., */ sortOrder]);
```

(Check the exact shape of `linkFilters` — it may be constructed inline or via `useMemo`. Add `sortOrder` to it.)

**Step 3: Add sort toggle button to desktop header**

In the desktop header's button group (around line 907, inside the `<div className="flex items-center gap-2">`), add before the Triage button:

```tsx
<button
  type="button"
  onClick={toggleSortOrder}
  className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium border border-border dark:border-dark-border text-neutral-600 dark:text-neutral-400 hover:bg-hover dark:hover:bg-dark-hover transition-colors"
  title={sortOrder === "desc" ? "Newest first" : "Oldest first"}
>
  {sortOrder === "desc" ? (
    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M10 3a.75.75 0 01.75.75v10.638l3.96-4.158a.75.75 0 111.08 1.04l-5.25 5.5a.75.75 0 01-1.08 0l-5.25-5.5a.75.75 0 111.08-1.04l3.96 4.158V3.75A.75.75 0 0110 3z" clipRule="evenodd" />
    </svg>
  ) : (
    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M10 17a.75.75 0 01-.75-.75V5.612L5.29 9.77a.75.75 0 01-1.08-1.04l5.25-5.5a.75.75 0 011.08 0l5.25 5.5a.75.75 0 01-1.08 1.04l-3.96-4.158V16.25A.75.75 0 0110 17z" clipRule="evenodd" />
    </svg>
  )}
</button>
```

**Step 4: Add sort toggle to MobileNav**

Add new props to `MobileNavProps`:

```typescript
sortOrder?: "asc" | "desc";
onToggleSortOrder?: () => void;
```

In the mobile search bar section (around line 111), place a sort button to the right of the search input. Wrap the search input and button in a flex container:

```tsx
{onSearchChange && (
  <div className="px-4 pb-2 flex items-center gap-2">
    <div className="relative flex items-center flex-1">
      {/* existing search SVG + input */}
    </div>
    {onToggleSortOrder && (
      <button
        type="button"
        onClick={onToggleSortOrder}
        className="inline-flex items-center justify-center h-9 w-9 shrink-0 rounded-md border border-border dark:border-dark-border text-neutral-600 dark:text-neutral-400 hover:bg-hover dark:hover:bg-dark-hover transition-colors"
        aria-label={sortOrder === "desc" ? "Newest first" : "Oldest first"}
        title={sortOrder === "desc" ? "Newest first" : "Oldest first"}
      >
        {sortOrder === "desc" ? (
          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 3a.75.75 0 01.75.75v10.638l3.96-4.158a.75.75 0 111.08 1.04l-5.25 5.5a.75.75 0 01-1.08 0l-5.25-5.5a.75.75 0 111.08-1.04l3.96 4.158V3.75A.75.75 0 0110 3z" clipRule="evenodd" />
          </svg>
        ) : (
          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 17a.75.75 0 01-.75-.75V5.612L5.29 9.77a.75.75 0 01-1.08-1.04l5.25-5.5a.75.75 0 011.08 0l5.25 5.5a.75.75 0 01-1.08 1.04l-3.96-4.158V16.25A.75.75 0 0110 17z" clipRule="evenodd" />
          </svg>
        )}
      </button>
    )}
  </div>
)}
```

**Step 5: Pass new props to MobileNav**

Where `<MobileNav>` is rendered in AuthenticatedApp (for the main list view — not settings), add:

```tsx
sortOrder={sortOrder}
onToggleSortOrder={toggleSortOrder}
```

**Step 6: Verify frontend type-checks**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

**Step 7: Commit**

```bash
git add frontend/src/components/AuthenticatedApp.tsx frontend/src/components/MobileNav.tsx
git commit -m "feat: add sort order toggle to desktop header and mobile nav"
```

---

### Task 3: Swipe preferences — Expand from 2 to 4 slots

**Files:**
- Modify: `frontend/src/components/AuthenticatedApp.tsx` (preference state: 4 swipe slots + migration)
- Modify: `frontend/src/components/SettingsView.tsx` (4 dropdowns grouped by direction)
- Modify: `frontend/src/components/LinkCard.tsx` (update LinkCardProps to accept 4 swipe actions)

**Step 1: Update AuthenticatedApp preference state**

Replace the two swipe state variables with four:

```typescript
const [swipeLeftInner, setSwipeLeftInnerState] = useState<SwipeAction>("archive");
const [swipeLeftOuter, setSwipeLeftOuterState] = useState<SwipeAction>("delete");
const [swipeRightInner, setSwipeRightInnerState] = useState<SwipeAction>("none");
const [swipeRightOuter, setSwipeRightOuterState] = useState<SwipeAction>("archive");
```

In the preferences loading effect, add migration logic. After loading all prefs:

```typescript
// New four-slot swipe prefs
const sli = prefs.swipeLeftInner ?? prefs.swipe_left_inner;
if (sli) setSwipeLeftInnerState(sli as SwipeAction);
const slo = prefs.swipeLeftOuter ?? prefs.swipe_left_outer;
if (slo) setSwipeLeftOuterState(slo as SwipeAction);
const sri = prefs.swipeRightInner ?? prefs.swipe_right_inner;
if (sri) setSwipeRightInnerState(sri as SwipeAction);
const sro = prefs.swipeRightOuter ?? prefs.swipe_right_outer;
if (sro) setSwipeRightOuterState(sro as SwipeAction);

// Migration: if old keys exist but new ones don't, map old → outer
const swipeLeft = prefs.swipeLeft ?? prefs.swipe_left;
if (swipeLeft && !slo) {
  setSwipeLeftOuterState(swipeLeft as SwipeAction);
}
const swipeRight = prefs.swipeRight ?? prefs.swipe_right;
if (swipeRight && !sro) {
  setSwipeRightOuterState(swipeRight as SwipeAction);
}
```

Remove the old `swipeLeftAction`/`swipeRightAction` state and their setters. Add four new setters following the same pattern:

```typescript
const setSwipeLeftInner = useCallback((value: SwipeAction) => {
  setSwipeLeftInnerState(value);
  api.preferences.set({ swipe_left_inner: value }).catch(() => {});
}, []);
const setSwipeLeftOuter = useCallback((value: SwipeAction) => {
  setSwipeLeftOuterState(value);
  api.preferences.set({ swipe_left_outer: value }).catch(() => {});
}, []);
const setSwipeRightInner = useCallback((value: SwipeAction) => {
  setSwipeRightInnerState(value);
  api.preferences.set({ swipe_right_inner: value }).catch(() => {});
}, []);
const setSwipeRightOuter = useCallback((value: SwipeAction) => {
  setSwipeRightOuterState(value);
  api.preferences.set({ swipe_right_outer: value }).catch(() => {});
}, []);
```

**Step 2: Update LinkCardProps**

In `frontend/src/components/LinkCard.tsx`, update the interface:

```typescript
export interface LinkCardProps {
  // ...existing props...
  swipeLeftInner?: SwipeAction;
  swipeLeftOuter?: SwipeAction;
  swipeRightInner?: SwipeAction;
  swipeRightOuter?: SwipeAction;
  onSwipeAction?: (link: Link, action: SwipeAction) => void;
  // Remove old swipeLeftAction / swipeRightAction
}
```

Update the destructuring in the component to use the new names with defaults:

```typescript
swipeLeftInner = "archive",
swipeLeftOuter = "delete",
swipeRightInner = "none",
swipeRightOuter = "archive",
```

**Step 3: Update SettingsView props and UI**

In `SettingsView`, replace the two swipe props with four:

```typescript
swipeLeftInner: SwipeAction;
swipeLeftOuter: SwipeAction;
swipeRightInner: SwipeAction;
swipeRightOuter: SwipeAction;
onSwipeLeftInnerChange: (action: SwipeAction) => void;
onSwipeLeftOuterChange: (action: SwipeAction) => void;
onSwipeRightInnerChange: (action: SwipeAction) => void;
onSwipeRightOuterChange: (action: SwipeAction) => void;
```

Replace the Swipe Actions section UI with grouped dropdowns:

```tsx
{/* Swipe Actions */}
<div>
  <h3 className="text-sm font-medium text-neutral-900 dark:text-neutral-100 mb-1">
    Swipe Actions
  </h3>
  <p className="text-xs text-muted dark:text-dark-muted mb-4">
    Configure what swiping on link cards does on mobile. Partial swipe reveals both actions; full swipe triggers the outer action.
  </p>
  <div className="space-y-6 max-w-sm">
    <div>
      <h4 className="text-xs font-medium text-muted dark:text-dark-muted uppercase tracking-wide mb-2">Swipe Left</h4>
      <div className="space-y-3">
        <SwipeActionSelect label="Partial" value={swipeLeftInner} onChange={onSwipeLeftInnerChange} plugins={plugins} />
        <SwipeActionSelect label="Full swipe" value={swipeLeftOuter} onChange={onSwipeLeftOuterChange} plugins={plugins} />
      </div>
    </div>
    <div>
      <h4 className="text-xs font-medium text-muted dark:text-dark-muted uppercase tracking-wide mb-2">Swipe Right</h4>
      <div className="space-y-3">
        <SwipeActionSelect label="Partial" value={swipeRightInner} onChange={onSwipeRightInnerChange} plugins={plugins} />
        <SwipeActionSelect label="Full swipe" value={swipeRightOuter} onChange={onSwipeRightOuterChange} plugins={plugins} />
      </div>
    </div>
  </div>
</div>
```

**Step 4: Update all prop pass-throughs**

In AuthenticatedApp, update every `<LinkCard>` and `<SettingsView>` to pass the new 4 swipe props instead of the old 2. Search for `swipeLeftAction={` and `swipeRightAction={` and replace throughout.

For SettingsView:
```tsx
swipeLeftInner={swipeLeftInner}
swipeLeftOuter={swipeLeftOuter}
swipeRightInner={swipeRightInner}
swipeRightOuter={swipeRightOuter}
onSwipeLeftInnerChange={setSwipeLeftInner}
onSwipeLeftOuterChange={setSwipeLeftOuter}
onSwipeRightInnerChange={setSwipeRightInner}
onSwipeRightOuterChange={setSwipeRightOuter}
```

For each LinkCard:
```tsx
swipeLeftInner={swipeLeftInner}
swipeLeftOuter={swipeLeftOuter}
swipeRightInner={swipeRightInner}
swipeRightOuter={swipeRightOuter}
onSwipeAction={handleSwipeAction}
```

**Step 5: Verify frontend type-checks**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

**Step 6: Commit**

```bash
git add frontend/src/components/AuthenticatedApp.tsx frontend/src/components/LinkCard.tsx frontend/src/components/SettingsView.tsx
git commit -m "feat: expand swipe preferences from 2 to 4 configurable slots"
```

---

### Task 4: Rewrite useSwipe for two-tier reveal + full swipe

**Files:**
- Modify: `frontend/src/components/LinkCard.tsx` (useSwipe hook, swipe background rendering)

**Step 1: Rewrite useSwipe hook**

Replace the existing `useSwipe` function and constants (lines 178-257) with:

```typescript
const REVEAL_THRESHOLD = 60;
const FULL_SWIPE_THRESHOLD = 160;
const BUTTON_WIDTH = 72; // Width of each action button

type SwipeState = "idle" | "swiping" | "revealed";

function useSwipe(
  enabled: boolean,
  hasLeftActions: boolean,
  hasRightActions: boolean,
) {
  const startX = useRef(0);
  const startY = useRef(0);
  const currentOffset = useRef(0);
  const isSwiping = useRef(false);
  const [offset, setOffset] = useState(0);
  const [swipeState, setSwipeState] = useState<SwipeState>("idle");
  const [revealedDirection, setRevealedDirection] = useState<"left" | "right" | null>(null);
  const [fullSwipeTriggered, setFullSwipeTriggered] = useState<"left" | "right" | null>(null);

  const dismiss = useCallback(() => {
    setOffset(0);
    setSwipeState("idle");
    setRevealedDirection(null);
    currentOffset.current = 0;
  }, []);

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (!enabled) return;
      // If already revealed, a touch on the card area should dismiss
      if (swipeState === "revealed") {
        dismiss();
        return;
      }
      startX.current = e.touches[0].clientX;
      startY.current = e.touches[0].clientY;
      currentOffset.current = 0;
      isSwiping.current = false;
      setFullSwipeTriggered(null);
    },
    [enabled, swipeState, dismiss],
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!enabled || swipeState === "revealed") return;
      const dx = e.touches[0].clientX - startX.current;
      const dy = e.touches[0].clientY - startY.current;

      if (!isSwiping.current && Math.abs(dy) > Math.abs(dx)) return;
      isSwiping.current = true;

      // Constrain direction based on available actions
      let clamped = dx;
      if (clamped < 0 && !hasLeftActions) return;
      if (clamped > 0 && !hasRightActions) return;

      // Apply rubber-band effect past full swipe threshold
      const maxSwipe = FULL_SWIPE_THRESHOLD + 40;
      clamped = Math.max(-maxSwipe, Math.min(maxSwipe, clamped));

      currentOffset.current = clamped;
      setOffset(clamped);
      setSwipeState("swiping");
    },
    [enabled, swipeState, hasLeftActions, hasRightActions],
  );

  const onTouchEnd = useCallback(() => {
    if (!enabled || !isSwiping.current || swipeState === "revealed") return;

    const off = currentOffset.current;
    const absOff = Math.abs(off);
    const direction = off < 0 ? "left" : "right";

    if (absOff >= FULL_SWIPE_THRESHOLD) {
      // Full swipe — trigger outermost action
      setFullSwipeTriggered(direction);
      setTimeout(() => {
        dismiss();
        setFullSwipeTriggered(null);
      }, 200);
    } else if (absOff >= REVEAL_THRESHOLD) {
      // Partial swipe — snap open to reveal buttons
      const snapOffset = direction === "left" ? -(BUTTON_WIDTH * 2) : (BUTTON_WIDTH * 2);
      setOffset(snapOffset);
      currentOffset.current = snapOffset;
      setSwipeState("revealed");
      setRevealedDirection(direction);
    } else {
      // Below threshold — snap back
      dismiss();
    }

    isSwiping.current = false;
  }, [enabled, swipeState, dismiss]);

  return {
    offset,
    swipeState,
    revealedDirection,
    fullSwipeTriggered,
    dismiss,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
  };
}
```

**Step 2: Update the LinkCard component to use new hook**

Replace the existing swipe handler wiring and background rendering. The component needs to:

1. Determine which actions are active (inner/outer for each direction):

```typescript
const hasLeftActions = swipeLeftInner !== "none" || swipeLeftOuter !== "none";
const hasRightActions = swipeRightInner !== "none" || swipeRightOuter !== "none";

const {
  offset, swipeState, revealedDirection, fullSwipeTriggered, dismiss,
  onTouchStart, onTouchMove, onTouchEnd,
} = useSwipe(isMobile && !isSelectable, hasLeftActions, hasRightActions);
```

2. Handle full swipe trigger via useEffect:

```typescript
useEffect(() => {
  if (fullSwipeTriggered && onSwipeAction) {
    const action = fullSwipeTriggered === "left" ? swipeLeftOuter : swipeRightOuter;
    if (action !== "none") onSwipeAction(link, action);
  }
}, [fullSwipeTriggered, onSwipeAction, link, swipeLeftOuter, swipeRightOuter]);
```

3. Replace the swipe background layer with action buttons:

```tsx
{/* Swipe action buttons (mobile only) */}
{isMobile && (offset !== 0 || swipeState === "revealed") && (
  <div className="absolute inset-0 flex">
    {offset > 0 && (
      // Right swipe — buttons on left side
      <div className="flex h-full">
        <SwipeButton action={swipeRightOuter} plugins={plugins} onClick={() => { dismiss(); if (onSwipeAction && swipeRightOuter !== "none") onSwipeAction(link, swipeRightOuter); }} />
        <SwipeButton action={swipeRightInner} plugins={plugins} onClick={() => { dismiss(); if (onSwipeAction && swipeRightInner !== "none") onSwipeAction(link, swipeRightInner); }} />
      </div>
    )}
    {offset < 0 && (
      // Left swipe — buttons on right side, pushed to the right
      <div className="flex h-full ml-auto">
        <SwipeButton action={swipeLeftInner} plugins={plugins} onClick={() => { dismiss(); if (onSwipeAction && swipeLeftInner !== "none") onSwipeAction(link, swipeLeftInner); }} />
        <SwipeButton action={swipeLeftOuter} plugins={plugins} onClick={() => { dismiss(); if (onSwipeAction && swipeLeftOuter !== "none") onSwipeAction(link, swipeLeftOuter); }} />
      </div>
    )}
  </div>
)}
```

4. Add a `SwipeButton` helper component (above the LinkCard component):

```tsx
function SwipeButton({
  action,
  plugins,
  onClick,
}: {
  action: SwipeAction;
  plugins?: PluginInfo[];
  onClick: () => void;
}) {
  if (action === "none") return null;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center justify-center w-[72px] h-full text-white text-xs font-medium ${swipeActionBg(action)}`}
    >
      {swipeActionIcon(action, plugins)}
      <span className="mt-0.5">{swipeActionLabel(action, plugins)}</span>
    </button>
  );
}
```

5. During active swiping (not revealed), show the background colour hint for the full-swipe action:

When `swipeState === "swiping"` and `Math.abs(offset) >= FULL_SWIPE_THRESHOLD`, overlay the outermost action's colour behind the card as a visual hint that releasing will trigger it.

**Step 3: Update touch handlers on the card button element**

The `onTouchStart`, `onTouchMove`, `onTouchEnd` handlers also need to coordinate with the long-press handlers. They should be merged in the existing `onTouchStart` handler so that a swipe cancels the long-press timer (already done via `handleLongPressMove`) and the swipe gesture takes over.

**Step 4: Verify frontend type-checks**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

**Step 5: Manual test on mobile**

Test these scenarios:
- Partial swipe left → two buttons appear → tap inner → action fires
- Partial swipe left → two buttons appear → tap outer → action fires
- Partial swipe left → two buttons appear → tap card → dismisses
- Full swipe left → outer action fires automatically
- Same for right swipe
- Swipe with "none" actions → direction blocked

**Step 6: Commit**

```bash
git add frontend/src/components/LinkCard.tsx
git commit -m "feat: rewrite swipe to two-tier reveal with tappable action buttons"
```

---

### Task 5: Version bump + documentation

**Files:**
- Modify: `package.json:3` (version)
- Modify: `frontend/package.json:3` (version)
- Modify: `CLAUDE.md` (version reference)
- Modify: `README.md` (if it documents swipe or sort features)

**Step 1: Bump version**

In both `package.json` files, change `"version": "1.3.1"` to `"version": "1.3.2"`.

In `CLAUDE.md`, update the version line to `1.3.2`.

**Step 2: Update README if needed**

Check if README documents swipe behaviour or mentions sort. If so, update to reflect the new two-tier swipe and sort toggle.

**Step 3: Commit**

```bash
git add package.json frontend/package.json CLAUDE.md README.md
git commit -m "chore: bump version to 1.3.2"
```

---

### Task 6: Final verification

**Step 1: Run backend tests**

Run: `bun test`
Expected: All tests pass

**Step 2: Run frontend type check**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

**Step 3: Build Docker image**

Run: `docker compose build`
Expected: Builds successfully
