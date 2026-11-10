import { useSubscriptionStatus } from '@/entities/subscription/api/use-subscription-status';
import { PremiumNotice } from '@/shared/ui/PremiumNotice';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { usePrograms } from '@/entities/program/api/use-programs';
import { listTab, outlineCard, outlineCardBrand } from '@/pages/programs/ui/program-ui';
import { paths, program } from '@/shared/config/paths';
import { DeferredLoading } from '@/shared/ui/DeferredLoading';
import { Icon } from '@/shared/ui/primitives';
import { chevronForward } from '@/shared/ui/icons';
import { Skeleton } from '@/shared/ui/Skeleton';

/** Строка-карточка программы (Figma 957:1565): название H3, подпись Caption,
 *  шеврон справа. Одна форма на обычные программы и на копии для клиентов. */
function ProgramRow({
  to,
  name,
  meta,
  badge,
}: {
  to: string;
  name: string;
  meta: string;
  badge?: string;
}) {
  return (
    <Link to={to} className={`${outlineCard} flex items-center justify-between gap-3`}>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-h3 text-content">{name}</span>
        <span className="mt-0.5 truncate text-caption text-muted">{meta}</span>
        {badge && <span className="mt-1 truncate text-caption text-muted">{badge}</span>}
      </span>
      <Icon icon={chevronForward} className="shrink-0 text-muted" style={{ fontSize: 20 }} />
    </Link>
  );
}

export function ProgramList() {
  const [tab, setTab] = useState<'standard' | 'own'>('standard');
  const programs = usePrograms();
  const subscription = useSubscriptionStatus();
  const access = subscription.data?.entitlements;
  // Real API returns ProgramListItem[] array directly
  const items = programs.data ?? [];
  const standard = items.filter((p) => p.is_standard);
  // Trainer "share-to-client" copies come back in the trainer's own list tagged
  // with for_client_id. Split them out of the plain "own" programs so they live in
  // a dedicated "Программы клиентов" section under the trainer's own ones. For a
  // client role these fields are always null, so this partition is a no-op there.
  const ownAll = items.filter((p) => !p.is_standard);
  const own = ownAll.filter((p) => !p.for_client_id);
  const clientCopies = ownAll.filter((p) => p.for_client_id);
  const visible = tab === 'standard' ? standard : own;

  return (
    <DeferredLoading
      loading={programs.isLoading}
      fallback={
        <div className="space-y-4">
          <Skeleton variant="list" count={5} />
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        {/* Figma 954:1558: две залитые пилюли во всю ширину, а не сегмент-капсула.
            role=tablist/tab несёт семантику переключателя. */}
        <div role="tablist" className="flex items-stretch gap-[10px]">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'standard'}
            onClick={() => setTab('standard')}
            className={listTab(tab === 'standard')}
          >
            Стандартные программы
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'own'}
            onClick={() => setTab('own')}
            className={listTab(tab === 'own')}
          >
            Мои программы
          </button>
        </div>

        {/* 24px отделяет список от отдельного действия под ним («Все
            упражнения»), 10px — однородные строки внутри списка. Было 50 и 25:
            при таком шаге четыре программы занимали весь экран, а промежуток
            между соседними строками читался как граница разделов. */}
        {tab === 'own' &&
          access &&
          !access.is_active &&
          access.usage.own_programs >= access.limits.own_programs && (
            <PremiumNotice
              title="Лимит программ"
              description={`В бесплатном доступе до ${access.limits.own_programs} собственных программ. В разделе Premium можно подтвердить бесплатный выбор или подключить расширенный доступ.`}
            />
          )}
        <div className="flex flex-col gap-6">
          {/* Keyed on the active tab so switching Standard/My remounts the list and
              replays the short fade-in, softening the otherwise abrupt content swap. */}
          <div key={tab} className="animate-fade-in flex flex-col gap-[10px]">
            {visible.map((p) => (
              <ProgramRow
                key={p.id}
                to={program(p.id)}
                name={p.name}
                meta={`${p.day_count} дн. · ${p.exercise_count} упр.${
                  '__pendingSync' in p && (p as { __pendingSync?: boolean }).__pendingSync
                    ? ' · ожидает синхронизации'
                    : ''
                }`}
              />
            ))}

            {tab === 'own' && clientCopies.length > 0 && (
              <>
                {/* Заголовок раздела внутри плотного списка: 10px шага мало,
                    чтобы отбить смену раздела, поэтому свой отступ сверху. */}
                <h2 className="m-0 mt-3 text-label text-muted">Программы клиентов</h2>
                {clientCopies.map((p) => (
                  <ProgramRow
                    key={p.id}
                    to={program(p.id)}
                    name={p.name}
                    meta={`${p.day_count} дн. · ${p.exercise_count} упр.`}
                    badge={`для клиента ${p.for_client_name ?? '—'}`}
                  />
                ))}
              </>
            )}

            {tab === 'own' && (
              // Действие, а не строка списка — отбиваем от программ над ним.
              <Link
                to={paths.programNew}
                className={`${outlineCard} mt-3 flex items-center justify-center text-h3 text-content`}
              >
                + Создать свою программу
              </Link>
            )}
          </div>

          {/* Figma 957:1608: отдельная карточка внизу списка, подсвеченная акцентом. */}
          <Link
            to={paths.exercises}
            className={`${outlineCardBrand} flex items-center justify-between gap-3`}
          >
            <span className="text-h3 text-content">Все упражнения</span>
            <Icon icon={chevronForward} className="shrink-0 text-muted" style={{ fontSize: 20 }} />
          </Link>
        </div>
      </div>
    </DeferredLoading>
  );
}
