import { create } from "zustand";
import type { ActionItem } from "../lib/types";

interface ActionItemState {
  items: ActionItem[];

  addItem: (item: ActionItem) => void;
  toggleCompleted: (id: string) => void;
  removeItem: (id: string) => void;
  clearItems: () => void;
}

export const useActionItemStore = create<ActionItemState>((set) => ({
  items: [],

  addItem: (item) => {
    set((s) => ({ items: [...s.items, item] }));
  },

  toggleCompleted: (id) => {
    set((s) => ({
      items: s.items.map((item) =>
        item.id === id ? { ...item, completed: !item.completed } : item
      ),
    }));
  },

  removeItem: (id) => {
    set((s) => ({ items: s.items.filter((item) => item.id !== id) }));
  },

  clearItems: () => {
    set({ items: [] });
  },
}));
