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
    <div className="flex gap-1.5 border-b border-border/10 px-6 py-2.5">
      <TabButton
        active={activeTab === "transcript"}
        onClick={() => setActiveTab("transcript")}
        icon={<FileText className="h-3.5 w-3.5" />}
        label="Transcript"
        count={meeting.transcript.length}
      />
      <TabButton
        active={activeTab === "summary"}
        onClick={() => setActiveTab("summary")}
        icon={<Sparkles className="h-3.5 w-3.5" />}
        label="Summary"
        indicator={!!meeting.summary}
      />
      <TabButton
        active={activeTab === "ai"}
        onClick={() => setActiveTab("ai")}
        icon={<MessageSquare className="h-3.5 w-3.5" />}
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
      className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-medium transition-colors duration-150 cursor-pointer ${
        active
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground/50 hover:bg-secondary hover:text-muted-foreground"
      }`}
    >
      {icon}
      {label}
      {count !== undefined && count > 0 && (
        <span
          className={`rounded-full px-1.5 text-[10px] ${
            active ? "bg-primary/10" : "bg-secondary"
          }`}
        >
          {count}
        </span>
      )}
      {indicator && (
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
      )}
    </button>
  );
}
