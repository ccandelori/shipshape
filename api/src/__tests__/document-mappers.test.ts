import { describe, it, expect } from 'vitest'
import {
  mapIssueDocument,
  mapProjectDocument,
  mapProgramDocument,
  mapWeekDocument,
  mapWikiDocument,
  mapPersonDocument,
  mapDocument,
  type RawDocumentRow,
} from '@ship/shared'

/**
 * Risk mitigated: the documents table stores per-type properties in a single
 * JSONB column. Consumers historically cast (`row as IssueDocument` or
 * `(row.properties as IssueProperties).state`) to read fields, which silently
 * accepts wrong-type rows + malformed JSONB + missing required keys. Mappers
 * make bad data fail loudly at the boundary with a message that names the
 * document id.
 *
 * These tests pin the contract:
 *   1. Happy path: a row with the right shape maps cleanly.
 *   2. Wrong document_type: throws with a message naming both the expected
 *      type and the actual type.
 *   3. Bad properties shape: throws with a message naming the doc id.
 *   4. Dispatcher (mapDocument) picks the right per-type mapper.
 */
describe('shared/src/mappers/document-mappers', () => {
  function row(overrides: Partial<RawDocumentRow>): RawDocumentRow {
    return {
      id: 'doc-1',
      workspace_id: 'ws-1',
      document_type: 'issue',
      title: 'Test',
      content: { type: 'doc', content: [] },
      properties: { state: 'todo', priority: 'medium', source: 'internal' },
      ticket_number: 42,
      position: 0,
      created_at: new Date('2024-01-01T00:00:00Z'),
      updated_at: new Date('2024-01-01T00:00:00Z'),
      visibility: 'workspace',
      ...overrides,
    }
  }

  describe('mapIssueDocument', () => {
    it('happy path: valid row maps to IssueDocument', () => {
      const doc = mapIssueDocument(row({}))
      expect(doc.document_type).toBe('issue')
      expect(doc.properties.state).toBe('todo')
      expect(doc.properties.priority).toBe('medium')
      expect(doc.ticket_number).toBe(42)
    })

    it('throws when document_type is not "issue"', () => {
      expect(() => mapIssueDocument(row({ document_type: 'project' }))).toThrow(
        /document_type='issue' received row doc-1 with document_type='project'/
      )
    })

    it('throws when properties is missing required state', () => {
      expect(() => mapIssueDocument(row({ properties: { priority: 'medium', source: 'internal' } }))).toThrow(
        /mapIssueDocument\(doc-1\): properties failed IssueProperties guard/
      )
    })

    it('throws when ticket_number is missing', () => {
      expect(() => mapIssueDocument(row({ ticket_number: null }))).toThrow(
        /ticket_number must be a number for issue documents/
      )
    })

    it('throws when content is not an object', () => {
      expect(() => mapIssueDocument(row({ content: 'string content' }))).toThrow(
        /mapIssueDocument\(doc-1\): content failed JSONContent guard/
      )
    })
  })

  describe('mapProjectDocument', () => {
    it('happy path: valid row maps to ProjectDocument', () => {
      const doc = mapProjectDocument(
        row({
          document_type: 'project',
          properties: { impact: 4, confidence: 3, ease: 5, color: '#005ea2' },
          ticket_number: null,
        })
      )
      expect(doc.document_type).toBe('project')
      expect(doc.properties.color).toBe('#005ea2')
    })

    it('throws when properties is missing color', () => {
      expect(() =>
        mapProjectDocument(
          row({ document_type: 'project', properties: { impact: 4, confidence: 3, ease: 5 } })
        )
      ).toThrow(/properties failed ProjectProperties guard/)
    })
  })

  describe('mapPersonDocument', () => {
    it('happy path: valid row maps to PersonDocument', () => {
      const doc = mapPersonDocument(
        row({
          document_type: 'person',
          properties: { user_id: 'user-123' },
          ticket_number: null,
        })
      )
      expect(doc.document_type).toBe('person')
      expect(doc.properties.user_id).toBe('user-123')
    })

    it('throws when user_id is missing', () => {
      expect(() =>
        mapPersonDocument(row({ document_type: 'person', properties: {} }))
      ).toThrow(/properties failed PersonProperties guard/)
    })
  })

  describe('mapWeekDocument', () => {
    it('happy path: valid row maps to WeekDocument', () => {
      const doc = mapWeekDocument(
        row({
          document_type: 'sprint',
          properties: { sprint_number: 7, owner_id: 'user-1' },
          ticket_number: null,
        })
      )
      expect(doc.document_type).toBe('sprint')
      expect(doc.properties.sprint_number).toBe(7)
    })

    it('throws when sprint_number is not a number', () => {
      expect(() =>
        mapWeekDocument(
          row({ document_type: 'sprint', properties: { sprint_number: 'seven', owner_id: 'user-1' } })
        )
      ).toThrow(/properties failed WeekProperties guard/)
    })
  })

  describe('mapProgramDocument', () => {
    it('happy path: valid row maps to ProgramDocument', () => {
      const doc = mapProgramDocument(
        row({
          document_type: 'program',
          properties: { color: '#22c55e', owner_id: 'user-1' },
          ticket_number: null,
        })
      )
      expect(doc.document_type).toBe('program')
      expect(doc.properties.color).toBe('#22c55e')
    })
  })

  describe('mapWikiDocument', () => {
    it('happy path: empty properties object is valid for wiki', () => {
      const doc = mapWikiDocument(
        row({
          document_type: 'wiki',
          properties: {},
          ticket_number: null,
        })
      )
      expect(doc.document_type).toBe('wiki')
    })
  })

  describe('mapDocument (dispatcher)', () => {
    it('dispatches issue rows to mapIssueDocument', () => {
      const doc = mapDocument(row({}))
      expect(doc.document_type).toBe('issue')
    })

    it('dispatches project rows to mapProjectDocument', () => {
      const doc = mapDocument(
        row({
          document_type: 'project',
          properties: { color: '#005ea2', impact: 4, confidence: 3, ease: 5 },
          ticket_number: null,
        })
      )
      expect(doc.document_type).toBe('project')
    })

    it('throws on unknown document_type', () => {
      expect(() => mapDocument(row({ document_type: 'bogus' }))).toThrow(/unknown document_type 'bogus'/)
    })
  })

  describe('common-field handling', () => {
    it('coerces string timestamps to Date objects', () => {
      const doc = mapIssueDocument(
        row({
          created_at: '2024-06-15T12:34:56Z',
          updated_at: '2024-06-15T12:34:56Z',
        })
      )
      expect(doc.created_at).toBeInstanceOf(Date)
      expect(doc.created_at.getUTCFullYear()).toBe(2024)
    })

    it('preserves null for unset optional timestamps', () => {
      const doc = mapIssueDocument(row({ archived_at: null }))
      expect(doc.archived_at).toBeNull()
    })
  })
})
