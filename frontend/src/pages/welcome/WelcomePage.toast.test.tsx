import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useSessionStore } from '@/entities/session/model/store';
import { paths } from '@/shared/config/paths';
import { ACCOUNT_DELETED_TOAST_FLAG } from '@/shared/config/session-flags';

import { WelcomePage } from './WelcomePage';

// Mock the primitives with a passthrough Page/PageContent and a spy for useToast,
// so the "account deleted" toast can be asserted without rendering the real one.
const present = vi.fn(async () => {});
vi.mock('@/shared/ui/primitives', async (importActual) => {
  const actual = await importActual<typeof import('@/shared/ui/primitives')>();
  const { createElement } = await import('react');
  const passthrough =
    (tag: string) =>
    ({ children, ...rest }: Record<string, unknown> & { children?: unknown }) =>
      createElement(tag, rest as Record<string, unknown>, children as never);
  return {
    ...actual,
    Page: passthrough('div'),
    PageContent: passthrough('div'),
    useToast: () => [present, vi.fn(async () => {})],
  };
});

describe('WelcomePage account-deleted toast (UX-6)', () => {
  beforeEach(async () => {
    present.mockClear();
    sessionStorage.removeItem(ACCOUNT_DELETED_TOAST_FLAG);
    // Guest: after the delete teardown the session is cleared, so welcome does
    // not redirect and can show the toast.
    await useSessionStore.getState().clearSession();
  });
  afterEach(() => {
    sessionStorage.removeItem(ACCOUNT_DELETED_TOAST_FLAG);
  });

  function renderWelcome() {
    return render(
      <MemoryRouter initialEntries={[paths.welcome]}>
        <WelcomePage />
      </MemoryRouter>,
    );
  }

  it('shows the toast once and clears the flag when it is set', async () => {
    sessionStorage.setItem(ACCOUNT_DELETED_TOAST_FLAG, '1');
    renderWelcome();

    await waitFor(() => {
      expect(present).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Аккаунт удалён' }),
      );
    });
    // The flag is one-shot: a later visit must not re-fire the toast.
    expect(sessionStorage.getItem(ACCOUNT_DELETED_TOAST_FLAG)).toBeNull();
  });

  it('does not show the toast when the flag is absent', async () => {
    renderWelcome();
    // Give any effect a tick to run.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(present).not.toHaveBeenCalled();
  });
});
