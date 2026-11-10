import { describe, expect, it } from 'vitest';

import { normalizePathname } from './normalizePathname';

describe('normalizePathname', () => {
  it('returns "/" unchanged (root must not be stripped)', () => {
    expect(normalizePathname('/')).toBe('/');
  });

  it('strips a single trailing slash', () => {
    expect(normalizePathname('/welcome/')).toBe('/welcome');
    expect(normalizePathname('/login/')).toBe('/login');
    expect(normalizePathname('/app/home/')).toBe('/app/home');
  });

  it('leaves paths without a trailing slash unchanged', () => {
    expect(normalizePathname('/welcome')).toBe('/welcome');
    expect(normalizePathname('/app/programs/abc/session')).toBe('/app/programs/abc/session');
  });

  it('strips only the last slash (does not recurse into double slashes)', () => {
    // "/welcome//" → "/welcome/" — single pass, caller should never produce this,
    // but we document the behaviour explicitly.
    expect(normalizePathname('/welcome//')).toBe('/welcome/');
  });
});
