import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { createApp } from '../app.js'

/**
 * Regression tests for the global error handler added in
 * security/shipshape-fixes-2026-05 in response to a shipshapesec
 * Verbose-error finding.
 *
 * The default Express error handler renders an HTML page containing
 * the full SyntaxError stack trace and absolute filesystem paths
 * when the body parser rejects malformed JSON. These tests pin the
 * generic-JSON response shape so that the leak does not regress.
 */
describe('global error handler', () => {
  const app = createApp()

  it('returns a generic JSON 400 for malformed JSON request bodies', async () => {
    const res = await request(app)
      .post('/api/documents')
      .set('Content-Type', 'application/json')
      .send('{not json')

    expect(res.status).toBe(400)
    expect(res.headers['content-type']).toMatch(/application\/json/)
    expect(res.body).toEqual({ error: 'Malformed JSON in request body.' })
  })

  it('does not leak a SyntaxError stack trace on malformed JSON', async () => {
    const res = await request(app)
      .post('/api/documents')
      .set('Content-Type', 'application/json')
      .send('{"unterminated')

    // The leaked payload looked like:
    //   <pre>SyntaxError: ... at JSON.parse ... at /Users/sheep/...</pre>
    // None of those needles should appear in a sanitised response.
    const body = JSON.stringify(res.body)
    expect(body).not.toMatch(/SyntaxError/i)
    expect(body).not.toMatch(/at JSON\.parse/)
    expect(body).not.toMatch(/\/Users\//)
    expect(body).not.toMatch(/\/home\//)
    expect(body).not.toMatch(/node_modules/)
    expect(res.text).not.toMatch(/<!DOCTYPE html>/i)
  })

  it('returns generic JSON 400 across multiple route prefixes', async () => {
    for (const path of ['/api/issues', '/api/projects', '/api/programs']) {
      const res = await request(app)
        .post(path)
        .set('Content-Type', 'application/json')
        .send('{')
      expect(res.status, `${path} should reject malformed JSON with 400`).toBe(400)
      expect(res.body, `${path} should return generic error JSON`).toEqual({
        error: 'Malformed JSON in request body.',
      })
    }
  })

})
