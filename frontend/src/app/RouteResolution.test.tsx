import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { useOnboardingStore } from '@/entities/onboarding/model/store';
import { useSessionStore } from '@/entities/session/model/store';
import { paths, connectionEdit, program } from '@/shared/config/paths';
import { mockAuthResponse } from '@/shared/test/factories';

import { AppRoutes } from './router';

// Эти тесты — СТОРОЖ инварианта структуры роутинга (router.tsx):
//   1. разрешение коллизий exact-роутов под last-match-wins (matchRoute) —
//      статические сегменты должны побеждать параметрический /:id;
//   2. auth-сплит и редиректы: гость на пути зоны /app/* → ProtectedTabs →
//      Navigate to /welcome; авторизованный на /welcome → гард WelcomePage →
//      /app/home; неизвестный /app/*-путь → внутренний catch-all → /app/home.
// React Router разрешает маршрут по специфичности пути, поэтому оба инварианта
// проверяемы в jsdom обычным рендером.
//
// Тесты НЕ тавтологичны: если порядок Route в router.tsx сломать (поставить
// /app/programs/:id ПОСЛЕ статических, либо first-match-семантику как Switch),
// /app/programs/new отрендерит ProgramDetailPage и assert на placeholder
// «Название программы» упадёт. Если убрать гард зоны — guest на /app/programs
// увидит табы, а не welcome, и assert упадёт.

async function signIn(role: 'client' | 'trainer' = 'client') {
  await useSessionStore
    .getState()
    .setSession(mockAuthResponse({ email: 'client@dopafit.dev', phone: '+79990000001', role }));
}

function renderRoute(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  window.history.pushState({}, '', path);
  return render(
    <QueryClientProvider client={queryClient}>
      <AppRoutes />
    </QueryClientProvider>,
  );
}

describe('route collision resolution (last-match-wins под matchRoute)', () => {
  beforeEach(async () => {
    await useSessionStore.getState().clearSession();
    await signIn();
  });

  it('uses accessible bottom navigation and preserves a hidden previous screen', async () => {
    const user = userEvent.setup();
    renderRoute(paths.programNew);
    await screen.findByPlaceholderText('Название программы');
    const navigation = screen.getByRole('navigation', { name: 'Основная навигация' });
    expect(navigation).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Замеры' }));
    expect(await screen.findByRole('link', { name: 'Замеры' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByPlaceholderText('Название программы')).not.toBeVisible();
    expect(document.querySelector('ion-router-outlet')).toBeNull();
  });

  it('renders the program builder, not the detail page, on /app/programs/new', async () => {
    renderRoute(paths.programNew);

    // Признак ProgramBuilderPage: поле «Название программы» (есть ТОЛЬКО в билдере).
    expect(await screen.findByPlaceholderText('Название программы')).toBeInTheDocument();
    expect(screen.getByText('Новая программа')).toBeInTheDocument();
    // Доказываем что это НЕ каталог: поиска упражнений тут нет.
    expect(screen.queryByPlaceholderText('Поиск упражнения')).not.toBeInTheDocument();
  });

  it('renders the exercise catalog, not the detail page, on /app/programs/exercises', async () => {
    renderRoute(paths.exercises);

    // Признак ExercisesPage: поле поиска упражнений (есть ТОЛЬКО в каталоге).
    expect(await screen.findByPlaceholderText('Поиск упражнения')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Все упражнения' })).toBeInTheDocument();
    // Доказываем что это НЕ билдер.
    expect(screen.queryByPlaceholderText('Название программы')).not.toBeInTheDocument();
  });

  it('renders the program detail page on /app/programs/<non-uuid-id>', async () => {
    // НЕ-uuid id доказывает независимость матчинга от формата id.
    renderRoute(program('std-strength'));

    // ProgramDetailPage держит в шапке постоянный заголовок «Программа
    // тренировки» (Figma 932:1941; название программы переехало в плашку под
    // шапкой). Устойчивый признак, отличающий её от билдера/каталога:
    // этот заголовок И отсутствие полей билдера/каталога.
    expect(await screen.findByText('Программа тренировки')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Назад' })).toBeInTheDocument();
    // НЕ билдер и НЕ каталог:
    expect(screen.queryByPlaceholderText('Название программы')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Поиск упражнения')).not.toBeInTheDocument();
    expect(screen.queryByText('Упражнения')).not.toBeInTheDocument();
  });

  it('renders the add-client form, not the edit page, on /app/settings/connections/add', async () => {
    // These are trainer-only pages (role guard); sign in as a trainer.
    await signIn('trainer');
    renderRoute(paths.connectionAdd);

    // «add» не должен перехватываться параметрическим /app/settings/connections/:id/edit.
    expect(await screen.findByText('Добавить клиента')).toBeInTheDocument();
    expect(screen.queryByText('Редактирование клиента')).not.toBeInTheDocument();
  });

  it('renders the client edit page on /app/settings/connections/<id>/edit', async () => {
    await signIn('trainer');
    renderRoute(connectionEdit('abc-123'));

    expect(await screen.findByText('Редактирование клиента')).toBeInTheDocument();
    expect(screen.queryByText('Добавить клиента')).not.toBeInTheDocument();
  });
});

describe('auth-guard zones and redirects (inline-гард)', () => {
  beforeEach(async () => {
    await useSessionStore.getState().clearSession();
  });

  it('redirects a guest from an authorized path to /welcome', async () => {
    // Гость (isAuthenticated=false) на пути зоны /app/programs: Route path="/app"
    // → ProtectedTabs видит !isAuthenticated → <Navigate replace to="/welcome"> →
    // WelcomePage. Табы для гостя не монтируются.
    renderRoute(paths.programs);

    // Признак WelcomePage, а НЕ табов/программ.
    expect(await screen.findByRole('img', { name: 'DopaFit' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Войти' })).toBeInTheDocument();
    // Каталог программ не отрендерился.
    expect(screen.queryByPlaceholderText('Поиск упражнения')).not.toBeInTheDocument();
  });

  it('keeps a guest on /register (onboarding route is outside the auth split)', async () => {
    // /register рендерится в outlet ВСЕГДА (onboardingChildren), не перехватывается
    // гостевым catch-all — иначе онбординг-флоу был бы недоступен.
    renderRoute('/register');

    // Признак account-шага RegisterFlow: поле «Имя».
    expect(await screen.findByLabelText('Имя')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'DopaFit' })).not.toBeInTheDocument();
  });

  it('redirects an authorized user from /welcome to /app/home', async () => {
    await signIn();
    renderRoute(paths.welcome);

    // Признак HomePage: карточка «Серия». Welcome не должен показаться —
    // проверяем по его собственным кнопкам входа/регистрации, а не по
    // отсутствию логотипа: логотип есть и в шапке главной.
    expect(await screen.findByText('Серия')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Войти' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Регистрация' })).not.toBeInTheDocument();
  });

  it('redirects an authorized user from /welcome/ (trailing slash) to /app/home', async () => {
    // The browser may append a trailing slash; the view-gate must still
    // fire so the authorised user is not left on the welcome screen.
    await signIn();
    renderRoute(`${paths.welcome}/`);

    expect(await screen.findByText('Серия')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Войти' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Регистрация' })).not.toBeInTheDocument();
  });

  it('redirects an authorized user from an unknown /app path to /app/home (catch-all)', async () => {
    await signIn();
    renderRoute(`${paths.app}/totally-unknown-xyz`);

    // Внутренний catch-all зоны /app уводит на главную.
    expect(await screen.findByText('Серия')).toBeInTheDocument();
  });

  it('renders the login page for a guest on /login', async () => {
    renderRoute(paths.login);

    // Гостевой exact-Route /login не пересекается с зоной /app.
    expect(await screen.findByText('Вход')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'DopaFit' })).not.toBeInTheDocument();
  });
});

