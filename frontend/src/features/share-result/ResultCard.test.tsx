import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import { env } from '@/shared/config/env';
import type { components } from '@/shared/api/schema';

import { ResultCard } from './ResultCard';

type SessionSummaryOut = components['schemas']['SessionSummaryOut'];

const summary: SessionSummaryOut = {
  seq_number: 7,
  finished_at: '2026-06-15T10:30:00Z',
  duration_seconds: 3600,
  avg_rest_seconds: 90,
  exercises: [
    { name: 'Жим лёжа', max: { value: 100, delta: 5 }, avg: { value: 80, delta: 0 }, min: { value: 60, delta: -2 } },
  ],
} as SessionSummaryOut;

it('renders brand, workout number and at least one exercise', () => {
  render(<ResultCard summary={summary} />);
  // Бренд — один логотип (иконка + словесный знак), а не логотип плюс
  // подпись текстом: раньше рядом стоял <span>DopaFit</span>, и на картинке
  // название читалось дважды. Имя доступно через aria-label логотипа.
  expect(screen.getByRole('img', { name: 'DopaFit' })).toBeInTheDocument();
  expect(screen.queryByText('DopaFit')).not.toBeInTheDocument();
  expect(screen.getByText(/Тренировка #7/)).toBeInTheDocument();
  expect(screen.getByText('Жим лёжа')).toBeInTheDocument();
  expect(screen.getByText(/100/)).toBeInTheDocument();
});

it('подписывает карточку доменом приложения, а не заглушкой dopafit.app', () => {
  render(<ResultCard summary={summary} />);
  // `dopafit.app` — домен-заглушка из дефолтов backend/config.ts; стенд живёт
  // на другом адресе, и картинка уезжала людям со ссылкой в никуда.
  expect(screen.queryByText('dopafit.app')).not.toBeInTheDocument();
  // Подпись — хост самого приложения; в тестовой среде это origin jsdom.
  expect(screen.getByText(new URL(env.apiUrl).host)).toBeInTheDocument();
});
