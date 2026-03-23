# Action Items System — Design Spec

## Problem

Action item detection is not implemented. The frontend plumbing exists (store, event listener, panel UI) but no backend code detects or emits action items. The live meeting Action Items button and panel are non-functional.

## Dependency

**Requires SP1 (Past Meeting Persistence Fix) to be implemented first.** This spec assumes action items are already loading correctly via the extended `get_meeting`.

## Design

### Approach: On-Demand LLM Extraction

Action items are extracted post-meeting via LLM, not detected live. This mirrors the Summary tab pattern:
- Lower cost (single LLM call vs many during meeting)
- Better quality (full transcript context)
- Proven UX pattern (user already familiar with Summary tab)

Bookmarks + notes (SP2) cover the "mark something important during meeting" use case.

### Live Meeting Cleanup

Remove action items from the live meeting overlay:

- **`src/overlay/OverlayView.tsx`**: Remove Action Items header button (`ClipboardList` icon toggle) and `ActionItemsPanel` rendering. Frees header slot for bookmark panel toggle (SP2).
- **`src/hooks/useActionItemDetection.ts`**: Delete entirely — no backend emits `action_item_detected` events, and with on-demand approach, none ever will.
- **`src/overlay/ActionItemsPanel.tsx`**: Delete — no longer used in live meeting. Past meeting uses `ActionItemsTab` instead.
- **`src/stores/actionItemStore.ts`**: Keep but simplify — remove event subscription logic. Only needed for `endMeetingFlow` compatibility (persists empty array). Can be fully removed in a future cleanup once `endMeetingFlow` is updated to skip action items persistence when empty.
- **`src/lib/events.ts`**: Remove `onActionItemDetected` listener function.

### Actions Tab — Post-Meeting Extraction

**File:** `src/launcher/meeting-details/ActionItemsTab.tsx` (rewrite)

**Initial state (no action items):**
- Centered "Extract Action Items" button with sparkle icon
- Subtitle: "AI will analyze the full transcript to find action items, assignments, and follow-ups"
- Disabled if transcript is empty

**Extraction in progress:**
- Button replaced with spinner + "Analyzing transcript..."
- Progress is indeterminate (single LLM call)

**Results displayed:**
- Checklist layout with each action item showing:
  - Checkbox (toggle completion)
  - Action item text
  - Assignee badge (speaker name + color dot, or "Unassigned")
  - Approximate timestamp reference (relative to meeting start)
- Completion progress bar at top (X of Y completed)
- "Re-extract" button to run extraction again (replaces previous results)

**Empty extraction result:**
- "No action items found in this transcript."
- "Re-extract" button still available

### Extraction Hook

**New file:** `src/hooks/useActionItemsExtraction.ts`

Follows the `useSummaryGeneration` pattern:

```typescript
interface ActionItemsExtraction {
  isExtracting: boolean;
  extract: () => Promise<void>;
  cancel: () => void;          // Cancel in-progress extraction
  error: string | null;
}

function useActionItemsExtraction(
  meeting: Meeting | null,
  onItemsExtracted: (items: ActionItem[]) => void
): ActionItemsExtraction;
```

**LLM invocation:** Uses existing `generate_assist` IPC command with a new `IntelligenceMode`:
- Add `"ActionItemsExtraction"` to `IntelligenceMode` in `src/lib/types.ts` and the corresponding Rust enum
- Register a prompt template for this mode in `src-tauri/src/intelligence/` (system prompt defines extraction behavior, user prompt contains transcript)
- The extraction button is disabled when any other generation is active (summary, assist, etc.) — check `isOtherStreaming` pattern from `SummaryView`

**Extraction flow:**
1. Build prompt with full transcript text, speaker names, and meeting context
2. Call `generate_assist` with mode `"ActionItemsExtraction"` — subscribes to `llm_stream_start`, `llm_stream_token`, `llm_stream_end`, `llm_stream_error` events
3. Accumulate full response from stream tokens (indeterminate spinner — no streaming display)
4. On `llm_stream_end`: parse accumulated text into `ActionItem[]` with defensive JSON extraction (strip markdown fences, find first `[` and last `]`, handle malformed responses)
5. Generate `id: crypto.randomUUID()` and set `completed: false` for each extracted item
6. Save to DB via existing `saveMeetingActionItems(meetingId, JSON.stringify(items))`
7. Call `onItemsExtracted` callback to update local state
8. On parse failure: show "Couldn't parse action items from AI response. Try again." error

**Re-extraction:** Uses `saveMeetingActionItems` which already deletes existing items before inserting (atomic replace). No separate `clear` command needed.

