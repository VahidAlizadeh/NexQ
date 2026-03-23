# Past Meeting Search Bar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace hidden Ctrl+F floating search with always-visible search bar matching the live meeting transcript panel style.

**Architecture:** Replace `TranscriptSearch` component in `TranscriptView` with an inline always-visible search bar. Keep `useTranscriptSearch` hook unchanged — only UI changes.

**Tech Stack:** TypeScript, React, Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-03-22-past-meeting-search-bar-design.md`

---

### Task 1: Replace Floating Search with Always-Visible Bar

**Files:**
- Modify: `src/launcher/meeting-details/TranscriptView.tsx`
- Modify: `src/launcher/meeting-details/MeetingDetailsContainer.tsx`
- Delete: `src/launcher/meeting-details/TranscriptSearch.tsx`

- [ ] **Step 1: Read TranscriptView.tsx to understand current search integration**

Read the full file to locate:
- The `TranscriptSearch` import (line 4)
- Where `TranscriptSearch` is rendered (line 109)
- The scroll container and overall layout structure

- [ ] **Step 2: Replace TranscriptSearch with inline search bar**

In `TranscriptView.tsx`:

1. Remove the import of `TranscriptSearch` (line 4)
2. Add imports: `import { Search, ChevronUp, ChevronDown, X } from "lucide-react";`
3. Add an input ref: `const searchInputRef = useRef<HTMLInputElement>(null);`
4. Replace the `<TranscriptSearch search={search} />` render (line 109) with an always-visible bar:

```tsx
      {/* Always-visible search bar — matches live meeting TranscriptPanel style */}
      <div className="flex items-center gap-2 rounded-lg bg-muted/20 mx-1 mt-1 mb-1.5 px-2.5 py-1.5">
        <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
        <input
          ref={searchInputRef}
          type="text"
          value={search.query}
          onChange={(e) => search.setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              if (e.shiftKey) search.prevMatch();
              else search.nextMatch();
            }
          }}
          placeholder="Search transcript..."
          maxLength={200}
          aria-label="Search transcript"
          className="flex-1 bg-transparent text-xs text-foreground/90 placeholder:text-muted-foreground/50 outline-none"
        />
        {search.query && search.totalMatches > 0 && (
          <span className="shrink-0 text-xs tabular-nums font-medium text-muted-foreground/60">
            {search.currentMatchIndex + 1} of {search.totalMatches}
          </span>
        )}
        {search.query && search.totalMatches === 0 && (
          <span className="shrink-0 text-xs text-red-400/60">No matches</span>
        )}
        {search.query && (
          <div className="flex items-center gap-0.5 border-l border-border/20 pl-2">
            <button
              onClick={search.prevMatch}
              disabled={search.totalMatches === 0}
              className="rounded-md p-1 text-muted-foreground/50 hover:bg-secondary hover:text-foreground disabled:opacity-25 cursor-pointer"
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={search.nextMatch}
              disabled={search.totalMatches === 0}
              className="rounded-md p-1 text-muted-foreground/50 hover:bg-secondary hover:text-foreground disabled:opacity-25 cursor-pointer"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => search.setQuery("")}
              className="rounded-md p-1 text-muted-foreground/50 hover:bg-secondary hover:text-foreground cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
```

5. Export the `searchInputRef` or pass it via a callback so `MeetingDetailsContainer` can focus it.

- [ ] **Step 3: Update MeetingDetailsContainer Ctrl+F handler**

In `MeetingDetailsContainer.tsx`, change the Ctrl+F handler (lines 78-81) from `search.open()` to focusing the search input. Pass a `searchInputRef` or use a callback:

```typescript
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        if (activeTab === "transcript") {
          e.preventDefault();
          // Focus the always-visible search input instead of toggling visibility
          searchInputRef.current?.focus();
        }
      }
```

The simplest approach: add `onSearchFocus` callback prop to `TranscriptView`, pass a ref callback up.

- [ ] **Step 4: Delete TranscriptSearch.tsx**

Delete `src/launcher/meeting-details/TranscriptSearch.tsx` — no longer imported anywhere.

- [ ] **Step 5: Verify frontend builds**

Run: `npm run build`
Expected: Clean build, no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add src/launcher/meeting-details/TranscriptView.tsx src/launcher/meeting-details/MeetingDetailsContainer.tsx
git rm src/launcher/meeting-details/TranscriptSearch.tsx
git commit -m "feat(ui): replace hidden search overlay with always-visible search bar in past meeting transcript"
```

---

### Task 2: Version Bump

**Files:**
- Modify: `src/lib/version.ts`

- [ ] **Step 1: Bump version**

Update NEXQ_VERSION and NEXQ_BUILD_DATE. (If SP1 was just implemented and bumped to 2.2.0, bump to 2.2.1.)

- [ ] **Step 2: Commit**

```bash
git add src/lib/version.ts
git commit -m "chore: bump version for search bar improvement"
```
