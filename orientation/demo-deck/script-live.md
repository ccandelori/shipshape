# ShipShape Demo — Live Walkthrough Script

> **Philosophy: breadth, not depth.** This demo shows the reviewer the full
> landscape and *where to verify everything*. It does not deep-dive any single
> finding. The dashboard is the map; the reviewer dives wherever they want,
> because they can see it's all here and all traceable. Every beat signposts
> depth instead of performing it.
>
> **Format.** Screen-recording of the live dashboard (http://143.198.163.184/dashboard/),
> with one short cut to a terminal for the security probe. Tabs: Overview ·
> Categories · Evidence · Audit & Discovery · Operations.
>
> **Timing.** ~4 to 4.5 min. Move briskly; the surfaces carry the weight.
> Numbers are the verified set — don't round them differently on camera.

---

## 1. Frame · ~0:00–0:30

**[SCREEN: dashboard Overview, full view]**

> This is ShipShape: the complete record of a one-week audit and remediation of Ship, an open-source government web application. Express and Postgres, real-time collaboration over WebSockets, real users.
>
> I'm not going to walk you through every finding. The point of this dashboard is that you don't have to take my word for any of it. It's all here, organized by category, and every number links to the evidence behind it. Let me show you the shape of it.

---

## 2. Overview — everything at a glance · ~0:30–1:15

**[SCREEN: stay on Overview; gesture across the ledger, then the dials]**

> Seven quality categories, audited and remediated. Up top is the impact: every category's headline metric, before and after, on one screen. Bundle size, database latency, API tail latency, accessibility, runtime errors, test coverage, type safety.
>
> Below that is current health: all seven gates passing, with the live margin on each. This is the summary. Everything underneath it is the proof, and every row up here is a click straight into it.

---

## 3. Categories — the depth is all there · ~1:15–2:00

**[SCREEN: Categories tab; expand ONE panel briefly, then collapse it]**

> Each category opens to the full story: what the audit found, what I changed, and the evidence for it. Here's one. (expand) The finding, the fix, the before and after, the reproduce command. (collapse)
>
> And the same depth sits behind all seven. If you wanted to audit my audit, this is where you'd start, and you wouldn't need me in the room to do it.

---

## 4. Evidence — every claim has a receipt · ~2:00–2:30

**[SCREEN: Evidence tab; scroll the artifact index]**

> Every number on this dashboard has a receipt, and they're all indexed here: the raw EXPLAIN query plans, the k6 latency runs, the accessibility scans, the build reports. Nothing is asserted that isn't backed by a file you can open yourself.

---

## 5. Audit & Discovery · ~2:30–3:00

**[SCREEN: Audit & Discovery tab; pan the sub-nav: Executive audit / Discovery / Compliance / AI cost]**

> The full written record lives here: the consolidated audit report, the discovery write-up of what surprised me in the codebase, the security compliance scan, and an analysis of what this work actually cost in AI. Reading time is marked on each, so you can pick your own depth.

---

## 6. Operations · ~3:00–3:30

**[SCREEN: Operations tab; pan the sub-nav]**

> And the operational side: how it deploys, the CI gate that keeps the quality floor from dropping, the observability counters, and the quality orchestrator, the tool that regenerates this entire dashboard from a single command.

---

## 7. The security probe — category 8 · ~3:30–4:15

**[SCREEN: cut to terminal]**

> Beyond the dashboard, there's a separate deliverable: an active security probe. A single Go binary that attacks the running app across five surfaces, auth, WebSocket, input, dependencies, and configuration.

**[SCREEN: run the probe; let findings stream briefly]**

> One command, runnable against a fresh instance. It found seventy-one issues, including one that could crash the whole collaboration server with a single frame. The critical ones are fixed, with before-and-after proof in its own repo. Same principle as the dashboard: runnable, and everything traceable.

---

## 8. Close · ~4:15–4:30

**[SCREEN: back to dashboard Overview, full view]**

> That's the breadth: seven categories, a security probe, and every single claim one click from its evidence. Dive as deep as you want. It's all here.

---

## If running long

- Merge Evidence (4) into Categories (3): "and every one of these links to its raw evidence file."
- Drop the probe's live run; just show its repo + AUDIT.md and say "runnable in one command."
- Operations (6) can be a 10-second pan with one sentence.
