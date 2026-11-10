import { afterEach, expect, it, vi } from 'vitest';
import { trackStandaloneKeyboard } from './keyboard';

vi.mock('@/shared/config/env', () => ({ env: { isNative: false } }));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute('data-keyboard-open');
  document.body.replaceChildren();
});

it('ignores the status-bar delta and reserves keyboard overlap without shrinking the shell', () => {
  const viewport = Object.assign(new EventTarget(), { height: 784, offsetTop: 0 });
  vi.stubGlobal('visualViewport', viewport);
  vi.stubGlobal('CSS', { supports: () => true });
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    height: 844,
  } as DOMRect);
  const field = document.createElement('input');
  document.body.append(field);
  field.focus();
  const stop = trackStandaloneKeyboard();
  const read = () => document.documentElement.style.getPropertyValue('--keyboard-overlap');
  expect(read()).toBe('');
  viewport.height = 480;
  viewport.offsetTop = 20;
  viewport.dispatchEvent(new Event('resize'));
  expect(read()).toBe('344px');
  field.blur();
  viewport.dispatchEvent(new Event('resize'));
  expect(read()).toBe('344px');
  viewport.height = 784;
  viewport.offsetTop = 0;
  viewport.dispatchEvent(new Event('resize'));
  expect(read()).toBe('');
  stop();
  viewport.height = 400;
  field.focus();
  viewport.dispatchEvent(new Event('resize'));
  expect(read()).toBe('');
  expect(document.body.children).toHaveLength(1);
});

it('does not mistake an external keyboard, pinch zoom or rotation for software keyboard overlap', () => {
  const viewport = Object.assign(new EventTarget(), {
    height: 844,
    width: 390,
    offsetTop: 0,
    scale: 1,
  });
  vi.stubGlobal('visualViewport', viewport);
  let layoutHeight = 844;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    () => ({ height: layoutHeight }) as DOMRect,
  );
  const field = document.createElement('input');
  document.body.append(field);
  field.focus();
  const stop = trackStandaloneKeyboard();
  expect(document.documentElement).not.toHaveAttribute('data-keyboard-open');
  viewport.height = 400;
  viewport.scale = 2;
  viewport.dispatchEvent(new Event('resize'));
  expect(document.documentElement).not.toHaveAttribute('data-keyboard-open');
  viewport.scale = 1;
  viewport.width = 844;
  layoutHeight = 390;
  viewport.height = 390;
  viewport.dispatchEvent(new Event('resize'));
  expect(document.documentElement).not.toHaveAttribute('data-keyboard-open');
  stop();
});
