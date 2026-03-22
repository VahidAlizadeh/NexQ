import type { Meeting } from "../../lib/types";
import { FileText, Sparkles, MessageSquare, Users, ListTodo, Bookmark } from "lucide-react";
import { ExportDropdown } from "./ExportDropdown";

export type MeetingTab = "transcript" | "summary" | "ai" | "speakers" | "actions" | "bookmarks";

interface MeetingTabBarProps {
  activeTab: MeetingTab;
  setActiveTab: (tab: MeetingTab) => void;
  meeting: Meeting;
}

export function MeetingTabBar({ activeTab, setActiveTab, meeting }: MeetingTabBarProps) {
  const actionCount = meeting.action_items?.length ?? 0;
  const bookmarkCount = meeting.bookmarks?.length ?? 0;
  const speakerCount = meeting.speakers?.length ?? 0;

  return (
    <div className="flex items-center gap-1 border-b border-border/20 px-3 py-1.5 overflow-x-auto" role="tablist">
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
      <TabButton
        active={activeTab === "speakers"}
        onClick={() => setActiveTab("speakers")}
        icon={<Users className="h-3.5 w-3.5" />}
        label="Speakers"
        count={speakerCount > 0 ? speakerCount : undefined}
      />
      <TabButton
        active={activeTab === "actions"}
        onClick={() => setActiveTab("actions")}
        icon={<ListTodo className="h-3.5 w-3.5" />}
        label="Actions"
        count={actionCount > 0 ? actionCount : undefined}
      />
      <TabButton
        active={activeTab === "bookmarks"}
        onClick={() => setActiveTab("bookmarks")}
        icon={<Bookmark className="h-3.5 w-3.5" />}
        label="Bookmarks"
        count={bookmarkCount > 0 ? bookmarkCount : undefined}
      />

      {/* Spacer + Export */}
      <div className="ml-auto flex items-center pl-2">
        <ExportDropdown meeting={meeting} />
      </div>
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
          ? "bg-primary/10 text-primary"
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
