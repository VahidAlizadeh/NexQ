import { useEffect, useRef } from "react";
import { Bookmark, BookmarkX, MessageSquarePlus, Copy } from "lucide-react";

interface TranscriptContextMenuProps {
  x: number;
  y: number;
  isBookmarked: boolean;
  onBookmark: () => void;
  onAddNote: () => void;
  onCopy: () => void;
  onClose: () => void;
}

export function TranscriptContextMenu({
  x, y, isBookmarked, onBookmark, onAddNote, onCopy, onClose,
}: TranscriptContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click or Escape
  useEffect(() => {
    const clickHandler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const escHandler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", clickHandler);
    document.addEventListener("keydown", escHandler);
    return () => {
      document.removeEventListener("mousedown", clickHandler);
      document.removeEventListener("keydown", escHandler);
    };
  }, [onClose]);

  const items = [
    {
      icon: isBookmarked ? <BookmarkX className="h-3.5 w-3.5" /> : <Bookmark className="h-3.5 w-3.5" />,
      label: isBookmarked ? "Remove Bookmark" : "Bookmark",
      onClick: () => { onBookmark(); onClose(); },
    },
    {
      icon: <MessageSquarePlus className="h-3.5 w-3.5" />,
      label: "Add Note",
      onClick: () => { onAddNote(); onClose(); },
    },
    {
      icon: <Copy className="h-3.5 w-3.5" />,
      label: "Copy Text",
      onClick: () => { onCopy(); onClose(); },
    },
  ];

  return (
    <div
      ref={ref}
      className="fixed z-50 w-44 rounded-lg border border-border/20 bg-card/95 py-1 shadow-xl backdrop-blur-xl"
      style={{ left: x, top: y }}
    >
      {items.map((item) => (
        <button
          key={item.label}
          onClick={item.onClick}
          className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-foreground/70 hover:bg-secondary/30 hover:text-foreground cursor-pointer"
        >
          <span className="text-muted-foreground/50">{item.icon}</span>
          {item.label}
        </button>
      ))}
    </div>
  );
}
