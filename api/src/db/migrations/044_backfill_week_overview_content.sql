-- Backfill Week document body content from existing planning properties.
--
-- Earlier demo seed data stored Week planning signal in JSONB properties only.
-- The Week Overview tab renders the TipTap/Yjs document body, so those rows
-- appeared blank even though plan and success criteria existed in properties.
-- Clear yjs_state for empty docs so the collaboration server regenerates the
-- CRDT state from this JSON content on next editor load.

UPDATE documents
SET
  content = jsonb_build_object(
    'type', 'doc',
    'content', jsonb_build_array(
      jsonb_build_object(
        'type', 'paragraph',
        'content', jsonb_build_array(
          jsonb_build_object(
            'type', 'text',
            'text', CONCAT('Week ', properties->>'sprint_number', ' overview: ', COALESCE(NULLIF(properties->>'plan', ''), 'planned work is in progress.'))
          )
        )
      ),
      jsonb_build_object(
        'type', 'heading',
        'attrs', jsonb_build_object('level', 2),
        'content', jsonb_build_array(jsonb_build_object('type', 'text', 'text', 'Plan'))
      ),
      jsonb_build_object(
        'type', 'paragraph',
        'content', jsonb_build_array(
          jsonb_build_object('type', 'text', 'text', COALESCE(NULLIF(properties->>'plan', ''), 'Review the active issues and confirm the recovery plan.'))
        )
      ),
      jsonb_build_object(
        'type', 'heading',
        'attrs', jsonb_build_object('level', 2),
        'content', jsonb_build_array(jsonb_build_object('type', 'text', 'text', 'Success criteria'))
      ),
      jsonb_build_object(
        'type', 'bulletList',
        'content', jsonb_build_array(
          jsonb_build_object(
            'type', 'listItem',
            'content', jsonb_build_array(
              jsonb_build_object(
                'type', 'paragraph',
                'content', jsonb_build_array(
                  jsonb_build_object('type', 'text', 'text', COALESCE(NULLIF(properties->>'success_criteria', ''), 'Document the expected outcome for this Week.'))
                )
              )
            )
          ),
          jsonb_build_object(
            'type', 'listItem',
            'content', jsonb_build_array(
              jsonb_build_object(
                'type', 'paragraph',
                'content', jsonb_build_array(
                  jsonb_build_object('type', 'text', 'text', 'Use the assigned issues, recent standups, and FleetGraph comments to evaluate blockers, ownership, and next actions.')
                )
              )
            )
          )
        )
      )
    )
  ),
  yjs_state = NULL,
  updated_at = NOW()
WHERE document_type = 'sprint'
  AND properties ? 'sprint_number'
  AND (
    content IS NULL
    OR (
      jsonb_typeof(content) = 'object'
      AND jsonb_typeof(content->'content') = 'array'
      AND jsonb_array_length(content->'content') = 0
    )
  );
