# Action Items System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace non-functional live action item detection with on-demand LLM extraction in past meeting pages, and clean up dead code from the overlay.

**Architecture:** Delete live detection pipeline (hook, panel, event listener). Add `ActionItemsExtraction` mode to intelligence engine. Create `useActionItemsExtraction` hook mirroring `useSummaryGeneration`. Rewrite `ActionItemsTab` with extraction button, results display, and completion toggles. Add individual update/delete IPC commands.

**Tech Stack:** TypeScript (React/Zustand), Rust (Tauri 2, rusqlite, LLM streaming)

**Spec:** `docs/superpowers/specs/2026-03-22-action-items-system-design.md`

**Depends on:** SP1 (Past Meeting Persistence Fix) must be implemented first.

---

### Task 1: Clean Up Live Meeting Action Items Code

**Files:**
- Delete: `src/hooks/useActionItemDetection.ts`
- Delete: `src/overlay/ActionItemsPanel.tsx`
- Modify: `src/overlay/OverlayView.tsx` (remove action items button + panel)
- Modify: `src/lib/events.ts` (remove `onActionItemDetected`)
- Modify: `src/stores/actionItemStore.ts` (simplify)

- [ ] **Step 1: Delete useActionItemDetection.ts**

Delete the file entirely.

- [ ] **Step 2: Delete ActionItemsPanel.tsx**

Delete the file entirely.

- [ ] **Step 3: Remove action items from OverlayView.tsx**

1. Remove import of `useActionItemDetection` and `ActionItemsPanel`
2. Remove the `useActionItemDetection()` hook call
3. Remove the `actionsOpen` state
4. Remove the header button (line 118): `<HeaderBtn icon={<ClipboardList ...} ... />`
5. Remove the `ActionItemsPanel` render block

- [ ] **Step 4: Remove onActionItemDetected from events.ts**

Find and remove the `onActionItemDetected` function export.

- [ ] **Step 5: Simplify actionItemStore.ts**

Remove any event subscription logic. Keep the basic state and actions (addItem, toggleCompleted, removeItem, clearItems) since `endMeetingFlow` still references the store.

- [ ] **Step 6: Verify both builds**

Run: `npm run build && cd src-tauri && cargo check`

- [ ] **Step 7: Commit**

```bash
git rm src/hooks/useActionItemDetection.ts src/overlay/ActionItemsPanel.tsx
git add src/overlay/OverlayView.tsx src/lib/events.ts src/stores/actionItemStore.ts
git commit -m "refactor: remove non-functional live action item detection from overlay"
```

---

### Task 2: Add ActionItemsExtraction Mode to Backend

**Files:**
- Modify: `src/lib/types.ts` (add IntelligenceMode variant)
- Modify: `src-tauri/src/intelligence/` (add prompt template)

- [ ] **Step 1: Add ActionItemsExtraction to IntelligenceMode**

In `src/lib/types.ts`, find the `IntelligenceMode` type and add `"ActionItemsExtraction"`.

- [ ] **Step 2: Add prompt template for action items extraction**

Read `src-tauri/src/intelligence/` to understand how prompt templates are registered. Add a new template for `ActionItemsExtraction` mode with:

**System prompt:** "You are an AI assistant that extracts action items from meeting transcripts. Return ONLY a JSON array with no other text."

**User prompt template:** Includes full transcript with speaker labels and timestamps, plus speaker list for assignee mapping. Specifies exact JSON schema: `[{ "text": string, "assignee_speaker_id": string|null, "timestamp_ms": number }]`

- [ ] **Step 3: Verify Rust builds**

Run: `cd src-tauri && cargo check`

- [ ] **Step 4: Commit**

```bash
git add src/lib/types.ts src-tauri/src/intelligence/
git commit -m "feat(actions): add ActionItemsExtraction mode with prompt template"
```

---

### Task 3: Add Individual Action Item IPC Commands

**Files:**
- Modify: `src-tauri/src/db/meetings.rs`
- Modify: `src-tauri/src/commands/meeting_commands.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/lib/ipc.ts`

- [ ] **Step 1: Add DB functions**

