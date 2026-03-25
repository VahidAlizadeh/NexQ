import { useEffect, useCallback } from "react";
import { useMeetingStore } from "./stores/meetingStore";
import { useConfigStore } from "./stores/configStore";
import { useAIActionsStore } from "./stores/aiActionsStore";
import { LauncherView } from "./launcher/LauncherView";
import { OverlayView } from "./overlay/OverlayView";
import { SettingsOverlay } from "./settings/SettingsOverlay";
import { FirstRunWizard } from "./components/wizard/FirstRunWizard";
import { ToastContainer } from "./components/Toast";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { useTheme } from "./hooks/useTheme";
import { useGlobalShortcut } from "./hooks/useGlobalShortcut";
import { useTranslation } from "./hooks/useTranslation";
import { useTraySync } from "./hooks/useTraySync";
import { useTrayNotifications } from "./hooks/useTrayNotifications";
import { useTranslationStore } from "./stores/translationStore";
import { CallLogPanel } from "./calllog";
import { SelectionToolbar } from "./components/SelectionToolbar";
import { ActiveMeetingProvider } from "./components/ActiveMeetingProvider";
import { listen } from "@tauri-apps/api/event";
import type { AppView } from "./lib/types";

function App() {
  const currentView = useMeetingStore((s) => s.currentView);
  const settingsOpen = useMeetingStore((s) => s.settingsOpen);
  const setSettingsOpen = useMeetingStore((s) => s.setSettingsOpen);
  const setCurrentView = useMeetingStore((s) => s.setCurrentView);
  const startMeetingFlow = useMeetingStore((s) => s.startMeetingFlow);
  const loadRecentMeetings = useMeetingStore((s) => s.loadRecentMeetings);
  const firstRunCompleted = useConfigStore((s) => s.firstRunCompleted);
  const configLoaded = useConfigStore((s) => s._loaded);
  const loadConfig = useConfigStore((s) => s.loadConfig);

  // Wire up theme and global shortcuts
  useTheme();
  useGlobalShortcut();

  // Translation event subscriptions (needed for SelectionToolbar in all views)
  useTranslation();

  // Sync frontend state to system tray icon & menu
  useTraySync();

  // Tray notification toasts for meeting start/stop
  useTrayNotifications();

  // Load persisted config from Tauri store on app start
  useEffect(() => {
    loadConfig();
    useAIActionsStore.getState().loadConfigs();
    useTranslationStore.getState().loadConfig().then(() => {
      // Sync backend translation provider with persisted frontend setting
      const { provider } = useTranslationStore.getState();
      if (provider) {
        import("./lib/ipc").then(({ setTranslationProvider }) => {
          setTranslationProvider(provider).catch(() => { /* non-critical on startup */ });
        });
      }
    });
    // Load scenario config (custom scenarios, overrides, active scenario)
    import("./stores/scenarioStore").then(({ useScenarioStore }) => {
      useScenarioStore.getState().loadScenarioConfig();
    }).catch(() => { /* non-critical */ });
  }, [loadConfig]);

  // Load recent meetings on app start
  useEffect(() => {
    loadRecentMeetings();
  }, [loadRecentMeetings]);

  const previousView = useMeetingStore((s) => s.previousView);

  // Listen for Escape key to close settings
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (currentView === "settings") {
          // Return to the view settings was opened from
          setCurrentView(previousView || "launcher");
        } else if (settingsOpen) {
          setSettingsOpen(false);
        }
      }
    },
    [currentView, settingsOpen, setCurrentView, setSettingsOpen, previousView]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Listen for tray menu events from Rust backend
  useEffect(() => {
    const unlisteners: Array<() => void> = [];

    listen("tray_start_meeting", () => {
      startMeetingFlow().catch((err) => {
        console.error("[App] Tray start meeting failed:", err);
      });
    }).then((unlisten) => unlisteners.push(unlisten));

    listen("tray_open_settings", () => {
      if (currentView === "overlay") {
        setSettingsOpen(true);
      } else {
        setCurrentView("settings");
      }
    }).then((unlisten) => unlisteners.push(unlisten));

    listen("tray_stop_meeting", () => {
      useMeetingStore.getState().endMeetingFlow().catch((err) => {
        console.error("[App] Tray stop meeting failed:", err);
      });
    }).then((unlisten) => unlisteners.push(unlisten));

    listen("tray_toggle_mic", () => {
      useConfigStore.getState().toggleMuteYou();
    }).then((unlisten) => unlisteners.push(unlisten));

    listen("tray_toggle_system", () => {
      useConfigStore.getState().toggleMuteThem();
    }).then((unlisten) => unlisteners.push(unlisten));

    listen("tray_toggle_stealth", () => {
      const store = useMeetingStore.getState();
      const willHide = !store.overlayHidden;
      store.toggleOverlayHidden();
      // Hide/show overlay window and toggle capture stealth
      import("@tauri-apps/api/webviewWindow").then(({ WebviewWindow }) => {
        const overlay = WebviewWindow.getByLabel("overlay");
        if (overlay) {
          if (willHide) {
            overlay.hide().catch(() => {});
          } else {
            overlay.show().catch(() => {});
          }
        }
      }).catch(() => {});
      import("../lib/ipc").then(({ setStealthMode }) => {
        setStealthMode(willHide).catch((e) =>
          console.warn("[App] Failed to set stealth mode:", e)
        );
      }).catch(() => {});
    }).then((unlisten) => unlisteners.push(unlisten));

    listen("tray_show_overlay", () => {
      import("@tauri-apps/api/webviewWindow").then(async ({ WebviewWindow }) => {
        const overlay = await WebviewWindow.getByLabel("overlay");
        if (overlay) {
          await overlay.show().catch(() => {});
          await overlay.setFocus().catch(() => {});
        }
      }).catch(() => {});
    }).then((unlisten) => unlisteners.push(unlisten));

    listen<string>("tray_copy", (e) => {
      console.log("[App] Tray copy requested:", e.payload);
    }).then((unlisten) => unlisteners.push(unlisten));

    listen<string>("tray_open_meeting", (e) => {
      console.log("[App] Tray open meeting requested:", e.payload);
    }).then((unlisten) => unlisteners.push(unlisten));

    return () => {
      unlisteners.forEach((fn) => fn());
    };
  }, [startMeetingFlow, setSettingsOpen, setCurrentView, currentView]);

  // Don't render until config is loaded from disk — prevents false wizard trigger
  if (!configLoaded) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center">
            <div className="h-3 w-3 rounded-full bg-primary/40 animate-pulse" />
          </div>
          <div className="text-sm text-muted-foreground">Starting NexQ...</div>
        </div>
      </div>
    );
  }

  // Determine which view to render
  const resolvedView: AppView = !firstRunCompleted ? "wizard" : currentView;

  return (
    <div className="h-screen w-screen overflow-hidden bg-background text-foreground">
      <ErrorBoundary fallbackMessage="NexQ encountered an error">
        {resolvedView === "launcher" && (
          <ErrorBoundary fallbackMessage="Failed to load launcher">
            <LauncherView />
          </ErrorBoundary>
        )}
        {resolvedView === "overlay" && (
          <ErrorBoundary fallbackMessage="Failed to load overlay">
            <div className="flex h-full">
              <div className="flex-1 min-w-0 overflow-hidden">
                <OverlayView />
              </div>
              <CallLogPanel />
            </div>
          </ErrorBoundary>
        )}
        {resolvedView === "wizard" && (
          <ErrorBoundary fallbackMessage="Failed to load setup wizard">
            <FirstRunWizard />
          </ErrorBoundary>
        )}
        {resolvedView === "settings" && (
          <ErrorBoundary fallbackMessage="Failed to load settings">
            <SettingsOverlay />
          </ErrorBoundary>
        )}
        {/* Settings modal for overlay view (during meetings) */}
        {settingsOpen && resolvedView === "overlay" && <SettingsOverlay isModal />}
      </ErrorBoundary>
      {/* Runs transcription/timer/persistence hooks whenever a meeting is active,
          regardless of which view is displayed */}
      <ActiveMeetingProvider />
      <ToastContainer />
      <SelectionToolbar />
      {/* Call log panel is now integrated into the overlay flex layout above */}
    </div>
  );
}

export default App;
