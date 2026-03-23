# Past Meeting Search Bar — Design Spec

## Problem

Past meeting transcript search is hidden behind Ctrl+F, appearing as a floating overlay. The live meeting has an always-visible search bar at the top of the transcript. This inconsistency makes search undiscoverable in past meeting pages.

## Dependency

None — can be implemented independently.

## Design

### Replace Floating Search with Always-Visible Bar

**File:** `src/launcher/meeting-details/TranscriptView.tsx`

Replace the floating `TranscriptSearch` component (absolute positioned, toggled by `search.isOpen`) with an always-visible search bar matching the live meeting's `TranscriptPanel` style.

**Bar design (matches live meeting):**
```tsx
<div className="flex items-center gap-2 rounded-lg bg-muted/20 mx-1 mt-1 mb-1.5 px-2.5 py-1.5">
  <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
  <input
    type="text"
    value={search.query}
    onChange={(e) => search.setQuery(e.target.value)}
    placeholder="Search transcript..."
    maxLength={200}
    className="flex-1 bg-transparent text-xs text-foreground/90 placeholder:text-muted-foreground/50 outline-none"
  />
  {/* Match count + navigation + clear */}
</div>
```

**Enhancements over live meeting bar:**
- Add prev/next match buttons (ChevronUp/ChevronDown) — past meetings have more data, so navigating between matches is more useful than just filtering
- Match counter shows "X of Y" (current match position) when navigating
- Enter/Shift+Enter for next/prev match (keyboard navigation)
- Clear button (X) resets query

**Ctrl+F behavior change:**
- No longer toggles visibility (bar is always visible)
- Instead, focuses the search input — same effect, more discoverable

### File Changes

**Modified files:**
- `src/launcher/meeting-details/TranscriptView.tsx` — replace `TranscriptSearch` import with inline always-visible bar
- `src/launcher/meeting-details/MeetingDetailsContainer.tsx` — simplify Ctrl+F handler to just focus the input ref (remove `search.open()` toggle)
- `src/lib/version.ts` — version bump

**Deleted files:**
- `src/launcher/meeting-details/TranscriptSearch.tsx` — no longer needed (inline bar replaces it)

Note: The `useTranscriptSearch` hook stays unchanged — only the UI layer changes.
