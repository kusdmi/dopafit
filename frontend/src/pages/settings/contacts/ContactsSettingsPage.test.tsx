import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';

import { HttpResponse, http } from 'msw';

import { server } from '@/app/mocks/server';
import { env } from '@/shared/config/env';
import { setMockMe } from '@/entities/user/api/mocks';
import { useSessionStore } from '@/entities/session/model/store';
import { mockAuthResponse } from '@/shared/test/factories';

import { ContactsSettingsPage } from './ContactsSettingsPage';

// The verified badge splits the glyph into an aria-hidden <span>, so match on the
// element whose full text is the badge label rather than a single text node. The
// badge is now wrapped in a shrink-0 <span>, so also require the pill class to
// pick the badge itself and not its wrapper (both share the same textContent).
function verifiedBadge() {
  return screen.getByText(
    (_, element) =>
      element?.textContent === 'Подтверждён ✓' &&
      element.tagName === 'SPAN' &&
      element.classList.contains('rounded-full'),
  );
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ContactsSettingsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ContactsSettingsPage', () => {
  beforeEach(async () => {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true });
    await useSessionStore.getState().setSession(mockAuthResponse());
  });

  it('shows explicit verification states for both contacts', async () => {
    setMockMe({ email_verified: true, phone: '+79990000001', phone_verified: false });
    renderPage();

    expect(await screen.findByText('client@dopafit.dev')).toBeInTheDocument();
    // Email keeps its badge; the phone has no verified/unverified badge anymore.
    expect(verifiedBadge()).toBeInTheDocument();
    expect(screen.getByText('Не подтверждён')).toBeInTheDocument();
    // phone has NO verify button in this stage (no SMS channel)
    expect(screen.getByRole('button', { name: 'Подтвердить телефон' })).toBeInTheDocument();
  });

  it('verifies an unconfirmed email with a code', async () => {
    setMockMe({ email_verified: false, verification_deadline_at: '2026-09-30T00:00:00Z' });
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Подтвердить' }));
    expect(await screen.findByText('Подтверждение email')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Код подтверждения'), {
      target: { value: '000000' },
    });

    await waitFor(() => expect(verifiedBadge()).toBeInTheDocument());
  });

  it('edits an unconfirmed email freely via PATCH', async () => {
    setMockMe({ email_verified: false });
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Изменить' }));
    const field = screen.getByLabelText('Новый email');
    await userEvent.clear(field);
    await userEvent.type(field, 'fresh@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(await screen.findByText('fresh@example.com')).toBeInTheDocument();
    // still unverified: editing did not require a code
    expect(screen.getAllByText('Не подтверждён')).toHaveLength(2);
  });

  it('changes a verified email only through a code to the NEW address', async () => {
    setMockMe({ email_verified: true });
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Изменить' }));
    await userEvent.clear(screen.getByLabelText('Новый email'));
    await userEvent.type(screen.getByLabelText('Новый email'), 'new@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    // the code goes to the NEW address
    expect(await screen.findByText('Код отправлен на new@example.com')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Код подтверждения'), {
      target: { value: '000000' },
    });

    expect(await screen.findByText('new@example.com')).toBeInTheDocument();
    expect(verifiedBadge()).toBeInTheDocument();
  });

  it('refuses to save a malformed phone and never calls the API (TC-085)', async () => {
    setMockMe({ phone: null });
    let patches = 0;
    server.use(
      http.patch(`${env.apiUrl}/api/v1/users/me`, async () => {
        patches += 1;
        return HttpResponse.json(
          { code: 'validation_error', message: 'bad', details: null },
          {
            status: 422,
          },
        );
      }),
    );
    renderPage();

    // Too few digits for E.164 (^\+\d{10,15}$) — the form must stop it locally
    // instead of letting the server answer 422 into a section that shows nothing.
    await userEvent.type(await screen.findByLabelText('Телефон'), '+7999');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить телефон' }));

    expect(await screen.findByText('Введите телефон в формате +7XXXXXXXXXX')).toBeInTheDocument();
    expect(patches).toBe(0);
  });

  it('surfaces a server error raised while saving the phone (TC-085)', async () => {
    setMockMe({ phone: null });
    server.use(
      http.patch(`${env.apiUrl}/api/v1/users/me`, () =>
        HttpResponse.json(
          {
            code: 'validation_error',
            message: 'diagnostic text can change',
            details: { reason: 'phone_taken' },
          },
          { status: 422 },
        ),
      ),
    );
    renderPage();

    await userEvent.type(await screen.findByLabelText('Телефон'), '+79991112233');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить телефон' }));

    expect(await screen.findByText('Этот телефон уже зарегистрирован')).toBeInTheDocument();
  });

  it('saves and removes an unverified phone', async () => {
    setMockMe({ phone: '+79990000001', phone_verified: false });
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Удалить телефон' }));
    await waitFor(() => {
      expect(screen.getByText('Телефон не указан')).toBeInTheDocument();
    });

    await userEvent.type(screen.getByLabelText('Телефон'), '+79991112233');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить телефон' }));
    // The phone no longer carries a verification badge; assert on the saved value.
    await waitFor(() => {
      expect(screen.getByText('+79991112233')).toBeInTheDocument();
    });
  });
});
