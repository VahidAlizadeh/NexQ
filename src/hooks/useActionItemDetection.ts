// Hook: listen for action_item_detected events from the Rust backend
// and route them to the actionItemStore.
// The backend will emit these events once live action item detection is implemented;
// this hook is ready to receive them.

import { useEffect, useRef } from "react";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { onActionItemDetected } from "../lib/events";
import { useActionItemStore } from "../stores/actionItemStore";
import type { ActionItem } from "../lib/types";

export function useActionItemDetection() {
  const addItem = useActionItemStore((s) => s.addItem);
  const addRef = useRef(addItem);

  useEffect(() => {
    addRef.current = addItem;
  }, [addItem]);

  useEffect(() => {
    let unlisten: UnlistenFn | null = null;
    let mounted = true;

    const setup = async () => {
      const fn = await onActionItemDetected((item: ActionItem) => {
        if (!mounted) return;
        addRef.current(item);
      });

      if (mounted) {
        unlisten = fn;
      } else {
        fn();
      }
    };

    setup();

    return () => {
      mounted = false;
      if (unlisten) unlisten();
    };
  }, []);
}