### LLM Prompt

The extraction prompt should instruct the LLM to return structured JSON:

```
Analyze the following meeting transcript and extract all action items, tasks, follow-ups, and commitments made by participants.

For each action item, provide:
- "text": Clear description of the action item
- "assignee_speaker_id": The speaker_id of the person responsible (from the speaker list), or null if unclear
- "timestamp_ms": Approximate timestamp in the transcript where the action item was discussed

Speaker list: [speaker_id: display_name, ...]

Transcript:
[full transcript with timestamps and speaker labels]

Return ONLY a JSON array (no other text). Each element must have exactly these fields:
- "text": string - Clear description of the action item
- "assignee_speaker_id": string | null - Speaker ID from the list above, or null if unclear
- "timestamp_ms": number - Approximate timestamp in milliseconds where the action was discussed
```

The prompt references actual speaker IDs so the extracted `assignee_speaker_id` can map directly to the speaker data. The system prompt enforces JSON-only output to reduce parsing issues.

### IPC Commands (New)

```rust
// Update completion status of a single action item
update_action_item(item_id: String, completed: bool) -> Result<(), String>

// Delete a single action item
delete_action_item(item_id: String) -> Result<(), String>
```

Note: `clear_meeting_action_items` is not needed — `save_meeting_action_items` already does DELETE + INSERT atomically. Re-extraction just calls `saveMeetingActionItems` with the new items.

Frontend typed wrappers added to `src/lib/ipc.ts`.

### Local State Management

After extraction or completion toggle, update the local `meeting` state in `MeetingDetailsContainer`:
- Extraction: `setMeeting(prev => ({ ...prev, action_items: extractedItems }))`
- Toggle: `setMeeting(prev => ({ ...prev, action_items: prev.action_items.map(a => a.id === id ? { ...a, completed } : a) }))`
- Same optimistic update pattern as bookmarks (SP2). If `update_action_item` IPC fails, revert the toggle locally.

### Files Affected

**New files:**
- `src/hooks/useActionItemsExtraction.ts` — extraction hook (mirrors useSummaryGeneration)

**Deleted files:**
- `src/hooks/useActionItemDetection.ts` — no longer needed
- `src/overlay/ActionItemsPanel.tsx` — no longer used in live meeting

**Modified files:**
- `src/lib/types.ts` — add `"ActionItemsExtraction"` to `IntelligenceMode`
- `src/overlay/OverlayView.tsx` — remove Action Items header button and panel
- `src/stores/actionItemStore.ts` — simplify (remove event subscription)
- `src/lib/events.ts` — remove `onActionItemDetected` listener
- `src/launcher/meeting-details/ActionItemsTab.tsx` — rewrite with extraction button, results display, completion toggles
- `src/launcher/meeting-details/MeetingDetailsContainer.tsx` — wire up extraction hook, state updates
- `src/lib/ipc.ts` — add update/delete action item wrappers
- `src-tauri/src/db/meetings.rs` — add update/delete functions
- `src-tauri/src/commands/meeting_commands.rs` — add command handlers
- `src-tauri/src/intelligence/` — add prompt template for `ActionItemsExtraction` mode
- `src-tauri/src/lib.rs` — register new commands
- `src/lib/version.ts` — version bump

## Edge Cases

- **No LLM configured:** Extraction button disabled with tooltip "Configure an LLM provider in Settings to extract action items."
- **LLM call fails:** Error message displayed inline, "Retry" button available.
- **Empty transcript:** Extraction button disabled.
- **Re-extraction:** Warns user "This will replace X existing action items. Continue?" before proceeding.
- **Completion persistence:** Toggle completion calls IPC immediately (no debounce needed — binary state).
- **Meetings before SP1 fix:** Old meetings have no action_items in DB. Actions tab shows extraction button (fresh extraction).
- **Speaker mapping:** If LLM returns a speaker_id that doesn't exist in saved speakers, display as "Unassigned" rather than crashing.
- **Concurrent generation:** Extraction button disabled when any other LLM generation is active (summary, assist, etc.). Uses same `isOtherStreaming` guard pattern as `SummaryView`.
- **Invalid JSON response:** Show "Couldn't parse action items from AI response. Try again." with Retry button. Distinct from API failure error.
- **Long transcripts:** Same limitation as summary generation — full transcript sent. If it exceeds context window, the LLM returns a truncated or error response, handled by the error state.

## Out of Scope

- Live detection during meeting (decided against — bookmarks cover the "mark important things" use case)
- Action item assignment to people outside the meeting
- Due dates or priority levels (keep it simple — just text + assignee + completion)
- Action item notifications or reminders
