# FleetGraph 5-Minute Demo Script (Beginner-Friendly)

Created: 2026-05-26  
Updated: 2026-05-27

This guide assumes you have **never used Ship before**. Every on-stage step says **where to click**, **what you should see**, and **what to say**.

---

## Part 0 — What you are demoing (30 seconds to read)

**Ship** is a project-management app: programs, projects, **Weeks** (sprints), issues, standups, and documents.

**FleetGraph** is an AI agent **inside** Ship. It does two things:

1. **Push mode** — Watches work data and creates **findings** (alerts with evidence). A human must approve before the agent writes visible content (e.g. an issue comment).
2. **Pull mode** — **Chat** on a Week or project page answers questions using that page’s real context.

You will show: inbox → dismiss a card → a pre-staged agent comment on an issue → chat on a Week → a Langfuse trace tab.

---

## Part 1 — Learn the Ship screen (2 minutes)

Open the app (see **Part 2** for the URL). After login you always see:

### Left rail (narrow vertical bar on the far left)

Icons top to bottom (main area):

| Icon label (tooltip) | What it opens |
|----------------------|---------------|
| **Dashboard** | Home / overview |
| **Docs** | Wiki-style documents |
| **Programs** | Top-level programs (e.g. “FleetGraph MVP”) |
| **Projects** | Project list |
| **Teams** | People, allocation, standups |

Near the **bottom** of the rail:

| Icon | What it does |
|------|----------------|
| **FleetGraph** | Opens the **FleetGraph Inbox** (modal window in the center) |
| **Settings** | Workspace settings |
| **Letter avatar** (e.g. **D**) | Log out |

**FleetGraph is not under Programs** — it is the **dedicated icon above Settings**.

### Common popups (dismiss them)

- **“Action Items”** — Yellow/overdue tasks. Click **Got it** (or **Close**) so it does not block clicks.
- **Accountability banner** at the top — You can ignore it for the demo or click through; it does not block FleetGraph.

### Main content area

Everything to the **right** of the left rail: lists, editors, tabs (Overview, Issues, Standups, etc.).

---

## Part 2 — Where to run the demo

Pick **one** environment and use its login + bookmarks for the whole rehearsal and recording.

### Option A — Public deploy (easiest for recording)

| Item | Value |
|------|--------|
| **App URL** | https://143.198.163.184.nip.io/ |
| **Email** | `dev@ship.local` |
| **Password** | `admin123` |
| **Week 14 (chat)** | https://143.198.163.184.nip.io/documents/ae794fb3-2b32-449b-819f-34348d317295 |
| **Trace issue (comment)** | https://143.198.163.184.nip.io/documents/27e15c1b-3f6c-4e1d-8880-15a5c5705459 |

No Docker or terminal required for the **on-stage** flow if you complete **Part 3B** (pre-staging) once.

If the **Action Items** modal opens over the document, click **Got it** before opening FleetGraph chat. The chat button is the **Ask FleetGraph** pill near the upper-right of the document canvas.

#### Important: `/my-week` is NOT where chat lives

After login, Ship often lands on **My Week** (`/my-week`). That page shows your plan, standups, and assigned **projects** — it does **not** include FleetGraph chat.

| Page | URL pattern | FleetGraph chat? | FleetGraph inbox? |
|------|-------------|------------------|-------------------|
| **My Week** (dashboard) | `/my-week` | **No** | Yes (left rail icon) |
| **Week document** | `/documents/<week-id>` | **Yes** | Yes (left rail icon) |
| **Project / issue document** | `/documents/<id>` | **Yes** (project & issue) | Yes (left rail icon) |

For the demo chat beat, open the **Week 14** bookmark in the table above (or follow **“Open Week 14 for chat”** below).

### Option B — Local (localhost)

| Item | Value |
|------|--------|
| **App URL** | http://localhost:5173/ |
| **Email / password** | Same as above |
| **Week / issue URLs** | Same paths, but host `localhost:5173` and document IDs from your DB after seed |

Requires: Docker Postgres, `pnpm dev` in `api/` and `web/`, and seed (see **Part 3A**).

---

## Part 3 — Before you record (pre-flight)

Allow **15–20 minutes** once. You only do hard setup here; the recording stays in the browser.

### 3A — Local only: start services and seed

Skip this section if you use **Option A (deploy)** and the inbox already shows a card (see **3B**).

```bash
# Terminal 1 — database
docker ps   # should show ship-postgres running

# Terminal 2 — API
cd /Users/sheep/Desktop/Gauntlet/ship/api
pnpm dev

# Terminal 3 — web
cd /Users/sheep/Desktop/Gauntlet/ship/web
pnpm dev
```

