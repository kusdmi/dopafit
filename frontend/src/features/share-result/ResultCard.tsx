import { localDateKey } from '@/shared/lib/time/localDateKey';
import { formatDate } from '@/shared/lib/time/formatDate';
import { env } from '@/shared/config/env';
import type { components } from '@/shared/api/schema';
import { formatDuration } from '@/shared/lib/time/useElapsed';
import { Logo } from '@/shared/ui/Logo';

type SessionSummaryOut = components['schemas']['SessionSummaryOut'];
type ExerciseSummaryStat = components['schemas']['ExerciseSummaryStat'];

function statLine(label: string, stat: ExerciseSummaryStat): string {
  const { value, delta } = stat;
  if (delta != null && delta !== 0) {
    const arrow = delta > 0 ? '▲' : '▼';
    return `${label}: ${value} кг ${arrow}${Math.abs(delta)}`;
  }
  return `${label}: ${value} кг`;
}

export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1920;

/** Последнее слово подписи под карточкой: хост приложения без схемы и `www.`. */
const FALLBACK_DOMAIN = 'app.dopafit.ru';

/**
 * Домен для подписи внизу карточки.
 *
 * `env.apiUrl` — это origin самого приложения в вебе (PWA отдаётся с того же
 * домена, что и `/api/v1`) и явно заданный `VITE_API_URL` в нативной сборке,
 * то есть в обоих случаях адрес, по которому приложение действительно живёт.
 * Если разобрать его не вышло (пустая строка в тестах), подставляем домен
 * стенда из docs/deploy.md.
 */
function appDomain(): string {
  try {
    return new URL(env.apiUrl).host.replace(/^www\./, '');
  } catch {
    return FALLBACK_DOMAIN;
  }
}

/**
 * ОСОЗНАННОЕ ИСКЛЮЧЕНИЕ из правила «только семантические токены».
 *
 * Карточка рендерится ВНЕ экрана и растеризуется в PNG (shareResultImage), а
 * готовая картинка уезжает другим людям — её вид не должен зависеть от темы
 * автора. Поэтому цвета зафиксированы, а не взяты из токенов тем, и не должны
 * выметаться зачисткой цветовых литералов.
 *
 * Значения — из дизайн-системы (docs/design-system.md): тёмный вариант
 * основного градиента, нейтральный 50 и акцент 400.
 */
const CARD_BACKGROUND = 'linear-gradient(to bottom, #1e1208 0%, #161412 45%, #0e0b1a 100%)';
const CARD_FOREGROUND = '#fafaf8'; // нейтральный 50
const CARD_ACCENT = '#ff7003'; // акцент 400

interface ResultCardProps {
  summary: SessionSummaryOut;
}

export function ResultCard({ summary }: ResultCardProps) {
  const date = formatDate(localDateKey(new Date(summary.finished_at)));
  return (
    <div
      data-testid="result-card"
      style={{
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        background: CARD_BACKGROUND,
        color: CARD_FOREGROUND,
        padding: 96,
        display: 'flex',
        flexDirection: 'column',
        // Manrope самохостится и уже загружен приложением; системный
        // sans-serif остаётся запасным на случай несостоявшейся загрузки.
        fontFamily: "Manrope, system-ui, -apple-system, sans-serif",
        boxSizing: 'border-box',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
        {/* Logo красится через currentColor, а он унаследован от карточки
            (CARD_FOREGROUND выше), поэтому отдельный цвет ему не задаём.

            Рядом НЕ ставим подпись «DopaFit» текстом: `Logo` — это пара
            `BrandIcon` + `BrandWordmark`, и словесный знак уже нарисован
            внутри него. Текстовый span дублировал название, и на картинке
            «DopaFit» читалось дважды подряд. Название доступно через
            `aria-label` самого логотипа.

            Высота задаётся явно (как на Welcome и Home): дети `Logo` — это
            `h-full w-auto`, своей высоты у них нет. Раньше строку растягивал
            соседний span с `fontSize: 48`, и без него логотип схлопнулся бы в
            ноль. 72px — та же доля холста 1080×1920, что 28px на экране. */}
        <Logo className="h-[72px] w-auto" />
      </div>
      <div style={{ marginTop: 80 }}>
        <div style={{ fontSize: 88, fontWeight: 800, color: CARD_ACCENT }}>
          Тренировка #{summary.seq_number}
        </div>
        <div style={{ fontSize: 44, opacity: 0.7, marginTop: 16 }}>{date}</div>
        <div style={{ fontSize: 44, opacity: 0.7, marginTop: 8 }}>
          Время: {formatDuration(summary.duration_seconds)}
        </div>
      </div>
      <div style={{ marginTop: 72, display: 'flex', flexDirection: 'column', gap: 48 }}>
        {summary.exercises.map((ex, i) => (
          <div key={`${ex.name}-${i}`}>
            <div style={{ fontSize: 56, fontWeight: 700, marginBottom: 16 }}>{ex.name}</div>
            <div style={{ fontSize: 40, opacity: 0.9 }}>{statLine('MAX', ex.max)}</div>
            <div style={{ fontSize: 40, opacity: 0.9 }}>{statLine('Ср', ex.avg)}</div>
            <div style={{ fontSize: 40, opacity: 0.9 }}>{statLine('MIN', ex.min)}</div>
          </div>
        ))}
      </div>
      {/* Адрес берём из origin самого приложения, а не строкой в коде: здесь
          был зашит `dopafit.app` — домен-заглушка из дефолтов backend/config.ts,
          а стенд работает на `app.dopafit.ru` (docs/deploy.md), так что картинка
          уезжала людям с адресом, который никуда не ведёт. Карточка
          рендерится в браузере, поэтому свой адрес она знает сама, и при
          переезде на другой домен подпись переедет вместе с ним.
          Запасное значение — на случай рендера вне окна (тесты, SSR). */}
      <div style={{ marginTop: 'auto', fontSize: 40, opacity: 0.6 }}>{appDomain()}</div>
    </div>
  );
}
