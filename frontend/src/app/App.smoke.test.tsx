import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useSessionStore } from '@/entities/session/model/store';

import { App } from './App';

// СТОРОЖ регрессии «No QueryClient set»: монтирует НАСТОЯЩЕЕ дерево <App> со всеми
// провайдерами. Если хук вроде usePushRegistration (useQuery) снова вызвать в теле
// App ВНЕ <PersistQueryClientProvider>, React бросит «No QueryClient set» и App
// упадёт на маунте — этот тест поймает такую регрессию.
//
// Гость без сессии: дерево останавливается на welcome-флоу, без авторизованных
// запросов. Достаточно убедиться, что App смонтировался и ничего не бросил.

describe('App smoke (real tree mounts inside providers)', () => {
  beforeEach(async () => {
    await useSessionStore.getState().clearSession();
    window.history.pushState({}, '', '/welcome');
  });

  it('mounts the full App without a "No QueryClient" crash', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => render(<App />)).not.toThrow();

    // Дерево реально дошло до рендера контента (а не зависло/упало на маунте).
    await waitFor(() => {
      expect(screen.getByRole('img', { name: 'DopaFit' })).toBeInTheDocument();
    });

    const sawQueryClientError = errorSpy.mock.calls.some((args) =>
      args.some((a) => typeof a === 'string' && a.includes('No QueryClient set')),
    );
    expect(sawQueryClientError).toBe(false);

    errorSpy.mockRestore();
  });
});