Seed demo data (local DB):

```bash
cd /Users/sheep/Desktop/Gauntlet/ship/api
DATABASE_URL=postgresql://ship:ship_dev_password@127.0.0.1:5433/ship_dev \
  ./node_modules/.bin/tsx src/db/seed.ts
```

Confirm `api/.env.local` has `OPENAI_API_KEY` and Langfuse keys if you want live chat and traces locally.

### 3B — Sign in once and confirm FleetGraph works

1. Open your **App URL** (Part 2).
2. You should see **Sign in to Ship**.
3. Enter **Email** → `dev@ship.local`, **Password** → `admin123`, click **Sign in**.
4. You should land on **Docs**, **Dashboard**, or **My Week** — any is fine.

**Test the inbox**

1. On the **left rail**, click the **FleetGraph** icon (above **Settings**).
2. A large centered panel opens: **FleetGraph Inbox**.
3. You should see **“1 finding”** and a card titled **FleetGraph - HITL Findings Inbox** (medium severity, **open**).
4. If it says **“No open findings”**, someone dismissed the demo card; ask for a DB reset or re-run seed (local) — on deploy, re-seed or restore the `seed:fleetgraph:open:inbox-visible:v1` row.

**Test chat (optional but recommended)**

1. Open the **Week 14** bookmark from Part 2 in a **new tab** (stay logged in).  
   Do **not** stay on `/my-week`.
2. Dismiss **Action Items** if it appears (**Got it**).
3. Confirm the URL looks like `/documents/ae794fb3-...` and the big title is **Week 14** with tabs **Overview · Issues · Review · Standups**.
4. Near the upper-right of the document canvas, find the **Ask FleetGraph** pill.
   - It sits inside the document area, just left of the properties panel.
   - If the page is narrow, **widen the browser window** or collapse the **Docs** tree on the left (chevron / “Collapse sidebar”).
5. Click **Ask FleetGraph**. A **FleetGraph Chat** panel opens on the **right** side of the page.
6. In **Ask FleetGraph**, paste the question from Part 5, click **Send**, and wait until text streams in.

**Open Week 14 for chat (without the bookmark)**

1. From **My Week**, click **Programs** on the left rail (grid icon is Dashboard; use the **programs** icon).
2. Open **FleetGraph MVP**.
3. Open a project, then open **Week 14** from that program’s Weeks list — **or** paste the Week 14 URL from the table in Part 2.

**Do not confuse with the inbox:** the **graph / network icon** at the bottom of the left rail (above Settings) opens the **FleetGraph Inbox**, not chat.

**Test Langfuse tab**

1. Log in to your Langfuse project (URL from `LANGFUSE_BASE_URL` in `api/.env.local`).
2. Run one chat question in the Week chat. That generates a `fleetgraph.chat.response` trace.
3. If you ran a proactive Week-risk check before the demo, find the trace with tags like `fleetgraph`, `detector:at_risk_week`, or `trace_node:reason`.
4. Open the trace and leave the tab open for the recording.

**When traces are generated**

| Demo action | Trace you should see in Langfuse |
|-------------|-----------------------------------|
| Chat question streams in the Week panel | `fleetgraph.chat.response` |
| Proactive Week detector reasons about a risky Week | `fleetgraph.at_risk_week.reason` or a trace tagged `detector:at_risk_week` |
| Quiet detector path exits before model reasoning | A shorter trace with guard/pre-filter metadata and no reason-model span |

Langfuse is the observability proof: do not search for traces during the recording. Generate them in pre-flight, open the useful trace, then show the already-loaded tab.

### 3C — Verify the HITL “agent wrote a comment” beat

**What you need**

- Issue: **Capture Langfuse trace URLs for shared review**  
  https://143.198.163.184.nip.io/documents/27e15c1b-3f6c-4e1d-8880-15a5c5705459
- After approve + resume: a **comment card** at the **bottom of the issue document** (gray box, author **Dev User**, text about Langfuse trace URLs).  
  There is no separate “Comments” tab — scroll the **main editor area** to the end.

**Browser-only setup**

1. Sign in to Ship.
2. Click **FleetGraph** on the left rail.
3. Click the **Needs Review** tab.
4. Confirm the pending card is visible.
5. Click **Approve**.
6. Click the **Approved** tab.
7. Click **Resume** on the approved card.
8. Open the trace issue URL above and hard-refresh (`Cmd+Shift+R`).
9. Confirm the FleetGraph comment is visible at the bottom of the document.

**Why you might see nothing**

