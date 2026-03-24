import { useState, useRef, useEffect } from "react";

const PALETTE = [
  { name: "White", value: "#e4e4e7" },
  { name: "Warm", value: "#d6d3d1" },
  { name: "Snow", value: "#f8fafc" },
  { name: "Cyan", value: "#67e8f9" },
  { name: "Sky", value: "#7dd3fc" },
  { name: "Amber", value: "#fbbf24" },
  { name: "Orange", value: "#fb923c" },
  { name: "Emerald", value: "#6ee7b7" },
  { name: "Lime", value: "#a3e635" },
  { name: "Rose", value: "#fda4af" },
  { name: "Pink", value: "#f9a8d4" },
  { name: "Lavender", value: "#c4b5fd" },
  { name: "Indigo", value: "#a5b4fc" },
];

interface ColorPickerButtonProps {
  value: string;
  onChange: (color: string) => void;
  label?: string;
}

export function ColorPickerButton({ value, onChange, label }: ColorPickerButtonProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 rounded px-1 py-0.5 hover:bg-accent/40 transition-colors"
        title={label || "Pick color"}
      >
        <div
          className="h-3 w-3 rounded-sm border border-white/20"
          style={{ backgroundColor: value }}
        />
        <svg className="h-2.5 w-2.5 text-muted-foreground/40" viewBox="0 0 12 12" fill="none">
          <path d="M3 5L6 8L9 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute bottom-full mb-2 left-0 z-[9999] rounded-lg border border-white/10 p-2 shadow-2xl"
          style={{ backgroundColor: '#131320' }}
        >
          <div className="grid grid-cols-5 gap-1">
            {PALETTE.map((c) => (
              <button
                key={c.value}
                onClick={() => { onChange(c.value); setOpen(false); }}
                className={`h-5 w-5 rounded-md border-2 transition-all hover:scale-110 ${
                  value === c.value
                    ? "border-white/70 ring-1 ring-white/30"
                    : "border-transparent hover:border-white/30"
                }`}
                style={{ backgroundColor: c.value }}
                title={c.name}
              />
            ))}
          </div>
          {/* Custom hex input */}
          <div className="mt-1.5 flex items-center gap-1 border-t border-white/5 pt-1.5">
            <span className="text-[0.55rem] text-muted-foreground/40">#</span>
            <input
              type="text"
              value={value.replace('#', '')}
              onChange={(e) => {
                const hex = e.target.value.replace('#', '');
                if (/^[0-9a-fA-F]{0,6}$/.test(hex)) {
                  if (hex.length === 6) onChange(`#${hex}`);
                }
              }}
              className="w-16 bg-transparent text-[0.6rem] text-foreground/70 outline-none font-mono"
              maxLength={6}
              placeholder="custom"
            />
          </div>
        </div>
      )}
    </div>
  );
}
