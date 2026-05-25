// Global keyboard shortcuts.
//
//   Cmd/Ctrl + 1..5  → switch tabs
//   ?                → toggle the shortcuts cheatsheet
//   Esc              → handled per-modal (already implemented in each)
//
// Skips when focus is in an input / textarea / contenteditable so we don't
// hijack normal typing.

import { useEffect } from 'react';
import { TAB_IDS, type TabId } from '../tabs/types';

interface Args {
  setActiveTab: (tab: TabId) => void;
  setCheatsheetOpen: (open: boolean) => void;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return false;
}

export function useKeyboardShortcuts({ setActiveTab, setCheatsheetOpen }: Args): void {
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      // Ignore when the user is typing.
      if (isTypingTarget(e.target)) return;
      // Ignore modifier-stacked weirdness.
      if (e.altKey) return;

      // Cmd/Ctrl + 1..5 → tab switch.
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey) {
        const digit = parseInt(e.key, 10);
        if (digit >= 1 && digit <= TAB_IDS.length) {
          e.preventDefault();
          const tab = TAB_IDS[digit - 1];
          if (tab) setActiveTab(tab);
          return;
        }
      }

      // ? → cheatsheet toggle (Shift+/ on most US keyboards).
      if (!e.metaKey && !e.ctrlKey && e.key === '?') {
        e.preventDefault();
        setCheatsheetOpen(true);
        return;
      }
    }

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setActiveTab, setCheatsheetOpen]);
}
