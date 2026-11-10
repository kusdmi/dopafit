import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useSessionStore } from '@/entities/session/model/store';
import { mockAuthResponse } from '@/shared/test/factories';

import { OfflineIndicator } from './OfflineIndicator';

// Детерминируем сетевой статус: реальный хук пингует /health, здесь мокаем.
let offline = false;
vi.mock('@/shared/lib/network/useNetworkStatus', () => ({
  useNetworkStatus: () => ({ isOnline: !offline, isOffline: offline }),
}));

async function signIn() {
  await useSessionStore.getState().setSession(mockAuthResponse({ email: 'c@dopafit.dev' }));
}

describe('OfflineIndicator', () => {
  beforeEach(async () => {
    offline = false;
    await useSessionStore.getState().clearSession();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing while online', async () => {
    await signIn();
    render(<OfflineIndicator />);
    expect(screen.queryByRole('button', { name: 'Офлайн-режим' })).not.toBeInTheDocument();
  });

  it('renders nothing when offline but not authenticated (guest screens)', () => {
    offline = true;
    render(<OfflineIndicator />);
    expect(screen.queryByRole('button', { name: 'Офлайн-режим' })).not.toBeInTheDocument();
  });

  it('shows the icon-button when offline and authenticated', async () => {
    offline = true;
    await signIn();
    render(<OfflineIndicator />);
    expect(screen.getByRole('button', { name: 'Офлайн-режим' })).toBeInTheDocument();
    // Поповер закрыт по умолчанию.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('sits below the header band so it never covers toolbar end-slot buttons (M2)', async () => {
    offline = true;
    await signIn();
    render(<OfflineIndicator />);
    const button = screen.getByRole('button', { name: 'Офлайн-режим' });
    const wrapper = button.parentElement as HTMLElement;
    // Offset by the full header band (safe-area + toolbar) via the shared CSS
    // custom property, not by a bare safe-area inset that would overlap buttons.
    expect(wrapper).toHaveStyle({ top: 'calc(var(--header-space) + 0.5rem)' });
  });

  it('toggles the explanatory popover on tap', async () => {
    offline = true;
    await signIn();
    render(<OfflineIndicator />);
    const button = screen.getByRole('button', { name: 'Офлайн-режим' });

    await userEvent.click(button);
    expect(screen.getByRole('dialog', { name: 'Офлайн-режим' })).toBeInTheDocument();
    expect(screen.getByText(/синхронизируются автоматически/)).toBeInTheDocument();
    expect(button).toHaveAttribute('aria-expanded', 'true');

    await userEvent.click(button);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
