// Keyboard shortcuts overlay. Opens on ? press; closes on Esc, backdrop
// click, or the close button.

import { useEffect } from 'react';
import { X } from 'lucide-react';
import { TAB_IDS } from '../tabs/types';
import { TAB_REGISTRY } from './Tabs/TabBar';

interface Props {
  open: boolean;
  onClose: () => void;
}

// macOS Cmd vs Windows/Linux Ctrl. Detected once at module load — affordances
// match the keyboard the user is currently on.
const isMac =
  typeof navigator !== 'undefined' && /mac|iphone|ipad|ipod/i.test(navigator.platform);
const MOD_KEY = isMac ? '⌘' : 'Ctrl';

interface Shortcut {
  keys: string[];
  description: string;
}

const TAB_SHORTCUTS: Shortcut[] = TAB_IDS.map((id, i) => ({
  keys: [MOD_KEY, String(i + 1)],
  description: `Switch to ${TAB_REGISTRY[id].label}`,
}));

const OTHER_SHORTCUTS: Shortcut[] = [
  { keys: ['?'], description: 'Show this shortcuts overlay' },
  { keys: ['Esc'], description: 'Close any open overlay or modal' },
];

export function ShortcutsCheatsheet({ open, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-ink-900/60 backdrop-blur-sm p-4 md:p-8 flex items-start justify-center no-print"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-title"
    >
      <div className="bg-cream rounded-card shadow-tile w-full max-w-md mt-16 md:mt-24">
        <header className="flex items-center justify-between px-5 py-3 border-b hairline border-b">
          <h2 id="shortcuts-title" className="text-lg font-bold text-ink-700">
            Keyboard shortcuts
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center w-7 h-7 rounded text-ink-500 hover:bg-cream-soft hover:text-ink-700"
            title="Close (Esc)"
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </header>

        <div className="p-5 space-y-5">
          <section>
            <div className="label-mono mb-2">Tabs</div>
            <ul className="space-y-2">
              {TAB_SHORTCUTS.map((s) => (
                <ShortcutRow key={s.description} shortcut={s} />
              ))}
            </ul>
          </section>
          <section>
            <div className="label-mono mb-2">Overlays</div>
            <ul className="space-y-2">
              {OTHER_SHORTCUTS.map((s) => (
                <ShortcutRow key={s.description} shortcut={s} />
              ))}
            </ul>
          </section>
        </div>

        <footer className="px-5 py-3 border-t hairline border-t text-xs text-ink-400">
          Press <Kbd>?</Kbd> any time to bring this back.
        </footer>
      </div>
    </div>
  );
}

function ShortcutRow({ shortcut }: { shortcut: Shortcut }) {
  return (
    <li className="flex items-center justify-between gap-4 text-sm">
      <span className="text-ink-600">{shortcut.description}</span>
      <span className="flex items-center gap-1 shrink-0">
        {shortcut.keys.map((k, i) => (
          <Kbd key={i}>{k}</Kbd>
        ))}
      </span>
    </li>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 rounded bg-ink-100 text-ink-700 font-mono text-[11px] font-semibold ring-1 ring-inset ring-ink-200">
      {children}
    </kbd>
  );
}
