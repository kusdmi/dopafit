import type { InvisibleSmartCaptchaProps } from '@yandex/smart-captcha';
import { act, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import CaptchaWidget from './CaptchaWidget';

const widget = vi.hoisted(() => ({ props: {} as InvisibleSmartCaptchaProps }));
vi.mock('@yandex/smart-captcha', () => ({
  InvisibleSmartCaptcha: (props: InvisibleSmartCaptchaProps) => {
    widget.props = props;
    return null;
  },
}));
afterEach(() => vi.useRealTimers());

it('bounds background verification, but gives a visible challenge time to complete', () => {
  vi.useFakeTimers();
  const onError = vi.fn();
  const onCancel = vi.fn();
  const props = { siteKey: 'test', onError, onCancel, onSuccess: vi.fn() };
  const first = render(<CaptchaWidget {...props} />);
  act(() => vi.advanceTimersByTime(30_000));
  expect(onError).toHaveBeenCalledOnce();
  first.unmount();
  onError.mockClear();
  const second = render(<CaptchaWidget {...props} />);
  act(() => widget.props.onChallengeVisible?.());
  act(() => vi.advanceTimersByTime(120_000));
  expect(onError).not.toHaveBeenCalled();
  act(() => widget.props.onChallengeHidden?.());
  second.unmount();
  act(() => vi.runAllTimers());
  expect(onCancel).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});
