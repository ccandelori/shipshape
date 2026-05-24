import { useState, useRef, useEffect } from 'react';
import { Info } from 'lucide-react';

interface Props {
  title: string;
  body: string;
  source?: string;
}

export function InfoTooltip({ title, body, source }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-ink-400 hover:text-ink-700 transition-colors no-print"
        aria-label="Show details"
      >
        <Info size={14} />
      </button>
      {open && (
        <div className="absolute z-20 left-0 top-6 w-80 bg-cream rounded-tile shadow-tooltip p-4 text-sm animate-fade-in ring-1 ring-ink-100">
          <div className="font-semibold text-ink-700 mb-2">{title}</div>
          <p className="text-ink-500 leading-relaxed">{body}</p>
          {source && <div className="mt-3 label-mono">{source}</div>}
        </div>
      )}
    </div>
  );
}
