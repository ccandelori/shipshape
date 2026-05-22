import { describe, it, expect } from 'vitest'
import * as Y from 'yjs'
import { yjsToJson, isTipTapDoc, type TipTapDoc } from '../yjsConverter.js'

/**
 * Regression coverage for the silent-NULL-persist bug captured in
 * orientation/baselines/runtime-errors/evidence/yjs-to-json-null.md.
 *
 * The audit confirmed live: a buggy yjsToJson path can return `undefined`,
 * `JSON.stringify(undefined)` returns the JS value `undefined`, which pg
 * coerces to SQL NULL — silently emptying documents.content while
 * yjs_state survives. REST reads then see an empty document.
 *
 * The fix has two parts:
 *   1. yjsToJson's return type is narrowed to TipTapDoc so a missing
 *      return statement is a compile-time error.
 *   2. The persist site in api/src/collaboration/index.ts now guards the
 *      content write with isTipTapDoc(); these tests pin both layers.
 */
describe('yjsToJson silent-NULL regression guard', () => {
  it('returns a TipTap-shaped doc for an empty fragment', () => {
    const doc = new Y.Doc()
    const fragment = doc.getXmlFragment('default')

    const result: TipTapDoc = yjsToJson(fragment)

    expect(result).toEqual({ type: 'doc', content: [] })
    expect(isTipTapDoc(result)).toBe(true)
  })

  it('returns a TipTap-shaped doc for a non-empty fragment', () => {
    const doc = new Y.Doc()
    const fragment = doc.getXmlFragment('default')
    doc.transact(() => {
      const para = new Y.XmlElement('paragraph')
      fragment.push([para])
      const text = new Y.XmlText()
      para.push([text])
      text.insert(0, 'hello world')
    })

    const result = yjsToJson(fragment)

    expect(result.type).toBe('doc')
    expect(Array.isArray(result.content)).toBe(true)
    expect(result.content.length).toBeGreaterThan(0)
  })

  it('isTipTapDoc rejects undefined (the silent-NULL trigger value)', () => {
    expect(isTipTapDoc(undefined)).toBe(false)
  })

  it('isTipTapDoc rejects null, primitives, and arrays', () => {
    expect(isTipTapDoc(null)).toBe(false)
    expect(isTipTapDoc('string')).toBe(false)
    expect(isTipTapDoc(42)).toBe(false)
    expect(isTipTapDoc([])).toBe(false)
  })

  it('isTipTapDoc rejects objects with the wrong type discriminator', () => {
    expect(isTipTapDoc({ type: 'paragraph', content: [] })).toBe(false)
    expect(isTipTapDoc({ content: [] })).toBe(false)
  })

  it('isTipTapDoc rejects objects without a content array', () => {
    expect(isTipTapDoc({ type: 'doc' })).toBe(false)
    expect(isTipTapDoc({ type: 'doc', content: null })).toBe(false)
    expect(isTipTapDoc({ type: 'doc', content: 'not-an-array' })).toBe(false)
  })

  it('isTipTapDoc accepts a minimal valid TipTap doc', () => {
    expect(isTipTapDoc({ type: 'doc', content: [] })).toBe(true)
    expect(
      isTipTapDoc({ type: 'doc', content: [{ type: 'paragraph' }] })
    ).toBe(true)
  })
})
