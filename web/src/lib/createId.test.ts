import { afterEach, describe, expect, it, vi } from 'vitest';
import { createId } from './createId';

describe('createId', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses crypto.randomUUID when available', () => {
    const randomUUID = vi.fn(() => '11111111-1111-4111-8111-111111111111');
    vi.stubGlobal('crypto', { randomUUID });

    expect(createId('id')).toBe('11111111-1111-4111-8111-111111111111');
    expect(randomUUID).toHaveBeenCalledOnce();
  });

  it('falls back when randomUUID throws (non-secure HTTP context)', () => {
    vi.stubGlobal('crypto', {
      randomUUID: () => {
        throw new TypeError('randomUUID is not available');
      },
    });

    const id = createId('fg');
    expect(id.startsWith('fg-')).toBe(true);
  });

  it('falls back when crypto.randomUUID is missing', () => {
    vi.stubGlobal('crypto', {});

    const id = createId('msg');
    expect(id.startsWith('msg-')).toBe(true);
  });
});
