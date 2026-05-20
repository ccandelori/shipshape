# Database Query Log Methodology

Step-by-step recipe to capture live per-flow query counts and EXPLAIN ANALYZE plans
against a local Postgres running the Ship dev database. Phase-2 work — run after
the parent thread starts Postgres + seeds the database.

## 1. Enable full statement logging

Find the active Postgres config file:

```bash
psql -c 'SHOW config_file;'
```

Edit `postgresql.conf` and set:

```ini
log_statement = 'all'             # log every SQL statement
log_min_duration_statement = 0    # also captures duration in log
log_duration = on                 # log execution time
log_line_prefix = '%m [%p] %a %d %u | '   # timestamp pid app db user
```

Reload (no restart needed):

```bash
psql -c "SELECT pg_reload_conf();"
```

Find the log file:

```bash
psql -c 'SHOW log_directory;'
psql -c 'SHOW log_filename;'
# Typically: /opt/homebrew/var/log/postgresql@16.log on macOS Homebrew
```

## 2. Set application_name per worker

In `api/src/db/client.ts`, the `pg.Pool` should pass `application_name: 'ship-api-baseline'`
so log lines are easy to grep. If not already set, add it in the pool config (transient
for the audit only — do not commit).

## 3. Capture a single user flow

```bash
# Terminal A — tail the log into a flow-specific file
tail -F /opt/homebrew/var/log/postgresql@16.log \
  | grep ship-api-baseline > orientation/baselines/flow-load-main.log &

# Terminal B — drive the flow once (browser or curl)
# Then stop the tail with Ctrl-C and rename the log
```

Repeat for each of the five flows:

| Flow                 | Action                              | Output file                          |
|----------------------|-------------------------------------|--------------------------------------|
| Load main page (`/`) | Browse to dashboard, wait for idle  | `flow-load-main.log`                 |
| View a document      | Open one issue + one project        | `flow-view-document.log`             |
| List issues          | `/issues` page, default filters     | `flow-list-issues.log`               |
| Load sprint board    | Open accountability / team grid     | `flow-sprint-board.log`              |
| Search content       | Type 3-char query in mention search | `flow-search.log`                    |

## 4. Count queries per flow

```bash
# Count statements per flow
for f in orientation/baselines/flow-*.log; do
  echo -n "$f: "
  grep -c 'statement:' "$f"
done

# Top 10 slowest statements in a flow
grep -E 'duration: [0-9.]+ ms' orientation/baselines/flow-load-main.log \
  | sort -t: -k2 -n -r | head -10
```

## 5. Run EXPLAIN ANALYZE on the slowest

For each slow query (>50 ms), substitute parameter values and run:

```bash
psql -d ship_dev -c "EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) <statement>" \
  > orientation/baselines/db-explain-<short-name>.txt
```

Specifically target:
- Dashboard "my active issues" — `api/src/routes/dashboard.ts:89-115`
- Action-items inference — see N+1 list, `services/accountability.ts:175-230`
- Issues list base query — `api/src/routes/issues.ts:115-223`
- Search mentions ILIKE scan — `api/src/routes/search.ts:31-68`
- Team grid heatmap — `api/src/routes/team.ts:108-134`

## 6. Disable logging after capture

```ini
log_statement = 'none'
log_min_duration_statement = -1
```

```bash
psql -c "SELECT pg_reload_conf();"
```

## 7. Capture index usage stats (bonus)

After running the flows, snapshot index usage to see which indexes are unused:

```sql
SELECT schemaname, relname, indexrelname, idx_scan, idx_tup_read
FROM pg_stat_user_indexes
WHERE relname = 'documents'
ORDER BY idx_scan ASC;
```

Save to `orientation/baselines/db-index-usage.txt`.

## 8. Pre-built EXPLAIN script

Run this once Postgres is up and seeded:

```bash
WORKSPACE_ID=$(psql -d ship_dev -tAc "SELECT id FROM workspaces LIMIT 1")
ASSIGNEE_ID=$(psql -d ship_dev -tAc "
  SELECT properties->>'assignee_id'
  FROM documents
  WHERE document_type='issue'
    AND properties ? 'assignee_id'
  LIMIT 1
")

psql -d ship_dev -c "
EXPLAIN (ANALYZE, BUFFERS)
SELECT d.id, d.title, d.properties, d.ticket_number
FROM documents d
WHERE d.workspace_id = '$WORKSPACE_ID'
  AND d.document_type = 'issue'
  AND (d.properties->>'assignee_id')::uuid = '$ASSIGNEE_ID'::uuid
  AND d.properties->>'state' NOT IN ('done','cancelled');
" > orientation/baselines/db-explain-dashboard-issues.txt
```
