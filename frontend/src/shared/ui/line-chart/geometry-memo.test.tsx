import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Шпион на настоящую computeGeometry: подменяем модуль геометрии обёрткой,
// которая считает вызовы и делегирует оригиналу. Так тест проверяет не «ссылка
// на массив стабильна» (это следствие), а ровно то, что стоит денег, —
// пересчитывается ли геометрия на рендере, в котором данные не менялись.
const computeGeometrySpy = vi.fn();

vi.mock('@/shared/ui/line-chart/geometry', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./geometry')>();
  return {
    ...actual,
    computeGeometry: (...args: Parameters<typeof actual.computeGeometry>) => {
      computeGeometrySpy();
      return actual.computeGeometry(...args);
    },
  };
});

import { useSessionStore } from '@/entities/session/model/store';
import { AnthropometryChart } from '@/features/analytics/charts/AnthropometryChart';
import { ExerciseCharts } from '@/features/analytics/charts/ExerciseCharts';
import { HomePage } from '@/pages/home/HomePage';

/**
 * МЕМОИЗАЦИЯ ГЕОМЕТРИИ ГРАФИКОВ.
 *
 * LineChart мемоизирует computeGeometry по ССЫЛКЕ на проп `series`. Все четыре
 * потребителя передавали `series` инлайновым литералом, то есть новым массивом
 * на каждый свой рендер, — и мемо промахивался всегда, когда РОДИТЕЛЬ
 * перерисовывался: геометрия (Set по датам, Map-индекс, min/max по всем
 * значениям, тики, выборка подписей) считалась заново на данных, которые не
 * изменились.
 *
 * ⚠️ ВАЖНО ПРО МАСШТАБ ПРОБЛЕМЫ, чтобы тест не читали как защиту не от того.
 * Сам СКРАБ пальцем эту трату НЕ вызывает: `setActiveIdx` живёт в состоянии
 * ВНУТРИ LineChart, поэтому React перерисовывает только его поддерево, а
 * родитель не рендерится и его литерал не переоценивается. Замерено шпионом:
 * скраб из pointerdown + серии pointermove даёт 0 пересчётов и до правки, и
 * после. Трата возникает ровно на рендерах РОДИТЕЛЯ — смена периода на
 * Главной, правка формы на аналитике, любой сторонний ре-рендер, — по одному
 * лишнему пересчёту на график. Поэтому тесты ниже перерисовывают именно
 * родителя; проверять скрабом было бы вакуумно.
 */

const bumper: { current: () => void } = { current: () => {} };

/**
 * Обёртка, которая перерисовывает САМ потребитель графика (а не соседний узел):
 * состояние живёт здесь, а дочерний элемент создаётся заново на каждом рендере.
 * Через `children` это не работало бы — React увидел бы ту же ссылку на элемент
 * и не стал бы перерисовывать поддерево вовсе (тест был бы зелёным в вакууме).
 */
function AnalyticsHarness({ kind }: { kind: 'anthro' | 'workouts' }) {
  const [, setN] = useState(0);
  // Ссылку на сеттер публикуем в эффекте, а не в теле рендера: присваивание
  // внешней переменной во время рендера — side effect, его запрещает
  // react-hooks/globals (и оно непредсказуемо при повторных рендерах).
  useEffect(() => {
    bumper.current = () => setN((n) => n + 1);
  }, []);
  // Пропы намеренно константны: ре-рендер не должен менять запрос, иначе
  // пересчёт был бы законным и тест ничего не проверял.
  return kind === 'anthro' ? (
    <AnthropometryChart
      params={{ parameters: ['weight'], customSlots: [] }}
      dateFrom="2025-01-01"
      dateTo="2025-06-01"
      clientId={null}
    />
  ) : (
    <ExerciseCharts
      view="program"
      programId=""
      dayId=""
      exerciseId=""
      dateFrom="2025-01-01"
      dateTo="2025-06-01"
      clientId={null}
    />
  );
}

function renderWithClient(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>{ui}</QueryClientProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  computeGeometrySpy.mockClear();
  useSessionStore.setState({ user: { id: 'u1', role: 'client' } as never, isAuthenticated: true });
});

describe('геометрия не пересчитывается на рендере родителя без смены данных', () => {
  it('AnthropometryChart', async () => {
    renderWithClient(<AnalyticsHarness kind="anthro" />);
    // Ждём, пока серия приедет и график построится хотя бы раз: до этого
    // считать нечего и тест был бы зелёным в вакууме.
    await waitFor(() => expect(computeGeometrySpy.mock.calls.length).toBeGreaterThan(0));
    computeGeometrySpy.mockClear();

    act(() => bumper.current());

    expect(computeGeometrySpy).not.toHaveBeenCalled();
  });

  it('ExerciseCharts', async () => {
    renderWithClient(<AnalyticsHarness kind="workouts" />);
    await waitFor(() => expect(computeGeometrySpy.mock.calls.length).toBeGreaterThan(0));
    computeGeometrySpy.mockClear();

    act(() => bumper.current());

    expect(computeGeometrySpy).not.toHaveBeenCalled();
  });

  it('оба графика Главной при смене состояния экрана', async () => {
    renderWithClient(<HomePage />);
    // Якорь тот же, что в HomePage.test.tsx: вес рекорда уникален для ответа
    // дашборда, в отличие от числа серии, которое совпадает с днём календаря.
    await waitFor(() => expect(screen.getByText('100 кг')).toBeInTheDocument());
    await waitFor(() => expect(computeGeometrySpy.mock.calls.length).toBeGreaterThan(0));
    computeGeometrySpy.mockClear();

    // Открытие модалки выбора замера — настоящий ре-рендер HomePage, который
    // НЕ меняет данные графиков: до правки он пересчитывал геометрию обоих.
    act(() => {
      screen.getByLabelText('Сменить тип замера').click();
    });

    expect(computeGeometrySpy).not.toHaveBeenCalled();
  });
});
