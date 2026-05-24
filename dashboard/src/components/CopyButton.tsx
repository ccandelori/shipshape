import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  text: string;
  label?: string;
}

export function CopyButton({ text, label }: Props) {
  const [copied, setCopied] = useState(false);
  async function onClick() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success(label ? `Copied: ${label}` : 'Copied to clipboard');
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error('Copy failed');
    }
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 text-xs font-mono text-ink-400 hover:text-ink-700 transition-colors no-print"
    >
      {copied ? <Check size={12} className="text-coral-500" /> : <Copy size={12} />}
      {copied ? 'copied' : label ?? 'copy'}
    </button>
  );
}
