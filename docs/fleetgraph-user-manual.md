# FleetGraph User Manual

## Sign In

Use the seeded demo account:

- Email: `dev@ship.local`
- Password: `admin123`
- Workspace: `Ship Workspace`

Do not use `e@mail.com` for the demo data unless that user has been switched into `Ship Workspace`.

## Open The Agent Inbox

The FleetGraph agent inbox is in the left sidebar.

Look near the bottom of the left rail and click the connected-nodes icon above the gear icon.

That opens **FleetGraph Inbox**, which shows proactive findings from the agent.

## Understand A Finding

A finding is an agent-generated signal about project risk, missing ownership, blockers, stale updates, or unclear next steps.

Each card shows:

- Severity: `Low`, `Medium`, `High`, or `Critical`
- State: `Open`, `Pending Review`, and other lifecycle states
- Scope: the project, issue, or week the finding is about
- Evidence: why the agent created the finding
- Actions: what you can do with it

## What The Buttons Mean

- **Dismiss**: Clear the finding because it is not useful or only demo data.
- **Snooze**: Hide it until later.
- **Reject**: Say the recommended action is wrong.
- **Approve**: Approve an agent-proposed action.

Current caveat: `Approve` is only meaningful for `Pending Review` findings that have an action candidate. The visible seeded `Open` finding is best handled with **Dismiss** or **Snooze**.

## Recommended Demo Flow

For the seeded finding:

1. Read the evidence.
2. Click **Dismiss**.
3. Use a reason like `Seed demo acknowledged`.
4. Submit.

That verifies the inbox flow is working.

## Open Agent Chat

Agent chat is separate from the inbox.

To find it:

1. Close the FleetGraph Inbox modal.
2. Open a FleetGraph project, issue, or week document.
3. Look near the editor header for the small chat bubble button.
4. Click it to open embedded FleetGraph chat.

Chat is scoped to the document you are viewing. For example, if you open a FleetGraph issue, chat should answer based on that issue and related project or week context.

## If You See "No Projects Yet"

You are probably in the wrong workspace.

Use `dev@ship.local` with password `admin123`, or switch to `Ship Workspace`.

## Quick Mental Model

FleetGraph has two agent surfaces:

- **Inbox**: proactive agent findings and human review.
- **Chat**: ask questions inside a project, issue, or week document.

The inbox tells you something may need attention.

The chat lets you ask what is going on in the current document and its related work.
