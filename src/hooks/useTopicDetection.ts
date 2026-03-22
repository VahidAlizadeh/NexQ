// Hook: listen for topic_detected events from the Rust backend
// and route them to the topicSectionStore.
// The backend will emit these events once live topic detection is implemented;
// this hook is ready to receive them.

import { useEffect, useRef } from "react";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { onTopicDetected } from "../lib/events";
import { useTopicSectionStore } from "../stores/topicSectionStore";
import type { TopicSection } from "../lib/types";

export function useTopicDetection() {
  const addSection = useTopicSectionStore((s) => s.addSection);
  const addRef = useRef(addSection);

  useEffect(() => {
    addRef.current = addSection;
  }, [addSection]);

  useEffect(() => {
    let unlisten: UnlistenFn | null = null;
    let mounted = true;

    const setup = async () => {
      const fn = await onTopicDetected((topic: TopicSection) => {
        if (!mounted) return;
        addRef.current(topic);
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
