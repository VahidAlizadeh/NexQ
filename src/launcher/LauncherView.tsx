import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useMeetingStore } from "../stores/meetingStore";
import { useConfigStore } from "../stores/configStore";
import { useContextStore } from "../stores/contextStore";
import { useRagStore } from "../stores/ragStore";
import { searchMeetings, deleteMeeting } from "../lib/ipc";
import { showToast } from "../stores/toastStore";
import { RecentMeetings } from "./RecentMeetings";
import { MeetingDetails } from "./MeetingDetails";
import { FileUpload } from "../context/FileUpload";
import { ResourceCard } from "../context/ResourceCard";
import { TokenBudget } from "../context/TokenBudget";
import { TestSearchDialog } from "../context/TestSearchDialog";
import { NEXQ_VERSION, NEXQ_DEVELOPER } from "../lib/version";
import { ServiceStatusBar } from "../components/ServiceStatusBar";
import type { MeetingSummary } from "../lib/types";
import {
  Settings,
  Search,
  Mic,
  AlertTriangle,
  X,
  Loader2,
  Star,
  Trash2,
  Database,
  Zap,
  CheckCircle2,
  ArrowRight,
  Radio,
  Play,
  FlaskConical,
} from "lucide-react";

// ── Favorites (localStorage) ──

function useFavorites() {
  const [favorites, setFavorites] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem("nexq_favorites");
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });
  const toggleFavorite = useCallback((id: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      localStorage.setItem("nexq_favorites", JSON.stringify([...next]));
      return next;
    });
  }, []);
  return { favorites, toggleFavorite };
}

type MeetingFilter = "all" | "favorites" | "with_summary";

// ════════════════════════════════════════════════════════════════
//  NEXQ DASHBOARD
// ════════════════════════════════════════════════════════════════

