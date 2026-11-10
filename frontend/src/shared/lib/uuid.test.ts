import { afterEach, describe, expect, it } from 'vitest';

import { safeRandomUUID } from './uuid';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('safeRandomUUID', () => {
  const originalRandomUUID = crypto.randomUUID;

  afterEach(() => {
    // Restore native randomUUID in case a test removed it.
    Object.defineProperty(crypto, 'randomUUID', {
      configurable: true,
      writable: true,
      value: originalRandomUUID,
    });
  });

  it('returns a valid UUID v4 (secure context, native randomUUID)', () => {
    expect(safeRandomUUID()).toMatch(UUID_V4);
  });

  it('returns unique values across calls', () => {
    expect(safeRandomUUID()).not.toBe(safeRandomUUID());
  });

  it('falls back to getRandomValues when randomUUID is unavailable (non-secure context)', () => {
    // Simulate http://<LAN-IP> live-reload: randomUUID is missing entirely.
    Object.defineProperty(crypto, 'randomUUID', {
      configurable: true,
      writable: true,
      value: undefined,
    });
    expect(typeof crypto.randomUUID).not.toBe('function');

    const id = safeRandomUUID();
    expect(id).toMatch(UUID_V4);
    // Fallback path must also be unique.
    expect(id).not.toBe(safeRandomUUID());
  });
});
