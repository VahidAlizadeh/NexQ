import { useDemoStore } from './demoStore';
import { exitDemo } from './demoEngine';

export function DemoBadge() {
  const isDemoActive = useDemoStore((s) => s.isDemoActive);

  if (!isDemoActive) return null;

  return (
    <button
      onClick={exitDemo}
      className="fixed bottom-4 right-4 z-[100] rounded-full bg-destructive/20 border border-destructive/30 px-3 py-1.5 cursor-pointer transition-colors duration-150 hover:bg-destructive/30"
      title="Exit demo mode (Ctrl+Shift+D)"
      aria-label="Exit demo mode"
    >
      <span className="text-[10px] font-bold text-destructive tracking-wider uppercase select-none">
        EXIT DEMO
      </span>
    </button>
  );
}
