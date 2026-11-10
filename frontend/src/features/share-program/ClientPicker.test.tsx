import { MemoryRouter } from 'react-router-dom';
import { AppFrame } from '@/shared/ui/primitives';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { expect, it } from 'vitest';

import { ClientPicker } from './ClientPicker';

function renderPicker() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <AppFrame>
          <ClientPicker selectedId={null} onSelect={() => {}} />
        </AppFrame>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

it('lists active clients including managed stubs (B008)', async () => {
  // Sharing goes by trainer_client_id and the backend accepts stubs, so the
  // picker now offers managed stubs (client_user_id === null) too, not only
  // linked real clients.
  renderPicker();
  await waitFor(() => expect(screen.getByText('Анна Клиентова')).toBeInTheDocument());
  expect(screen.getByText('Вася')).toBeInTheDocument();
});