export function LauncherView() {
  const setCurrentView = useMeetingStore((s) => s.setCurrentView);
  const recentMeetings = useMeetingStore((s) => s.recentMeetings);
  const loadRecentMeetings = useMeetingStore((s) => s.loadRecentMeetings);
  const startMeetingFlow = useMeetingStore((s) => s.startMeetingFlow);
  const endMeetingFlow = useMeetingStore((s) => s.endMeetingFlow);
  const activeMeeting = useMeetingStore((s) => s.activeMeeting);

  const resources = useContextStore((s) => s.resources);
  const removeFile = useContextStore((s) => s.removeFile);
  const loadResources = useContextStore((s) => s.loadResources);
  const refreshTokenBudget = useContextStore((s) => s.refreshTokenBudget);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<MeetingSummary[] | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<MeetingFilter>("all");
  const [showConflictPrompt, setShowConflictPrompt] = useState(false);
  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false);
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  const [ragStatus, setRagStatus] = useState<"idle" | "updating" | "done">("idle");
  const [showTestKB, setShowTestKB] = useState(false);

  const contextStrategy = useConfigStore((s) => s.contextStrategy);
  const indexStatus = useRagStore((s) => s.indexStatus);
  const isIndexing = useRagStore((s) => s.isIndexing);
  const indexStale = useRagStore((s) => s.indexStale);
  const isAutoIndexing = useRagStore((s) => s.isAutoIndexing);
  const refreshIndexStatus = useRagStore((s) => s.refreshIndexStatus);
  const rebuildIndex = useRagStore((s) => s.rebuildIndex);
  const autoRemoveFileIndex = useRagStore((s) => s.autoRemoveFileIndex);

  const { favorites, toggleFavorite } = useFavorites();
  const autoStartTriggered = useRef(false);

  useEffect(() => {
    loadRecentMeetings();
    loadResources();
    refreshTokenBudget();
    refreshIndexStatus();
    if (!autoStartTriggered.current) {
      autoStartTriggered.current = true;
      const { startOnLogin } = useConfigStore.getState();
      const { activeMeeting: am } = useMeetingStore.getState();
      if (startOnLogin && !am) startMeetingFlow();
    }
  }, [loadRecentMeetings, startMeetingFlow, loadResources, refreshTokenBudget, refreshIndexStatus]);

  // ── Handlers ──

  const handleStartMeeting = useCallback(async () => {
    if (activeMeeting) { setShowConflictPrompt(true); return; }
    setIsStarting(true);
    setStartError(null);
    try {
      await startMeetingFlow();
      showToast("Meeting started", "success");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to start meeting";
      setStartError(msg);
      showToast(msg, "error");
    } finally {
      setIsStarting(false);
    }
  }, [startMeetingFlow, activeMeeting]);

  const handleEndAndStartNew = useCallback(async () => {
    setShowConflictPrompt(false);
    setIsStarting(true);
    try {
      await endMeetingFlow();
      await startMeetingFlow();
      showToast("New meeting started", "success");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to start";
      setStartError(msg);
    } finally {
      setIsStarting(false);
    }
  }, [endMeetingFlow, startMeetingFlow]);

  const handleSearch = useCallback(async (query: string) => {
    setSearchQuery(query);
    if (!query.trim()) { setSearchResults(null); return; }
    try { setSearchResults(await searchMeetings(query)); } catch { setSearchResults(null); }
  }, []);

  const handleDeleteMeeting = useCallback(async (meetingId: string) => {
    try {
      await deleteMeeting(meetingId);
      await loadRecentMeetings();
      if (searchResults) setSearchResults((p) => p?.filter((m) => m.id !== meetingId) ?? null);
      showToast("Meeting deleted", "info");
    } catch { showToast("Failed to delete", "error"); }
  }, [loadRecentMeetings, searchResults]);

  const handleDeleteAll = useCallback(() => {
    setShowDeleteAllConfirm(true);
  }, []);

  const handleConfirmDeleteAll = useCallback(async () => {
    setIsDeletingAll(true);
    try {
      for (const m of recentMeetings) { try { await deleteMeeting(m.id); } catch {} }
      await loadRecentMeetings();
      showToast("All meetings deleted", "info");
    } finally {
      setIsDeletingAll(false);
      setShowDeleteAllConfirm(false);
    }
  }, [recentMeetings, loadRecentMeetings]);

  const handleRenameMeeting = useCallback(async () => { await loadRecentMeetings(); }, [loadRecentMeetings]);

  const handleSelectMeeting = useCallback((meetingId: string) => {
    if (activeMeeting?.id === meetingId) { setCurrentView("overlay"); return; }
    setSelectedMeetingId(meetingId);
  }, [activeMeeting, setCurrentView]);

  const handleRagUpdate = useCallback(async () => {
    setRagStatus("updating");
    try {
      await rebuildIndex();
      setRagStatus("done");
      setTimeout(() => setRagStatus("idle"), 3000);
    } catch (e) {
      setRagStatus("idle");
    }
  }, [rebuildIndex]);

  // ── Filtered meetings ──

  const displayedMeetings = useMemo(() => {
    let list = searchResults ?? recentMeetings;
    if (filter === "favorites") list = list.filter((m) => favorites.has(m.id));
    if (filter === "with_summary") list = list.filter((m) => m.has_summary);
    return list;
  }, [searchResults, recentMeetings, filter, favorites]);

  // ── Meeting Details view ──

  if (selectedMeetingId) {
    return (
      <div className="flex h-full flex-col bg-background">
        <MeetingDetails meetingId={selectedMeetingId} onBack={() => setSelectedMeetingId(null)} />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-background">
      {/* ═══ HEADER ═══ */}
      <header className="flex items-center justify-between px-5 py-3 border-b border-border/15">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600">
            <Mic className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="text-sm font-bold tracking-tight text-foreground">NexQ</span>
        </div>

        {/* Active meeting in header */}
        {activeMeeting && (
          <button
            onClick={() => setCurrentView("overlay")}
            className="group flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/5 pl-3 pr-2 py-1.5 transition-all hover:bg-emerald-500/10 hover:border-emerald-500/30 cursor-pointer"
          >
            <Radio className="h-3 w-3 text-emerald-400 animate-pulse" />
            <span className="text-[11px] font-medium text-emerald-300 max-w-[200px] truncate">
              {activeMeeting.title}
            </span>
            <span className="flex items-center gap-0.5 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-400">
              RETURN <ArrowRight className="h-2.5 w-2.5" />
            </span>
          </button>
        )}

        <button
          onClick={() => setCurrentView("settings")}
          className="rounded-lg p-2 text-muted-foreground/50 transition-colors hover:bg-secondary hover:text-foreground cursor-pointer"
          title="Settings (Ctrl+,)"
        >
          <Settings className="h-4 w-4" />
        </button>
      </header>

      {/* ═══ MAIN DASHBOARD ═══ */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── LEFT: MEETINGS SIDEBAR ── */}
        <div className="flex w-[280px] shrink-0 flex-col border-r border-border/10 bg-card/20">
          {/* Search */}
          <div className="px-3 pt-3 pb-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground/30" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder="Search..."
                className="w-full rounded-lg border border-border/20 bg-background/50 py-1.5 pl-7.5 pr-7 text-[11px] text-foreground placeholder:text-muted-foreground/30 focus:border-primary/30 focus:outline-none"
              />
              {searchQuery && (
                <button onClick={() => handleSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/30 hover:text-foreground cursor-pointer">
                  <X className="h-2.5 w-2.5" />
                </button>
              )}
            </div>
          </div>

          {/* Filters + Delete all */}
          <div className="flex items-center justify-between px-3 pb-2">
            <div className="flex items-center gap-0.5">
              {([
                { key: "all", label: "All" },
                { key: "favorites", label: "Starred" },
                { key: "with_summary", label: "Summary" },
              ] as const).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setFilter(key)}
                  className={`rounded px-1.5 py-0.5 text-[9px] font-medium transition-colors cursor-pointer ${
                    filter === key ? "bg-primary/10 text-primary" : "text-muted-foreground/40 hover:text-muted-foreground"
                  }`}
                >
                  {key === "favorites" && <Star className="mr-0.5 inline h-2 w-2" />}
                  {label}
                </button>
              ))}
            </div>
            {recentMeetings.length > 0 && (
              <button onClick={handleDeleteAll} className="rounded p-1 text-muted-foreground/20 hover:text-red-400 cursor-pointer" title="Delete all">
                <Trash2 className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* Count */}
          <div className="px-3 pb-1.5">
            <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/25">
              {displayedMeetings.length} meeting{displayedMeetings.length !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Scrollable meeting list */}
          <div className="flex-1 overflow-y-auto px-2 pb-2 scrollbar-thin scrollbar-thumb-border/15">
            <RecentMeetings
              meetings={displayedMeetings}
              onSelect={handleSelectMeeting}
              onDelete={handleDeleteMeeting}
              onRename={handleRenameMeeting}
              favorites={favorites}
              onToggleFavorite={toggleFavorite}
              activeMeetingId={activeMeeting?.id ?? null}
            />
          </div>
        </div>

        {/* ── RIGHT: CONTEXT + START ── */}
        <div className="flex flex-1 flex-col overflow-y-auto">
          <div className="mx-auto w-full max-w-lg space-y-4 px-6 py-5">

            {/* Start Meeting — innovative compact button */}
            <div className="flex flex-col items-center">
              <button
                onClick={handleStartMeeting}
                disabled={isStarting}
                className="group relative flex items-center gap-3 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 pl-5 pr-6 py-3.5 font-semibold text-white shadow-lg shadow-indigo-600/25 transition-all duration-200 hover:shadow-xl hover:shadow-indigo-600/35 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15 backdrop-blur-sm">
                  {isStarting
                    ? <Loader2 className="h-4.5 w-4.5 animate-spin" />
                    : <Play className="h-4 w-4 ml-0.5" fill="white" />
                  }
                </div>
                <div className="text-left">
                  <div className="text-sm font-bold tracking-tight">
                    {isStarting ? "Starting..." : "Start Meeting"}
                  </div>
                  <div className="text-[10px] font-normal text-white/50">
                    Ctrl+M
                  </div>
                </div>
              </button>

              {startError && (
                <div className="mt-2 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-1.5 text-[11px] text-red-400">
                  {startError}
                </div>
              )}
            </div>

            {/* Section label */}
            <div className="flex items-center gap-2 pt-1">
              <Database className="h-3 w-3 text-muted-foreground/30" />
              <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/30">
                Meeting Context
              </span>
              <div className="flex-1 border-t border-border/10" />
            </div>

            {/* Dropzone */}
            <FileUpload />

            {/* RAG buttons */}
            {resources.length > 0 && contextStrategy === "local_rag" && (
              <div className="space-y-2">
                {ragStatus === "idle" && (() => {
                  const hasIndex = (indexStatus?.total_chunks ?? 0) > 0;
                  // Only amber warning when RAG settings (chunk params, model) changed — not when files added/removed
                  const settingsStale = indexStale;
                  const isFirstBuild = !hasIndex;

                  return (
                    <button
                      onClick={handleRagUpdate}
                      className={`w-full rounded-lg border border-dashed px-3 py-2 text-[11px] font-medium transition-all cursor-pointer ${
                        settingsStale
                          ? "border-amber-500/40 bg-amber-500/5 text-amber-400 hover:bg-amber-500/10 hover:border-amber-500/60"
                          : isFirstBuild
                            ? "border-primary/25 bg-primary/5 text-primary/70 hover:bg-primary/10 hover:border-primary/40"
                            : "border-emerald-500/25 bg-emerald-500/5 text-emerald-400/70 hover:bg-emerald-500/10 hover:border-emerald-500/40"
                      }`}
                    >
                      {settingsStale ? (
                        <>
                          <AlertTriangle className="mr-1 inline h-3 w-3" />
                          Settings Changed — Rebuild Knowledge Base
                        </>
                      ) : isFirstBuild ? (
                        <>
                          <Zap className="mr-1 inline h-3 w-3" />
                          Build Knowledge Base
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="mr-1 inline h-3 w-3" />
                          Update Knowledge Base
                        </>
                      )}
                    </button>
                  );
                })()}
                {ragStatus === "updating" && (
                  <div className="flex items-center justify-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-400">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Building knowledge base...
                  </div>
                )}

                {/* Auto-indexing indicator (triggered by file add/remove) */}
                {isAutoIndexing && ragStatus === "idle" && (
                  <div className="flex items-center gap-2 rounded-lg border border-border/20 bg-accent/20 px-3 py-1.5 text-[10px] text-muted-foreground/70">
                    <Loader2 className="h-2.5 w-2.5 animate-spin" />
                    Indexing file...
                  </div>
                )}
                {ragStatus === "done" && (
                  <div className="flex items-center justify-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-[11px] text-emerald-400">
                    <CheckCircle2 className="h-3 w-3" />
                    Knowledge base updated
                  </div>
                )}

                {/* Test Knowledge Base button */}
                {(indexStatus?.total_chunks ?? 0) > 0 && ragStatus !== "updating" && (
                  <button
                    onClick={() => setShowTestKB(true)}
                    className="w-full rounded-lg border border-dashed border-border/30 bg-card/30 px-3 py-2 text-[11px] font-medium text-muted-foreground transition-all hover:bg-accent/30 hover:text-foreground hover:border-border/50 cursor-pointer"
                  >
                    <FlaskConical className="mr-1 inline h-3 w-3" />
                    Test Knowledge Base
                  </button>
                )}
              </div>
            )}

            {/* Token budget */}
            <TokenBudget />

            {/* Sources */}
            {resources.length > 0 && (
              <div>
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/30">
                  Sources ({resources.length})
                </div>
                <div className="space-y-2">
                  {resources.map((r) => (
                    <ResourceCard
                      key={r.id}
                      resource={r}
                      onRemove={(id) => {
                        removeFile(id);
                        if (contextStrategy === "local_rag") {
                          autoRemoveFileIndex(id);
                        }
                      }}
                    />
                  ))}
                </div>
              </div>
            )}

          </div>
        </div>
      </div>

      {/* ═══ FOOTER ═══ */}
      <footer className="flex items-center justify-between border-t border-border/15">
        <ServiceStatusBar />
        <div className="flex items-center gap-2 pr-5 text-[11px] text-muted-foreground/40">
          <span>&copy; {new Date().getFullYear()} {NEXQ_DEVELOPER}</span>
          <span className="text-muted-foreground/20">|</span>
          <span className="font-medium">NexQ v{NEXQ_VERSION}</span>
        </div>
      </footer>

      {/* ═══ TEST KNOWLEDGE BASE MODAL ═══ */}
      <TestSearchDialog isOpen={showTestKB} onClose={() => setShowTestKB(false)} />

      {/* ═══ DELETE ALL CONFIRMATION ═══ */}
      {showDeleteAllConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-[380px] rounded-2xl border border-border/40 bg-card p-5 shadow-2xl">
            <div className="mb-1 flex items-center gap-2">
              <Trash2 className="h-4.5 w-4.5 text-red-400" />
              <h3 className="text-sm font-semibold text-foreground">Delete All Meetings</h3>
            </div>
            <p className="mb-5 text-xs text-muted-foreground">
              This will permanently delete all <span className="font-semibold text-foreground">{recentMeetings.length}</span> meetings and their transcripts. This action cannot be undone.
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={handleConfirmDeleteAll}
                disabled={isDeletingAll}
                className="w-full rounded-xl bg-red-500 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-red-600 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
              >
                {isDeletingAll ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Deleting...
                  </span>
                ) : (
                  `Delete All ${recentMeetings.length} Meetings`
                )}
              </button>
              <button
                onClick={() => setShowDeleteAllConfirm(false)}
                disabled={isDeletingAll}
                className="w-full rounded-xl border border-border/40 bg-secondary/30 px-4 py-2 text-xs font-medium text-foreground transition-colors hover:bg-secondary/50 disabled:opacity-60 cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ CONFLICT MODAL ═══ */}
      {showConflictPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-[380px] rounded-2xl border border-border/40 bg-card p-5 shadow-2xl">
            <div className="mb-1 flex items-center gap-2">
              <AlertTriangle className="h-4.5 w-4.5 text-amber-500" />
              <h3 className="text-sm font-semibold text-foreground">Meeting in Progress</h3>
            </div>
            <p className="mb-5 text-xs text-muted-foreground">
              &ldquo;{activeMeeting?.title}&rdquo; is still active.
            </p>
            <div className="flex flex-col gap-2">
              <button onClick={handleEndAndStartNew} className="w-full rounded-xl bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 cursor-pointer">
                End Current & Start New
              </button>
              <button onClick={() => { setShowConflictPrompt(false); setCurrentView("overlay"); }} className="w-full rounded-xl border border-border/40 bg-secondary/30 px-4 py-2 text-xs font-medium text-foreground hover:bg-secondary/50 cursor-pointer">
                Return to Current Meeting
              </button>
              <button onClick={() => setShowConflictPrompt(false)} className="w-full rounded-xl px-4 py-1.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