1. **Approve + resume never run** — the comment is not automatic; seed data only prepares a `pending_review` finding.
2. **UI gap (fixed in latest web build)** — older builds saved the comment in the database but only showed comments tied to highlighted text. FleetGraph writes unanchored comments; redeploy web or use localhost after pulling the fix.
3. **Wrong tab** — approve lives under **Needs Review**; resume lives under **Approved**. The default **Open** tab only has dismiss/snooze triage.

**What to say on stage:**  
*“Before recording I approved and resumed the agent’s draft comment; this is the gated write on the issue.”*  
Do **not** claim the **open inbox card** was created live during the recording.

### 3D — Open these browser tabs before you hit Record

| Tab | What to open |
|-----|----------------|
| **1 — Ship (inbox)** | App URL → sign in → click **FleetGraph** so inbox is ready (or open app and you’ll open inbox in step 1 of Part 4) |
| **2 — Issue with comment** | Trace issue bookmark (Part 2) |
| **3 — Week 14 + chat** | Week 14 bookmark → open **FleetGraph Chat** panel so the Week is ready |
| **4 — Langfuse** | Proactive `reason` trace or `fleetgraph.chat.response` trace already loaded |

---

## Part 4 — Recording script (5 minutes, click by click)

Use a **full-width** browser window. Have tabs 1–4 from Part 3D ready.

### Minute 0:00–0:25 — Intro (Tab 1: Ship)

**Screen:** Any Ship page after login (Tab 1).

**Do:** Nothing, or show the left rail briefly.

**Say:**

> Ship already has the work graph — programs, projects, Weeks, issues, standups. FleetGraph sits inside that graph. It pushes reviewable findings, and it answers questions in whatever document you’re already viewing.

---

### Minute 0:25–1:15 — FleetGraph inbox (Tab 1)

**Do:**

1. Click **FleetGraph** on the **left rail** (bottom section, above Settings).
2. The **FleetGraph Inbox** modal appears (center of screen).
3. Optional: click **Refresh** (top right of the modal). Wait until you see **“1 finding”**.
4. Point at the card:
   - Title: **FleetGraph - HITL Findings Inbox**
   - Badges: severity (e.g. **medium**), state **open**
   - **Evidence** quote in a gray box

**Say:**

> This is the human review surface. Findings include severity and evidence. Visible writes are gated — the agent recommends actions, but a person decides.

**Clarification (if asked):** This card is **demo seed data** to show the inbox UI. Your **live** proactive story is the **issue comment** in the next step.

**If you need to show HITL instead of dismiss:** click **Needs Review**, approve the pending card, click **Approved**, then resume it. For the main 5-minute script, do this in pre-flight so the issue comment is already visible.

---

### Minute 1:15–1:40 — Dismiss the card (Tab 1)

**Do:**

1. On that same card, click **Dismiss**.
2. A small form appears (**Dismiss finding**). Type any short reason, e.g. `Handled in standup`.
3. Confirm dismiss (submit on the form).
4. The card should disappear or the count should drop to **0 findings**.
5. Click **X** (top right of the modal) to **Close FleetGraph inbox**.

**Say:**

> For noise or already-handled items, a reviewer can dismiss or snooze so the agent does not keep resurfacing the same finding.

*(You can click **Snooze** instead if you prefer — pick a future date/time in the form.)*

---

### Minute 1:40–2:20 — Agent comment on an issue (Tab 2)

**Do:**

1. Switch to **Tab 2** (issue bookmark).
2. Confirm the page title/header includes **Capture Langfuse trace URLs for shared review**.
3. Scroll to the **bottom of the document body** (main center column, not the right Properties sidebar).
4. Point at the **comment card**: author **Dev User**, text starting with *“Please add the shared Langfuse trace URLs…”*

**Say:**

> Before the demo I triggered a real Week risk signal and ran the approval flow. FleetGraph proposed a draft comment; after I approved and resumed, it landed here as a normal Ship comment — not a side channel.

**If there is no comment:** Do not improvise — stop and complete **Part 3C**, then re-record this segment.

---

### Minute 2:20–3:45 — Embedded chat on a Week (Tab 3)

**Do:**

1. Switch to **Tab 3** (Week 14 document URL — **not** `/my-week`).
2. Confirm the page heading says **Week 14** and you see tabs **Overview / Issues / Review / Standups**.
3. If the **Action Items** modal appears, click **Got it**.
4. If **FleetGraph Chat** is not open on the right, click the **Ask FleetGraph** pill near the upper-right of the document canvas.
5. In the bottom **Ask FleetGraph** box, paste exactly:

   ```text
   What is blocking this week, who owns recovery, and what should we do next?
   ```

6. Click **Send**.
7. Wait for the assistant bubble to **stream** text (do not talk over the first sentence).
8. Optionally point at one issue or blocker name in the answer.

