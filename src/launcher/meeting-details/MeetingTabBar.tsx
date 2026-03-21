import type { Meeting } from "../../lib/types";
import { FileText, Sparkles, MessageSquare } from "lucide-react";

export type MeetingTab = "transcript" | "summary" | "ai";

interface MeetingTabBarProps {
  activeTab: MeetingTab;
  setActiveTab: (tab: MeetingTab) => void;
  meeting: Meeting;
}

export function MeetingTabBar({ activeTab, setActiveTab, meeting }: MeetingTabBarProps) {
  return (
    <div className="flex items-center gap-1 border-b border-border/15 px-5 py-1.5" role="tablist">
      <TabButton
        active={activeTab === "transcript"}
        onClick={() => setActiveTab("transcript")}
        icon={<FileText className="h-4 w-4" />}
        label="Transcript"
        count={meeting.transcript.length}
      />
      <TabButton
        active={activeTab === "summary"}
        onClick={() => setActiveTab("summary")}
        icon={<Sparkles className="h-4 w-4" />}
        label="Summary"
        indicator={!!meeting.summary}
      />
      <TabButton
        active={activeTab === "ai"}
        onClick={() => setActiveTab("ai")}
        icon={<MessageSquare className="h-4 w-4" />}
        label="AI Log"
        count={meeting.ai_interactions.length}
      />
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  count,
  indicator,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count?: number;
  indicator?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      role="tab"
      aria-selected={active}
      className={`relative flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-medium transition-all duration-200 cursor-pointer ${
        active
          ? "bg-primary/12 text-primary"
          : "text-muted-foreground/50 hover:bg-secondary/30 hover:text-muted-foreground"
      }`}
    >
      {/* Active indicator bar */}
      <span className={`absolute bottom-0 left-2 right-2 h-0.5 rounded-full transition-all duration-200 ${
        active ? "bg-primary scale-x-100" : "bg-transparent scale-x-0"
      }`} />
      {icon}
      {label}
      {count !== undefined && count > 0 && (
        <span className={`rounded-md px-1.5 py-0.5 text-xs tabular-nums font-semibold ${
          active ? "bg-primary/10 text-primary/80" : "bg-primary/5 text-muted-foreground/50"
        }`}>
          {count}
        </span>
      )}
      {indicator && (
        <span className="h-2 w-2 rounded-full bg-success" />
      )}
    </button>
  );
}
