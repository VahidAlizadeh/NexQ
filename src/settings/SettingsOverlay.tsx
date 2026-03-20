import { useState, useCallback, useEffect, useRef } from "react";
import { useMeetingStore } from "../stores/meetingStore";
import { useConfigStore } from "../stores/configStore";
import { GeneralSettings } from "./GeneralSettings";
import { AboutSettings } from "./AboutSettings";
import { LLMSettings } from "./LLMSettings";
import { STTSettings } from "./STTSettings";
import { HotkeySettings } from "./HotkeySettings";
import { MeetingAudioSettings } from "./MeetingAudioSettings";
import {
  X,
  Brain,
  Mic,
  Keyboard,
  SlidersHorizontal,
  Info,
  Headphones,
  Wand2,
  ArrowLeft,
  Database,
} from "lucide-react";
import { ContextStrategySettings } from "./ContextStrategySettings";
import { AIActionsSettings } from "./AIActionsSettings";
import { Sparkles } from "lucide-react";

type SettingsTab = "meeting_audio" | "llm" | "ai_actions" | "context_strategy" | "stt" | "hotkeys" | "general" | "about";

const tabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
  { id: "meeting_audio", label: "Meeting Audio", icon: <Headphones className="h-4 w-4" /> },
  { id: "llm", label: "LLM", icon: <Brain className="h-4 w-4" /> },
  { id: "ai_actions", label: "AI Actions", icon: <Sparkles className="h-4 w-4" /> },
  { id: "context_strategy", label: "Context Strategy", icon: <Database className="h-4 w-4" /> },
  { id: "stt", label: "STT Keys", icon: <Mic className="h-4 w-4" /> },
  { id: "hotkeys", label: "Hotkeys", icon: <Keyboard className="h-4 w-4" /> },
  {
    id: "general",
    label: "General",
    icon: <SlidersHorizontal className="h-4 w-4" />,
  },
  { id: "about", label: "About", icon: <Info className="h-4 w-4" /> },
];

interface SettingsOverlayProps {
  isModal?: boolean;
}

export function SettingsOverlay({ isModal = false }: SettingsOverlayProps) {
  const setSettingsOpen = useMeetingStore((s) => s.setSettingsOpen);
  const setCurrentView = useMeetingStore((s) => s.setCurrentView);
  const previousView = useMeetingStore((s) => s.previousView);
  const [activeTab, setActiveTab] = useState<SettingsTab>("meeting_audio");
  const [isVisible, setIsVisible] = useState(false);
  const backdropRef = useRef<HTMLDivElement>(null);

  // Animate in on mount
  useEffect(() => {
    requestAnimationFrame(() => setIsVisible(true));
  }, []);

  // Close with animation (modal mode)
  const handleCloseModal = useCallback(() => {
    setIsVisible(false);
    setTimeout(() => setSettingsOpen(false), 150);
  }, [setSettingsOpen]);

  // Navigate back to the view settings was opened from
  const handleBack = useCallback(() => {
    setCurrentView(previousView || "launcher");
  }, [setCurrentView, previousView]);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isModal) {
          handleCloseModal();
        } else {
          handleBack();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isModal, handleCloseModal, handleBack]);

  // Close on click outside (modal only)
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (isModal && e.target === backdropRef.current) {
        handleCloseModal();
      }
    },
    [isModal, handleCloseModal]
  );

  const renderTabContent = () => {
    switch (activeTab) {
      case "meeting_audio":
        return <MeetingAudioSettings />;
      case "llm":
        return <LLMSettings />;
      case "ai_actions":
        return <AIActionsSettings />;
      case "context_strategy":
        return <ContextStrategySettings />;
      case "stt":
        return <STTSettings />;
      case "hotkeys":
        return <HotkeySettings />;
      case "general":
        return <GeneralSettings />;
      case "about":
        return <AboutSettings />;
    }
  };

  const handleRunWizard = useCallback(() => {
    if (isModal) {
      handleCloseModal();
      setTimeout(() => {
        useConfigStore.getState().setFirstRunCompleted(false);
      }, 200);
    } else {
      useConfigStore.getState().setFirstRunCompleted(false);
      setCurrentView("wizard");
    }
  }, [isModal, handleCloseModal, setCurrentView]);

  // Get label for current tab
  const currentTabLabel = tabs.find((t) => t.id === activeTab)?.label ?? "Settings";

  // Wider content area for two-column settings pages
  const contentMaxW = activeTab === "ai_actions" ? "max-w-4xl" : "max-w-2xl";

  // ─── Modal mode: render as overlay dialog ───
  if (isModal) {
    return (
      <div
        ref={backdropRef}
        onClick={handleBackdropClick}
        className={`fixed inset-0 z-50 flex items-center justify-center transition-all duration-150 ${
          isVisible
            ? "bg-black/60 backdrop-blur-sm"
            : "bg-black/0 backdrop-blur-none"
        }`}
      >
        <div
          className={`w-[640px] max-h-[520px] flex flex-col rounded-xl border border-border/50 bg-card shadow-2xl transition-all duration-150 ${
            isVisible
              ? "opacity-100 scale-100 translate-y-0"
              : "opacity-0 scale-95 translate-y-2"
          }`}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border/30 px-5 py-3.5">
            <h2 className="text-base font-semibold text-foreground">Settings</h2>
            <div className="flex items-center gap-1">
              <button
                onClick={handleRunWizard}
                className="rounded-lg p-1.5 text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground"
                title="Run Setup Wizard"
                aria-label="Run setup wizard"
              >
                <Wand2 className="h-4 w-4" />
              </button>
              <button
                onClick={handleCloseModal}
                className="rounded-lg p-1.5 text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground"
                title="Close (Esc)"
                aria-label="Close settings"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="flex border-b border-border/30 px-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3.5 py-2.5 text-sm transition-all duration-150 ${
                  activeTab === tab.id
                    ? "border-b-2 border-primary text-foreground"
                    : "border-b-2 border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto p-5">{renderTabContent()}</div>
        </div>
      </div>
    );
  }

  // ─── Full-page mode: sidebar + content ───
  return (
    <div className="flex h-full w-full bg-background">
      {/* Sidebar */}
      <aside className="flex w-56 shrink-0 flex-col border-r border-border/30 bg-card/50">
        {/* Logo / Back */}
        <div className="flex items-center gap-3 border-b border-border/20 px-4 py-4">
          <button
            onClick={handleBack}
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            title="Back to Launcher"
            aria-label="Back to launcher"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back</span>
          </button>
        </div>

        {/* Heading */}
        <div className="px-5 pt-5 pb-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
            Settings
          </h2>
        </div>

        {/* Nav Items */}
        <nav className="flex-1 space-y-0.5 px-3 py-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150 ${
                activeTab === tab.id
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </nav>

        {/* Bottom: Wizard re-run */}
        <div className="border-t border-border/20 px-3 py-3">
          <button
            onClick={handleRunWizard}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
            title="Run Setup Wizard"
            aria-label="Run setup wizard"
          >
            <Wand2 className="h-4 w-4" />
            <span>Run Setup Wizard</span>
          </button>
        </div>
      </aside>

      {/* Content Area */}
      <main className="flex-1 overflow-y-auto">
        <div className={`mx-auto ${contentMaxW} px-8 py-8`}>
          {/* Section Heading */}
          <div className="mb-8">
            <h1 className="text-xl font-semibold text-foreground">{currentTabLabel}</h1>
            <div className="mt-2 h-px bg-border/30" />
          </div>

          {/* Tab Content */}
          <div className="transition-opacity duration-150">{renderTabContent()}</div>
        </div>
      </main>
    </div>
  );
}
