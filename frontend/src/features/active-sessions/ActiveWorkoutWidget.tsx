import { useLayoutEffect, useRef } from 'react';
import { useMatch } from 'react-router-dom';
import { useNavigation } from '@/shared/lib/navigation';

import { useSessionStore } from '@/entities/session/model/store';
import { useWorkoutStore } from '@/entities/workout/model/store';
import type { ActiveSession } from '@/entities/workout/model/types';
import { paths, programSession } from '@/shared/config/paths';
import { formatDuration, useElapsed } from '@/shared/lib/time/useElapsed';

function participantLabel(session: ActiveSession): string {
  return session.participant.kind === 'self' ? 'Я' : session.participant.clientName;
}

function WidgetButton({
  session,
  participant,
  trailing,
  ariaLabel,
}: {
  session: ActiveSession;
  /** Чья это тренировка. Пусто — своя: подписывать её незачем. */
  participant?: string;
  trailing?: string;
  ariaLabel: string;
}) {
  const router = useNavigation();
  const elapsed = useElapsed(session.startedAt);
  return (
    // Figma 392:2229 / 392:5261: фиолетовая градиентная плашка «Активная
    // тренировка» слева, время справа. Скруглены ВСЕ углы (radius 20), а не
    // только верхние: плашка не приклеена к таб-бару, а подтыкается под него —
    // нижние углы просто скрыты баром. Отсюда же pb-[53px] при pt-[10px]:
    // 45px нижнего поля уходят под бар (mb-[-45px] в макете), видимыми
    // остаются те же ~8px воздуха, что и сверху.
    //
    // Плашка фиолетовая ВСЕГДА, а не только у тренера. Раньше своя тренировка
    // рисовалась нейтральной карточкой, но в макете вариант ровно один: это
    // «идёт тренировка», а не «идёт тренировка клиента», и роль тут ни при чём.
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={() => router.push(programSession(session.programId))}
      className="flex w-full items-center justify-between gap-3 rounded-[20px] border px-[20px] pt-[10px] pb-[53px] text-left"
      // --gradient-bg-accent-solid, а не --gradient-bg-accent: тот уходит в
      // полную прозрачность к нижнему стопу, и сквозь нижнюю половину плашки
      // просвечивал контент страницы позади неё (плашка висит fixed над
      // таб-баром). Непрозрачный близнец — тот же фиолетовый, тот же верхний
      // стоп, но затемнённый тон вместо прозрачности внизу.
      //
      // Обводка и текст — инлайном по той же причине, что и заливка: это
      // фиксированные значения макета, утилит темы для них нет.
      style={{
        background: 'var(--gradient-bg-accent-solid)',
        borderColor: 'var(--accent-plate-line)',
        color: 'var(--color-brand-50)',
      }}
    >
      <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
        <span className="shrink-0 text-label">Активная тренировка</span>
        {participant && <span className="truncate text-caption opacity-80">{participant}</span>}
      </span>
      <span className="text-label tabular-nums">{formatDuration(elapsed)}</span>
      {trailing && (
        <span className="shrink-0 rounded-full bg-chart-4 px-2 py-0.5 text-caption text-chart-4-fg">
          {trailing}
        </span>
      )}
    </button>
  );
}

export function ActiveWorkoutWidget() {
  const sessions = useWorkoutStore((s) => s.sessions);
  const activeKey = useWorkoutStore((s) => s.activeKey);
  const role = useSessionStore((s) => s.user?.role);
  const onWorkoutPage = useMatch(`${paths.programs}/:id/session`);

  const entries = Object.entries(sessions);
  const visible = entries.length > 0 && !onWorkoutPage;

  const wrapperRef = useRef<HTMLDivElement>(null);

  // Publish the plate's footprint so PageContent can reserve bottom space and
  // keep its last in-flow controls (e.g. a page's bottom button) tappable.
  // The CSS rule that consumes --active-plate-space lives in app/styles/index.css.
  useLayoutEffect(() => {
    const root = document.documentElement;
    if (!visible) {
      root.removeAttribute('data-active-plate');
      root.style.removeProperty('--active-plate-space');
      return;
    }
    root.setAttribute('data-active-plate', 'true');
    // Нижние 45px плашки спрятаны за таб-баром (см. `bottom` ниже), и место
    // под них уже зарезервировано в --tab-bar-space. Публикуем только
    // видимую над баром часть, иначе экран отводил бы этот нахлёст дважды и
    // под контентом появлялась бы лишняя пустая полоса.
    const height = wrapperRef.current?.getBoundingClientRect().height ?? 0;
    const visibleHeight = Math.max(0, height - 45);
    root.style.setProperty('--active-plate-space', `${Math.ceil(visibleHeight)}px`);
    return () => {
      root.removeAttribute('data-active-plate');
      root.style.removeProperty('--active-plate-space');
    };
  }, [visible]);

  if (!visible) return null;

  const activeEntry = activeKey && sessions[activeKey] ? activeKey : entries[0][0];
  const active = sessions[activeEntry];
  const isTrainer = role === 'trainer';
  const othersCount = entries.length - 1;

  return (
    <div
      ref={wrapperRef}
      // The plate shares the navigation footprint and tucks 45px behind its bar.
      className="active-workout-plate fixed inset-x-0 z-40"
      style={{
        bottom: 'calc(var(--tab-bar-space) - 45px)',
        paddingInline: 'var(--bottom-nav-gutter)',
      }}
    >
      <WidgetButton
        session={active}
        // Подпись — только для чужой тренировки. На своей она была бы «Я»:
        // плашка и так висит в собственном приложении, уточнять нечего.
        participant={active.participant.kind === 'self' ? undefined : active.participant.clientName}
        trailing={isTrainer && othersCount > 0 ? `+${othersCount} идут` : undefined}
        ariaLabel={`Тренировка идёт: ${participantLabel(active)}`}
      />
    </div>
  );
}
