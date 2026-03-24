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
  { name: "Peach", value: "#fdba74" },
  { name: "Teal", value: "#5eead4" },
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
        className="flex items-center gap-1 rounded-md px-1.5 py-1 hover:bg-white/5 transition-colors cursor-pointer"
        title={label || "Pick color"}
      >
        <div
          className="h-3.5 w-3.5 rounded border border-white/15"
          style={{ backgroundColor: value }}
        />
        <svg className="h-2 w-2 text-muted-foreground/35" viewBox="0 0 12 12" fill="none">
          <path d="M3 5L6 8L9 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-[9999] rounded-xl border border-white/8 p-3 shadow-2xl shadow-black/50"
          style={{ backgroundColor: '#0f0f1a' }}
        >
          {/* Color grid */}
          <div className="grid grid-cols-5 gap-2">
            {PALETTE.map((c) => (
              <button
                key={c.value}
                onClick={() => { onChange(c.value); setOpen(false); }}
                className={`h-6 w-6 rounded-lg transition-all duration-150 cursor-pointer ${
                  value === c.value
                    ? "ring-2 ring-white/50 ring-offset-1 ring-offset-[#0f0f1a] scale-105"
                    : "hover:scale-110 hover:ring-1 hover:ring-white/20"
                }`}
                style={{ backgroundColor: c.value }}
                title={c.name}
              />
            ))}
          </div>

          {/* Hex input */}
          <div className="mt-2.5 flex items-center gap-1.5 border-t border-white/6 pt-2">
            <div
              className="h-4 w-4 rounded border border-white/10 shrink-0"
              style={{ backgroundColor: value }}
            />
            <span className="text-[0.6rem] text-muted-foreground/30 font-mono">#</span>
            <input
              type="text"
              value={value.replace('#', '')}
              onChange={(e) => {
                const hex = e.target.value.replace('#', '');
                if (/^[0-9a-fA-F]{0,6}$/.test(hex)) {
                  if (hex.length === 6) onChange(`#${hex}`);
                }
              }}
              className="w-14 bg-transparent text-[0.65rem] text-foreground/60 outline-none font-mono tracking-wider"
              maxLength={6}
              placeholder="custom"
            />
          </div>
        </div>
      )}
    </div>
  );
}
