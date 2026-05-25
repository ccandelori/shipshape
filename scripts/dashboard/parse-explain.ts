// Parser for Postgres EXPLAIN ANALYZE VERBOSE output.
// Walks the indented operator tree, captures cost/actual/rows per node,
// emits a structured tree we can render in the dashboard.
//
// Run from scripts/dashboard/snapshot.ts at build time; emits per-flow
// JSON into dashboard/data/db-plans/flow-{N}.json.

import fs from 'node:fs';
import path from 'node:path';

interface PlanNode {
  name: string;
  /** Optional relation/index (e.g. "documents d", "idx_documents_document_type"). */
  detail: string | null;
  cost: { startup: number; total: number; rows: number; width: number } | null;
  actual: { startupMs: number; totalMs: number; rows: number; loops: number } | null;
  /** Indent level (in spaces) relative to the file. */
  depth: number;
  /** Attribute lines (Filter:, Buffers:, Output: …) without the operator line. */
  attrs: string[];
  children: PlanNode[];
}

interface PlanFile {
  title: string;
  capturedAt: string | null;
  planningTimeMs: number | null;
  executionTimeMs: number | null;
  root: PlanNode | null;
}

// Match an operator line:
//   "Sort  (cost=131.52..131.60 rows=32 width=481) (actual time=0.248..0.250 rows=32 loops=1)"
//   "Bitmap Heap Scan on documents d  (cost=4.40..39.79 rows=32 width=437) (actual time=0.009..0.015 rows=32 loops=1)"
// Captures: name (everything up to first `(`), then cost, then actual.
const OPERATOR_RE = /^(.+?)\s+\(cost=([\d.]+)\.\.([\d.]+) rows=(\d+) width=(\d+)\)\s+\(actual time=([\d.]+)\.\.([\d.]+) rows=(\d+) loops=(\d+)\)/;

// Header comment lines look like `# EXPLAIN ANALYZE — Flow 1 — My Week landing …`.
const HEADER_RE = /^#\s*EXPLAIN ANALYZE\s*[—-]\s*(.+)$/;
const CAPTURED_RE = /^#\s*Captured:\s*(\S+)/;

export function parseExplain(filePath: string): PlanFile {
  const src = fs.readFileSync(filePath, 'utf8');
  const lines = src.split('\n');

  let title = path.basename(filePath);
  let capturedAt: string | null = null;
  let planningTimeMs: number | null = null;
  let executionTimeMs: number | null = null;
  const stack: PlanNode[] = [];
  let root: PlanNode | null = null;
  let inPlan = false;

  for (let raw of lines) {
    // Strip trailing CR (just in case) and trailing whitespace for matching.
    const line = raw.replace(/\r$/, '');

    if (!inPlan) {
      const h = HEADER_RE.exec(line);
      if (h) {
        title = h[1]!.trim();
        continue;
      }
      const c = CAPTURED_RE.exec(line);
      if (c) {
        capturedAt = c[1]!;
        continue;
      }
      if (/^-{3,}$/.test(line.trim())) {
        inPlan = true;
      }
      continue;
    }

    // Inside the plan body.
    if (/^\s*Planning Time:\s*([\d.]+)\s*ms/.test(line)) {
      const m = /^\s*Planning Time:\s*([\d.]+)\s*ms/.exec(line);
      if (m) planningTimeMs = parseFloat(m[1]!);
      continue;
    }
    if (/^\s*Execution Time:\s*([\d.]+)\s*ms/.test(line)) {
      const m = /^\s*Execution Time:\s*([\d.]+)\s*ms/.exec(line);
      if (m) executionTimeMs = parseFloat(m[1]!);
      continue;
    }
    if (/^\s*\(\d+ rows?\)$/.test(line)) break;
    if (/^\s*Query Identifier:/.test(line)) continue;

    // Compute indent depth — number of leading spaces.
    const leading = line.length - line.trimStart().length;
    let content = line.trim();
    if (!content) continue;

    // Lines that begin a new operator either start at the file root (depth = 1)
    // or are introduced by "-> ". Normalize: strip "-> " prefix when present.
    const arrowed = content.startsWith('->');
    if (arrowed) content = content.replace(/^->\s*/, '');

    const opMatch = OPERATOR_RE.exec(content);
    if (opMatch) {
      // Build the node.
      const [, header, c1, c2, c3, c4, a1, a2, a3, a4] = opMatch;
      const fullHeader = (header ?? '').trim();
      // Split "name detail" — name is first word(s), detail is "on table x" etc.
      // Pragmatic split: take everything before the first ' on ' as name; rest as detail.
      let name = fullHeader;
      let detail: string | null = null;
      const onIdx = fullHeader.indexOf(' on ');
      if (onIdx !== -1) {
        name = fullHeader.slice(0, onIdx);
        detail = fullHeader.slice(onIdx + 4);
      }

      const node: PlanNode = {
        name,
        detail,
        depth: leading,
        cost: { startup: parseFloat(c1!), total: parseFloat(c2!), rows: parseInt(c3!, 10), width: parseInt(c4!, 10) },
        actual: { startupMs: parseFloat(a1!), totalMs: parseFloat(a2!), rows: parseInt(a3!, 10), loops: parseInt(a4!, 10) },
        attrs: [],
        children: [],
      };

      // Place into tree by depth. The root is the first node we see.
      if (!root) {
        root = node;
        stack.push(node);
        continue;
      }
      // Pop until we find a parent with smaller depth than this node.
      while (stack.length > 0 && stack[stack.length - 1]!.depth >= leading) {
        stack.pop();
      }
      const parent = stack[stack.length - 1];
      if (parent) parent.children.push(node);
      stack.push(node);
      continue;
    }

    // Attribute line — attach to the most recent node.
    if (stack.length > 0) {
      stack[stack.length - 1]!.attrs.push(content);
    }
  }

  return { title, capturedAt, planningTimeMs, executionTimeMs, root };
}

export function parseAllExplains(baseDir: string, outDir: string): number {
  fs.mkdirSync(outDir, { recursive: true });
  const files = fs
    .readdirSync(baseDir)
    .filter((f) => /^explain-flow-\d+\.txt$/.test(f))
    .sort();
  for (const f of files) {
    const flow = /^explain-flow-(\d+)\.txt$/.exec(f)?.[1];
    if (!flow) continue;
    const parsed = parseExplain(path.join(baseDir, f));
    fs.writeFileSync(
      path.join(outDir, `flow-${flow}.json`),
      JSON.stringify(parsed, null, 2) + '\n',
      'utf8'
    );
  }
  return files.length;
}