```rust
/// Update completion status of a single action item.
pub fn update_action_item_completed(
    conn: &Connection,
    item_id: &str,
    completed: bool,
) -> Result<(), DatabaseError> {
    conn.execute(
        "UPDATE meeting_action_items SET completed = ?1 WHERE id = ?2",
        params![completed as i32, item_id],
    )?;
    Ok(())
}

/// Delete a single action item.
pub fn delete_action_item(
    conn: &Connection,
    item_id: &str,
) -> Result<(), DatabaseError> {
    conn.execute(
        "DELETE FROM meeting_action_items WHERE id = ?1",
        params![item_id],
    )?;
    Ok(())
}
```

- [ ] **Step 2: Add command handlers and register them**

- [ ] **Step 3: Add IPC wrappers**

```typescript
export async function updateActionItem(itemId: string, completed: boolean): Promise<void> {
  await invoke("update_action_item", { itemId, completed });
}

export async function deleteActionItem(itemId: string): Promise<void> {
  await invoke("delete_action_item", { itemId });
}
```

- [ ] **Step 4: Verify both builds**

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/db/meetings.rs src-tauri/src/commands/meeting_commands.rs src-tauri/src/lib.rs src/lib/ipc.ts
git commit -m "feat(actions): add individual update/delete IPC commands for action items"
```

---

### Task 4: Create useActionItemsExtraction Hook

**Files:**
- Create: `src/hooks/useActionItemsExtraction.ts`

- [ ] **Step 1: Create the hook**

Read `src/hooks/useSummaryGeneration.ts` for the exact streaming pattern (event subscription, accumulation, completion). Mirror it for action items extraction:

1. Subscribe to `llm_stream_start`, `llm_stream_token`, `llm_stream_end`, `llm_stream_error` events
2. Filter by mode `"ActionItemsExtraction"`
3. Accumulate tokens into full response
4. On stream end: parse JSON defensively (strip markdown fences, find `[...]` array)
5. Generate `id: crypto.randomUUID()` and `completed: false` for each item
6. Save via `saveMeetingActionItems(meetingId, JSON.stringify(items))`
7. Call `onItemsExtracted` callback
8. Support `cancel()` via `cancel_generation` IPC

```typescript
interface ActionItemsExtraction {
  isExtracting: boolean;
  extract: () => Promise<void>;
  cancel: () => void;
  error: string | null;
}

export function useActionItemsExtraction(
  meeting: Meeting | null,
  onItemsExtracted: (items: ActionItem[]) => void
): ActionItemsExtraction { ... }
```

- [ ] **Step 2: Verify frontend builds**

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useActionItemsExtraction.ts
git commit -m "feat(actions): add useActionItemsExtraction hook mirroring summary generation pattern"
```

---

### Task 5: Rewrite ActionItemsTab

**Files:**
- Modify: `src/launcher/meeting-details/ActionItemsTab.tsx`
- Modify: `src/launcher/meeting-details/MeetingDetailsContainer.tsx`

- [ ] **Step 1: Rewrite ActionItemsTab**

Three states:
1. **No items + no extraction:** "Extract Action Items" button (disabled if no transcript or no LLM configured)
2. **Extracting:** Spinner + "Analyzing transcript..."
3. **Has items:** Checklist with completion toggles, assignee badges, timestamps. "Re-extract" button at top.

On completion toggle: call `updateActionItem` IPC, optimistic local update with rollback on failure.
On re-extract: confirm dialog, then re-run extraction (save overwrites existing).

- [ ] **Step 2: Wire extraction hook in MeetingDetailsContainer**

```typescript
const actionExtraction = useActionItemsExtraction(meeting, (items) => {
  setMeeting((prev) => prev ? { ...prev, action_items: items } : prev);
});
```

Pass `actionExtraction` to `ActionItemsTab`.

- [ ] **Step 3: Verify frontend builds**

- [ ] **Step 4: Commit**

```bash
git add src/launcher/meeting-details/ActionItemsTab.tsx src/launcher/meeting-details/MeetingDetailsContainer.tsx
git commit -m "feat(actions): rewrite ActionItemsTab with on-demand LLM extraction"
```

---

### Task 6: Version Bump and Manual Test

- [ ] **Step 1: Bump version in `src/lib/version.ts`**
- [ ] **Step 2: Full build verification**
- [ ] **Step 3: Commit**
- [ ] **Step 4: Manual test**

1. Open a past meeting with transcript
2. Go to Actions tab, click "Extract Action Items"
3. Verify extraction runs, results display as checklist
4. Toggle an item complete, verify persistence
5. Click "Re-extract", verify confirmation dialog and new results