// Реферальная ссылка `/invite/:code` — единственный маршрут, который ничего не
// рисует сам: он перекладывает код приглашения в регистрацию. Маршрута не было
// вовсе, ссылка проваливалась в catch-all `path="*"` и уезжала на /welcome, а
// код терялся молча — пригласивший не получал реферала.
describe('реферальная ссылка /invite/:code', () => {
  beforeEach(async () => {
    await useSessionStore.getState().clearSession();
  });

  it('открывает гостю регистрацию с подставленным кодом приглашения', async () => {
    renderRoute('/invite/ABC123');

    const field = await screen.findByLabelText('Код приглашения');
    expect(field).toHaveValue('ABC123');
  });

  it('не роняет гостя на /welcome, как это делал catch-all', async () => {
    renderRoute('/invite/ABC123');

    expect(await screen.findByLabelText('Код приглашения')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Войти' })).not.toBeInTheDocument();
  });

  it('уводит уже авторизованного на главную, а не в регистрацию', async () => {
    await signIn();
    renderRoute('/invite/ABC123');

    expect(await screen.findByText('Серия')).toBeInTheDocument();
    expect(screen.queryByLabelText('Код приглашения')).not.toBeInTheDocument();
  });
});

// Онбординг первого запуска: корень «/» разводит три случая — авторизован,
// первый запуск, и гость, который онбординг уже смотрел.
describe('onboarding on first launch', () => {
  beforeEach(async () => {
    await useSessionStore.getState().clearSession();
    useOnboardingStore.getState().reset();
  });

  it('sends a first-launch guest from the root to the onboarding', async () => {
    renderRoute(paths.root);
    expect(await screen.findByRole('button', { name: 'Далее' })).toBeInTheDocument();
  });

  it('sends a guest who already saw it from the root to /welcome', async () => {
    useOnboardingStore.getState().markSeen();
    renderRoute(paths.root);
    expect(await screen.findByRole('button', { name: 'Войти' })).toBeInTheDocument();
  });

  // Вернувшийся пользователь с пустым флагом (переустановка при живом Keychain)
  // должен попасть на свою главную, а не на экран первого запуска.
  it('never shows the onboarding to an authenticated user', async () => {
    await signIn();
    renderRoute(paths.root);
    expect(
      await screen.findByRole('navigation', { name: 'Основная навигация' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Далее' })).not.toBeInTheDocument();
  });

  it('closes the onboarding for good once it is finished', async () => {
    const user = userEvent.setup();
    renderRoute(paths.root);

    await user.click(await screen.findByRole('button', { name: 'Далее' }));

    expect(await screen.findByRole('button', { name: 'Войти' })).toBeInTheDocument();
    expect(useOnboardingStore.getState().seen).toBe(true);
  });
});
