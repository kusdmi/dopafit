import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useOnboardingStore } from '@/entities/onboarding/model/store';
import { ONBOARDING_SLIDES } from '@/entities/onboarding/model/slides';
import { paths } from '@/shared/config/paths';

import { OnboardingPage } from './OnboardingPage';

function LocationProbe() {
  const location = useLocation();
  return <span>at {location.pathname}</span>;
}

function renderOnboarding() {
  return render(
    <MemoryRouter initialEntries={[paths.onboarding]}>
      <Routes>
        <Route path={paths.onboarding} element={<OnboardingPage />} />
        <Route path={paths.welcome} element={<span>экран приветствия</span>} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
  );
}

describe('OnboardingPage', () => {
  beforeEach(() => useOnboardingStore.getState().reset());

  it('shows the slide from the content model', () => {
    renderOnboarding();
    const [first] = ONBOARDING_SLIDES;
    for (const line of first!.quote) {
      expect(screen.getByText(line)).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: 'Далее' })).toBeInTheDocument();
  });

  it('leaves for the welcome screen and remembers it was seen', async () => {
    renderOnboarding();

    await userEvent.click(screen.getByRole('button', { name: 'Далее' }));

    expect(screen.getByText('экран приветствия')).toBeInTheDocument();
    expect(useOnboardingStore.getState().seen).toBe(true);
  });

  // Прямой заход на уже просмотренный онбординг — это возврат к экрану первого
  // запуска, которого пользователь не просил.
  it('redirects to welcome when the onboarding was already seen', () => {
    useOnboardingStore.getState().markSeen();
    renderOnboarding();
    expect(screen.getByText(`at ${paths.welcome}`)).toBeInTheDocument();
  });

  // Единственный слайд — точки были бы управлением, которому нечего переключать.
  it('hides the dots while there is only one slide', () => {
    expect(ONBOARDING_SLIDES).toHaveLength(1);
    const { container } = renderOnboarding();
    expect(container.querySelectorAll('[aria-hidden="true"] > span')).toHaveLength(0);
  });
});

// Слайдер — заявленное будущее экрана: второй слайд должен добавляться правкой
// ONBOARDING_SLIDES, без изменений разметки. Поэтому проверяем на подменённом
// контенте, что «Далее» листает, а онбординг закрывается только на последнем.
describe('OnboardingPage as a slider', () => {
  const original = [...ONBOARDING_SLIDES];

  beforeEach(() => {
    useOnboardingStore.getState().reset();
    ONBOARDING_SLIDES.splice(0, ONBOARDING_SLIDES.length, original[0]!, {
      id: 'second',
      image: '/onboarding/strength.webp',
      imageAlt: '',
      quote: ['Второй слайд'],
      subtitle: ['Ещё одна подпись'],
    });
  });

  afterEach(() => {
    ONBOARDING_SLIDES.splice(0, ONBOARDING_SLIDES.length, ...original);
  });

  it('advances to the next slide instead of leaving', async () => {
    renderOnboarding();

    await userEvent.click(screen.getByRole('button', { name: 'Далее' }));

    expect(screen.getByText('Второй слайд')).toBeInTheDocument();
    // Онбординг ещё не пройден: закрывает его только последний слайд.
    expect(useOnboardingStore.getState().seen).toBe(false);
    expect(screen.queryByText('экран приветствия')).not.toBeInTheDocument();
  });

  it('leaves only after the last slide', async () => {
    renderOnboarding();

    await userEvent.click(screen.getByRole('button', { name: 'Далее' }));
    await userEvent.click(screen.getByRole('button', { name: 'Далее' }));

    expect(screen.getByText('экран приветствия')).toBeInTheDocument();
    expect(useOnboardingStore.getState().seen).toBe(true);
  });

  it('shows one dot per slide and marks the current one', () => {
    const { container } = renderOnboarding();
    const dots = container.querySelectorAll('[aria-hidden="true"] > span');
    expect(dots).toHaveLength(2);
    expect(dots[0]!.className).toContain('bg-brand-400');
    expect(dots[1]!.className).not.toContain('bg-brand-400');
  });
});
