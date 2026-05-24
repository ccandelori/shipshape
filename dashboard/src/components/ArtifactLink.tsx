import { FileText, FileJson, FileCode, Globe, Image as ImageIcon } from 'lucide-react';
import type { ArtifactLink as ArtifactLinkType } from '../data/types';
import { repoLink } from '../lib/repo';

const KIND_ICON = {
  markdown: FileText,
  text: FileText,
  json: FileJson,
  html: Globe,
  image: ImageIcon,
  external: Globe,
} as const;

interface Props {
  artifact: ArtifactLinkType;
}

export function ArtifactLink({ artifact }: Props) {
  const Icon = KIND_ICON[artifact.kind] ?? FileCode;
  const href = repoLink(artifact.href);
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-chip bg-cream-soft hover:bg-cream ring-1 ring-inset ring-ink-100 hover:ring-ink-200 text-sm text-ink-600 hover:text-ink-700 transition-colors"
    >
      <Icon size={13} className="text-ink-400" />
      {artifact.label}
    </a>
  );
}
