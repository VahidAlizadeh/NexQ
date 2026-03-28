import { useEffect } from 'react';
import { useDemoStore } from './demoStore';
import { exitDemo } from './demoEngine';

export function useDemoShortcut() {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && (e.key === 'D' || e.key === 'd')) {
        e.preventDefault();
        const state = useDemoStore.getState();
        if (state.isDemoActive) {
          exitDemo();
        } else if (state.pickerOpen) {
          state.closePicker();
        } else {
          state.openPicker();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}
