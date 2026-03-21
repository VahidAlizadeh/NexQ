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
    <div className="flex items-center gap-px bg-card/10 px-4 py-1">
      <TabButton
        active={activeTab === "transcript"}
        onClick={() => setActiveTab("transcript")}
        icon={<FileText className="h-3 w-3" />}
        label="Transcript"
        count={meeting.transcript.length}
      />
      <TabButton
        active={activeTab === "summary"}
        onClick={() => setActiveTab("summary")}
        icon={<Sparkles className="h-3 w-3" />}
        label="Summary"
        indicator={!!meeting.summary}
      />
      <TabButton
        active={activeTab === "ai"}
        onClick={() => setActiveTab("ai")}
        icon={<MessageSquare className="h-3 w-3" />}
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
      className={`flex items-center gap-1 rounded-md px-3 py-1 text-[11px] font-medium transition-all duration-150 cursor-pointer ${
        active
          ? "bg-primary/12 text-primary shadow-sm shadow-primary/5"
          : "text-muted-foreground/40 hover:bg-secondary/40 hover:text-muted-foreground/70"
      }`}
    >
      {icon}
      {label}
      {count !== undefined && count > 0 && (
        <span
          className={`ml-0.5 rounded px-1 text-[9px] tabular-nums ${
            active ? "bg-primary/10 text-primary/80" : "text-muted-foreground/30"
          }`}
        >
          {count}
        </span>
      )}
      {indicator && (
        <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-emerald-400" />
      )}
    </button>
  );
}
