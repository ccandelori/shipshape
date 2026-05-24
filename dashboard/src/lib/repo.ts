// Build URLs into the source repository.
// Handles GitLab's /-/blob/<ref>/<path> + /-/tree/<ref>/<path> patterns,
// and GitHub's /blob/<ref>/<path> + /tree/<ref>/<path> patterns.
//
// Convention: paths ending with `/` are treated as directories (tree),
// everything else as a file (blob).

import { snapshot } from '../data/snapshot';

const REF = 'master';

function isGitLab(repoUrl: string): boolean {
  return /(^|\.)gitlab\.|labs\.gauntletai\.com/.test(repoUrl);
}

export function repoLink(pathOrUrl: string): string {
  // Pass through fully-qualified URLs unchanged.
  if (/^https?:\/\//.test(pathOrUrl)) return pathOrUrl;

  const repoUrl = snapshot.repoUrl.replace(/\/+$/, '');
  const isDir = pathOrUrl.endsWith('/');
  const cleanPath = pathOrUrl.replace(/^\/+/, '').replace(/\/+$/, '');
  const prefix = isGitLab(repoUrl) ? '/-' : '';
  const kind = isDir ? 'tree' : 'blob';
  return `${repoUrl}${prefix}/${kind}/${REF}/${cleanPath}`;
}
