// Renders a markdown source string with dashboard-styled components.
// Custom renderers (not Tailwind Typography) — we want the typography to
// match the dashboard palette and tokens precisely, not a generic prose theme.

import { useMemo } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import clsx from 'clsx';
import { Hash } from 'lucide-react';
import { repoLink } from '../../lib/repo';

interface Props {
  source: string;
  /**
   * Strip the first `# H1` heading from the source before rendering. Useful
   * when the surrounding card already shows a title and we don't want a
   * duplicate. Default: false.
   */
  stripFirstH1?: boolean;
  className?: string;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function textContent(node: unknown): string {
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textContent).join('');
  if (node && typeof node === 'object' && 'props' in node) {
    const props = (node as { props?: { children?: unknown } }).props;
    return textContent(props?.children);
  }
  return '';
}

const components: Components = {
  h1({ children }) {
    return (
      <h1 className="text-3xl font-bold text-ink-700 tracking-tight mt-8 mb-3 leading-tight first:mt-0">
        {children}
      </h1>
    );
  },
  h2({ children }) {
    const id = slugify(textContent(children));
    return (
      <h2
        id={id}
        className="group text-2xl font-bold text-ink-700 tracking-tight mt-10 mb-3 leading-tight scroll-mt-24"
      >
        <a href={`#${id}`} className="inline-flex items-center gap-2 hover:text-coral-500">
          {children}
          <Hash size={14} className="opacity-0 group-hover:opacity-100 transition-opacity no-print" />
        </a>
      </h2>
    );
  },
  h3({ children }) {
    const id = slugify(textContent(children));
    return (
      <h3
        id={id}
        className="text-lg font-semibold text-ink-700 mt-6 mb-2 leading-snug scroll-mt-24"
      >
        {children}
      </h3>
    );
  },
  h4({ children }) {
    return <h4 className="text-base font-semibold text-ink-600 mt-5 mb-2">{children}</h4>;
  },
  p({ children }) {
    return <p className="text-ink-600 leading-relaxed my-3">{children}</p>;
  },
  ul({ children }) {
    return <ul className="my-3 space-y-1.5 list-disc list-outside ml-5 text-ink-600 marker:text-coral-400">{children}</ul>;
  },
  ol({ children }) {
    return <ol className="my-3 space-y-1.5 list-decimal list-outside ml-5 text-ink-600 marker:text-ink-400 marker:font-mono marker:text-sm">{children}</ol>;
  },
  li({ children }) {
    return <li className="leading-relaxed pl-1">{children}</li>;
  },
  blockquote({ children }) {
    return (
      <blockquote className="my-4 pl-4 border-l-2 border-coral-500 bg-coral-50/60 py-2 pr-3 rounded-r-lg text-ink-600 italic">
        {children}
      </blockquote>
    );
  },
  hr() {
    return <hr className="my-8 border-t border-ink-100" />;
  },
  strong({ children }) {
    return <strong className="font-semibold text-ink-700">{children}</strong>;
  },
  em({ children }) {
    return <em className="italic text-ink-600">{children}</em>;
  },
  a({ children, href }) {
    const resolved = href ? repoLink(href) : '#';
    const isExternal = /^https?:/.test(resolved);
    return (
      <a
        href={resolved}
        target={isExternal ? '_blank' : undefined}
        rel={isExternal ? 'noreferrer' : undefined}
        className="text-coral-500 hover:text-coral-600 underline decoration-coral-200 underline-offset-2 hover:decoration-coral-500 transition-colors"
      >
        {children}
      </a>
    );
  },
  code({ className: cn, children }: { className?: string; children?: React.ReactNode }) {
    // react-markdown v9 no longer passes the `inline` prop. Detect fenced
    // code blocks via the `language-…` className that GFM attaches. The CSS
    // safety net in index.css (`.markdown-document pre code`) catches edge
    // cases like fenced blocks without a language tag.
    const isFenced = !!cn?.startsWith('language-');
    if (isFenced) {
      return (
        <code className={clsx('font-mono text-xs leading-relaxed text-ink-100', cn)}>
          {children}
        </code>
      );
    }
    return (
      <code className="px-1.5 py-0.5 rounded font-mono text-[0.85em] bg-cream-soft text-ink-700 ring-1 ring-inset ring-ink-100">
        {children}
      </code>
    );
  },
  pre({ children }) {
    return (
      <pre className="my-4 overflow-x-auto rounded-tile bg-ink-800 text-ink-100 p-4 ring-1 ring-inset ring-ink-700">
        {children}
      </pre>
    );
  },
  table({ children }) {
    return (
      <div className="my-4 overflow-x-auto -mx-2">
        <table className="w-full text-sm text-left mx-2">{children}</table>
      </div>
    );
  },
  thead({ children }) {
    return <thead className="border-b-2 border-ink-200 text-ink-700">{children}</thead>;
  },
  tbody({ children }) {
    return <tbody className="divide-y divide-ink-100">{children}</tbody>;
  },
  tr({ children }) {
    return <tr className="hover:bg-cream-soft/50 transition-colors">{children}</tr>;
  },
  th({ children, style }) {
    return (
      <th
        className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-ink-500"
        style={style}
      >
        {children}
      </th>
    );
  },
  td({ children, style }) {
    return (
      <td className="px-3 py-2 text-ink-600 align-top" style={style}>
        {children}
      </td>
    );
  },
  // GFM task list checkbox.
  input({ type, checked, disabled }) {
    if (type !== 'checkbox') return null;
    return (
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        readOnly
        className="mr-2 accent-coral-500 align-middle"
      />
    );
  },
  del({ children }) {
    return <del className="text-ink-400 line-through">{children}</del>;
  },
  img({ src, alt }) {
    if (!src) return null;
    return (
      <img
        src={src}
        alt={alt ?? ''}
        className="my-4 max-w-full rounded-tile ring-1 ring-inset ring-ink-100"
      />
    );
  },
};

export function MarkdownDocument({ source, stripFirstH1, className }: Props) {
  const text = useMemo(() => {
    if (!stripFirstH1) return source;
    return source.replace(/^\s*#\s+[^\n]*\n+/, '');
  }, [source, stripFirstH1]);

  return (
    <div className={clsx('markdown-document max-w-none', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
