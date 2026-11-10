import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import { InstallAppPage } from './InstallAppPage';
const state = vi.hoisted(() => ({
  platform: 'ios',
  native: false,
  standalone: false,
  canPrompt: false,
  promptInstall: vi.fn().mockResolvedValue('dismissed'),
}));
vi.mock('@/shared/lib/platform/pwa/install', () => ({
  usePwaInstall: () => state,
  recordInstallReminder: vi.fn(),
}));

it('switches devices, advances steps and lets users revisit any step', async () => {
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <InstallAppPage />
    </MemoryRouter>,
  );
  const guide = within(screen.getByRole('region', { name: 'Пошаговая инструкция' }));
  expect(guide.getByRole('heading', { name: 'Откройте DopaFit в Safari' })).toBeVisible();
  await user.click(guide.getByRole('button', { name: 'Далее' }));
  expect(guide.getByRole('heading', { name: 'Откройте меню «Поделиться»' })).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Android' }));
  expect(guide.getByRole('heading', { name: 'Откройте DopaFit в Chrome' })).toBeVisible();
  await user.click(guide.getByRole('button', { name: /^Шаг 4:/ }));
  await user.click(guide.getByRole('button', { name: 'Понятно' }));
  expect(screen.getByRole('status')).toHaveTextContent('Инструкция пройдена');
  await user.click(guide.getByRole('button', { name: 'Назад' }));
  expect(guide.getByRole('heading', { name: 'Подтвердите установку' })).toBeVisible();
});
