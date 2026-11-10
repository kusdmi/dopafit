import { describe, expect, it } from 'vitest';

import { changeAbs, formatAbs, formatPercent, TONE_COLOR } from './delta';

describe('changeAbs', () => {
  it('is the last point minus the first', () => {
    expect(changeAbs([{ value: 82.5 }, { value: 81 }, { value: 80 }])).toBe(-2.5);
  });

  it('has no change to report with fewer than two points', () => {
    expect(changeAbs([])).toBeNull();
    expect(changeAbs([{ value: 80 }])).toBeNull();
  });

  // Та же база, что и у backend (domain/rules.ts changePercent): последняя
  // минус первая, а не max-min и не разница соседних точек. Если базы
  // разойдутся, две строки подписи начнут спорить друг с другом по знаку.
  it('agrees in sign with the percent the backend computes', () => {
    const points = [{ value: 60 }, { value: 70 }];
    const abs = changeAbs(points)!;
    const percent = ((points.at(-1)!.value - points[0]!.value) / points[0]!.value) * 100;
    expect(Math.sign(abs)).toBe(Math.sign(percent));
  });
});

describe('formatAbs', () => {
  it('renders a drop with its own minus sign', () => {
    expect(formatAbs(-2.5, 'кг')).toBe('-2.5 кг');
  });

  it('renders a rise with an explicit plus, so it reads as a change', () => {
    expect(formatAbs(10, 'кг')).toBe('+10 кг');
  });

  it('drops an empty fractional part', () => {
    expect(formatAbs(10.0, 'кг')).toBe('+10 кг');
    expect(formatAbs(1.25, 'см')).toBe('+1.3 см');
  });

  it('never prints a signed zero', () => {
    expect(formatAbs(0, 'кг')).toBe('0 кг');
    // -0.04 округляется до -0; знак у нуля бессмысленен.
    expect(formatAbs(-0.04, 'кг')).toBe('0 кг');
  });

  it('takes the unit from the caller, so cm parameters are not labelled kg', () => {
    expect(formatAbs(-3, 'см')).toBe('-3 см');
  });
});

describe('formatPercent', () => {
  // Стрелка дублирует знак: направление не должно держаться только на цвете.
  it('marks a drop with a down arrow and no double negative', () => {
    expect(formatPercent(-3)).toBe('↓ 3%');
  });

  it('marks a rise with an up arrow', () => {
    expect(formatPercent(16.7)).toBe('↑ 16.7%');
  });

  it('leaves zero without a direction', () => {
    expect(formatPercent(0)).toBe('0%');
  });
});

// Макет красит линию графика и подпись изменения ОДНИМ цветом (392:2090 —
// зелёное падение веса, 392:2159 — оранжевый рост силы). Раньше у графиков был
// собственный фиксированный цвет, и зелёная подпись висела над оранжевой
// линией. Тест держит именно совпадение с TONE_CLASS в ChartCard.tsx.
describe('TONE_COLOR', () => {
  it('pairs each tone with the token its text class uses', () => {
    // TONE_CLASS: up → text-brand-400, down → text-chart-3, neutral → text-muted.
    expect(TONE_COLOR.up).toBe('var(--color-brand-400)');
    expect(TONE_COLOR.down).toBe('var(--color-chart-3)');
    expect(TONE_COLOR.neutral).toBe('var(--color-muted)');
  });

  it('never leaves a tone without a colour', () => {
    for (const tone of ['up', 'down', 'neutral'] as const) {
      expect(TONE_COLOR[tone]).toMatch(/^var\(--color-/);
    }
  });
});
