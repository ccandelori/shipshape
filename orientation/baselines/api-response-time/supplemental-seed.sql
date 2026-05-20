-- Supplemental local-only audit seed for Taskmaster task 4.
--
-- The normal project seed is intentionally compact (11 users / ~257 docs).
-- Task 4 requires a higher-volume API baseline: 500+ documents, 100+ issues,
-- 20+ users, and 10+ sprints. This file tops up only the missing audit volume
-- in the local Docker database and is idempotent once the target counts exist.

DO $$
DECLARE
  v_workspace_id UUID;
  v_dev_user_id UUID;
  dev_password_hash TEXT;
  v_user_id UUID;
  current_docs INTEGER;
  docs_to_add INTEGER;
  i INTEGER;
BEGIN
  SELECT id INTO v_workspace_id
  FROM workspaces
  WHERE name = 'Ship Workspace'
  ORDER BY created_at
  LIMIT 1;

  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Ship Workspace does not exist. Run the normal seed first.';
  END IF;

  SELECT id, password_hash INTO v_dev_user_id, dev_password_hash
  FROM users
  WHERE LOWER(email) = 'dev@ship.local';

  IF v_dev_user_id IS NULL THEN
    RAISE EXCEPTION 'dev@ship.local does not exist. Run the normal seed first.';
  END IF;

  FOR i IN 1..9 LOOP
    INSERT INTO users (email, password_hash, name, last_workspace_id)
    VALUES (
      format('bench-user-%s@ship.local', lpad(i::TEXT, 2, '0')),
      dev_password_hash,
      format('Benchmark User %s', lpad(i::TEXT, 2, '0')),
      v_workspace_id
    )
    ON CONFLICT (email) DO UPDATE
      SET last_workspace_id = EXCLUDED.last_workspace_id,
          updated_at = NOW()
    RETURNING id INTO v_user_id;

    INSERT INTO workspace_memberships (workspace_id, user_id, role)
    VALUES (v_workspace_id, v_user_id, 'member')
    ON CONFLICT (workspace_id, user_id) DO NOTHING;

    INSERT INTO documents (workspace_id, document_type, title, properties, created_by)
    SELECT
      v_workspace_id,
      'person',
      format('Benchmark User %s', lpad(i::TEXT, 2, '0')),
      jsonb_build_object(
        'user_id', v_user_id::TEXT,
        'email', format('bench-user-%s@ship.local', lpad(i::TEXT, 2, '0')),
        'benchmark_seed', TRUE
      ),
      v_dev_user_id
    WHERE NOT EXISTS (
      SELECT 1
      FROM documents d
      WHERE d.workspace_id = v_workspace_id
        AND document_type = 'person'
        AND properties->>'user_id' = v_user_id::TEXT
    );
  END LOOP;

  SELECT COUNT(*) INTO current_docs FROM documents;
  docs_to_add := GREATEST(0, 500 - current_docs);

  FOR i IN 1..docs_to_add LOOP
    INSERT INTO documents (workspace_id, document_type, title, content, properties, created_by)
    VALUES (
      v_workspace_id,
      'wiki',
      format('Benchmark wiki doc %s', lpad(i::TEXT, 3, '0')),
      '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Synthetic audit baseline document."}]}]}'::jsonb,
      jsonb_build_object('benchmark_seed', TRUE, 'sequence', i),
      v_dev_user_id
    );
  END LOOP;

  RAISE NOTICE 'Supplemental audit seed complete. Added % wiki documents if needed.', docs_to_add;
END $$;