**Say (after streaming starts):**

> This is pull mode — chat is scoped to **this Week’s** data, not a generic ChatGPT window.

**If Send fails or times out:** Wait 10 seconds, then say you’ll show observability in Langfuse and switch to Tab 4.

---

### Minute 3:45–4:30 — Langfuse trace (Tab 4)

**Do:**

1. Switch to **Tab 4** (Langfuse, already open).
2. Point at: trace name, **reason** span or chat trace, token/latency fields, tags like `fleetgraph` / `detector:at_risk_week`.
3. If you used the chat trace, say it was generated by the question you just asked. If you used the proactive trace, say it was generated during pre-flight by the Week-risk detector.

**Say:**

> This trace is the audit trail for one agent run — branch taken, model input/output, tokens, latency, and the finding metadata. The chat turn creates a similar trace; I pre-opened this one so we are not searching during the demo.

---

### Minute 4:30–5:00 — Close (Tab 1 or 3)

**Do:** Switch back to Ship (inbox closed, or Week page). No required clicks.

**Say:**

> So the shape is: hybrid triggers on real Ship data, one shared FleetGraph LangGraph runtime for proactive detection and on-demand chat, human approval for visible writes, contextual answers in the document, and traces for observability. It is an agent inside the planning graph — not a bolt-on chatbot.

---

## Part 5 — Cheat sheet

### Login

```text
Email:    dev@ship.local
Password: admin123
```

### Chat question (copy-paste)

```text
What is blocking this week, who owns recovery, and what should we do next?
```

### Inbox buttons (on each finding card)

| Button | Meaning |
|--------|---------|
| **Approve** | Allow the proposed action — shown on **Needs Review** findings |
| **Reject** | Decline with a reason — shown on **Needs Review** findings |
| **Dismiss** | Mark handled; stop resurfacing — shown on **Open** and **Needs Review** findings |
| **Snooze** | Hide until a date — shown on **Open** and **Needs Review** findings |
| **Resume** | Run an **approved** action, such as posting the draft comment — shown on **Approved** findings |

### Navigate without bookmarks (if you get lost)

**Week 14 via UI**

1. Left rail → **Programs**.
2. Open program **FleetGraph MVP** (or similar).
3. Open a **project** under that program, then open **Week 14** from the Weeks/sprints list.

**Issue via UI**

1. Left rail → **Programs** → **FleetGraph MVP**.
2. Find issue **Capture Langfuse trace URLs for shared review**, or use **Projects** / issue lists under the FleetGraph projects.

### Script guardrails

- Do not say the **open inbox card** was created live during the recording.
- Say **chat enters the same compiled FleetGraph LangGraph runtime** as proactive detection. The HTTP route still owns auth, scope validation, rate limiting, and SSE framing.
- Do not call pre-staging “hidden”; say **pre-staged so the recording stays smooth**.

### If something breaks

| Problem | What to do on camera |
|---------|----------------------|
| Inbox empty | “I cleared open findings; the live proof is the approved comment on the issue.” → Tab 2 |
| Chat will not open | Widen window; collapse left doc sidebar; or skip to Tab 4 |
| **Send does nothing** | Hard-refresh the deployed page (`Cmd+Shift+R`). If it still fails, use the local URL after confirming the latest web build is running. |
| Send stuck on **Sending...** | Refresh the page and try again. |
| Chat slow | Let it stream 10s, then Tab 4 |
| No issue comment | Stop — complete Part 3C, do not record blind |
| Langfuse tab wrong | Use the pre-opened trace; do not search live |

**Diagnose in DevTools (F12 → Console):** error `randomUUID is not available` = HTTP deploy bug; use localhost or redeploy latest web.

---

## Part 6 — Optional advanced pre-flight (not shown on camera)

Only if you need **live proactive traces** or submission URLs:

- Mutation + wait: `docs/fleetgraph-agent-exercise-guide.md` (DevTools `fleetGraphPost` to create a failing iteration on a Week).
- Langfuse CLI listing: same guide, **Find And Open The Traces**.
- Latency proof script: `docs/fleetgraph-latency-proof.md` (terminal, not for the 5-minute browser demo).

---

## Final rehearsal checklist

- [ ] I can sign in without help.
- [ ] **FleetGraph** icon opens the inbox and shows **1** open card (or I know the fallback line).
- [ ] **Dismiss** works and inbox can close.
- [ ] Trace **issue** tab shows the agent **comment**.
- [ ] **Week 14** tab: **Ask FleetGraph** → **Send** → text streams.
- [ ] **Langfuse** tab is already open.
- [ ] I can deliver the closing line in ~20 seconds without rushing.
