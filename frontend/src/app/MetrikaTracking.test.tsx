import { StrictMode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

import { paths } from '@/shared/config/paths';
import { trackMetrikaPage } from '@/shared/lib/telemetry/metrika';
import { MetrikaTracking } from './MetrikaTracking';

vi.mock('@/shared/lib/telemetry/metrika', () => ({
  trackMetrikaPage: vi.fn(),
  trackMetrikaContext: vi.fn(),
}));

function Navigation() {
  const navigate = useNavigate();
  return (
    <>
      <button onClick={() => navigate(`${paths.analytics}?email=private#secret`)}>Аналитика</button>
      <button onClick={() => navigate(`${paths.analytics}?email=other`)}>Фильтр</button>
      <button onClick={() => navigate(-1)}>Назад</button>
    </>
  );
}

it('tracks path changes but excludes query parameters and hashes', () => {
  render(
    <StrictMode>
      <MemoryRouter initialEntries={[paths.home]}>
        <MetrikaTracking />
        <Navigation />
      </MemoryRouter>
    </StrictMode>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Аналитика' }));
  const count = vi.mocked(trackMetrikaPage).mock.calls.length;
  fireEvent.click(screen.getByRole('button', { name: 'Фильтр' }));
  expect(trackMetrikaPage).toHaveBeenCalledTimes(count);
  fireEvent.click(screen.getByRole('button', { name: 'Назад' }));
  fireEvent.click(screen.getByRole('button', { name: 'Назад' }));
  expect(trackMetrikaPage).toHaveBeenLastCalledWith(paths.home);
  expect(vi.mocked(trackMetrikaPage).mock.calls.every(([path]) => !/[?#]/.test(path))).toBe(true);
});
