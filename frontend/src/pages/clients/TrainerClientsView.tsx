import { Icon, Text, Segment, SegmentOption } from '@/shared/ui/primitives';
import { warningOutline } from '@/shared/ui/icons';
import { useState } from 'react';
import { useNavigation } from '@/shared/lib/navigation';

import { useClients } from '@/entities/client/api/use-clients';
import { RequestSections } from '@/features/link-request/RequestSections';
import { paths, connectionEdit } from '@/shared/config/paths';
import { useDelayedVisible } from '@/shared/lib/loading/useDelayedVisible';
import { formatDate } from '@/shared/lib/time/formatDate';
import { Button } from '@/shared/ui/Button';
import { Skeleton } from '@/shared/ui/Skeleton';
import { StatusBadge } from '@/shared/ui/StatusBadge';

import { clientCard, statTile, workoutCountRow } from './ui/clients-ui';

interface StatCardProps {
  label: string;
  value: number;
  role: 'brand' | 'success' | 'chart-4';
}

// Плитка статистики (Figma 1095:3017/3018/3025): обводка ролью, подпись Body M
// сверху и значение H2 под ней.
function StatCard({ label, value, role }: StatCardProps) {
  return (
    <div className={statTile(role)}>
      <div className="text-body-m text-content">{label}</div>
      {/* mt-auto: подписи ложатся в одну или две строки, и без прижатия к низу
          цифры в трёх плитках встают на разных уровнях. */}
      <div className="mt-auto text-h2 text-content">{value}</div>
    </div>
  );
}

const STATUS_ORDER: Record<string, number> = { active: 0, archived: 1 };

export function TrainerClientsView() {
  const history = useNavigation();
  // Уведомление о запросе на связь ведёт сюда и просит сразу вкладку
  // «Запросы» — иначе человек попадал бы на список клиентов и искал заявку
  // сам. Состояние читается ОДИН раз, как начальное: дальше вкладку выбирает
  // пользователь, и перерисовка не должна возвращать её обратно.
  //
  // Два источника, потому что вкладку просят из двух разных мест. Список
  // уведомлений внутри приложения кладёт её в state истории (см.
  // entities/notification/model/target.ts). Тап по СИСТЕМНОМУ пушу приходит
  // сюда через service worker, а тот умеет только URL: когда окна не было,
  // он вызывает openWindow(url), и никакого state истории там нет —
  // единственный способ донести вкладку — query-параметр, который и кладёт
  // backend (modules/messaging/domain/push-target.ts).
  const [tab, setTab] = useState<'clients' | 'requests'>(() =>
    (history.location.state as { tab?: unknown } | null)?.tab === 'requests' ||
    new URLSearchParams(history.location.search).get('tab') === 'requests'
      ? 'requests'
      : 'clients',
  );
  const requestId = new URLSearchParams(history.location.search).get('request_id') ?? undefined;
  const { data, isLoading, isError } = useClients();
  const showSkeleton = useDelayedVisible(isLoading);

  if (isLoading) {
    // Держим пусто до порога, чтобы скелетон не вспыхивал на быстрых ответах.
    return showSkeleton ? (
      <div className="animate-fade-in">
        <Skeleton variant="list" count={3} />
      </div>
    ) : null;
  }
  if (isError)
    return (
      <p className="text-body-m py-8 text-center text-danger">Не удалось загрузить клиентов</p>
    );

  const stats = data?.stats;
  const items = data?.items ?? [];
  const main = items
    .filter((c) => c.status === 'active' || c.status === 'archived')
    .sort((a, b) => (STATUS_ORDER[a.status] ?? 0) - (STATUS_ORDER[b.status] ?? 0));
  const former = items.filter((c) => c.status === 'unlinked');

  // Карточка клиента (Figma 1095:3064): имя H2 + последняя активность Body M,
  // бейдж статуса справа, строка-счётчик тренировок и кнопка «Подробнее».
  // Вся карточка остаётся одной кнопкой (фокусируемость с клавиатуры,
  // role=button), как пикеры в ClientPicker/ParticipantStep.
  // data-client-row — якорь для тестов.
  const renderRow = (c: (typeof items)[number]) => (
    <li key={c.id}>
      <button
        type="button"
        data-client-row
        onClick={() => history.push(connectionEdit(c.id))}
        className={`${clientCard} flex flex-col gap-[10px] text-left`}
      >
        <div className={`w-full ${c.status === 'archived' ? 'opacity-60' : ''}`}>
          <div className="flex items-center justify-between gap-[10px]">
            <div className="min-w-0 flex-1">
              <p className="text-h2 flex items-center gap-1.5 truncate text-content">
                <span className="truncate">{c.display_name}</span>
                {c.has_injuries && (
                  <Icon
                    icon={warningOutline}
                    role="img"
                    aria-label="Есть ограничения по здоровью"
                    title="Есть ограничения по здоровью"
                    className="shrink-0 text-danger"
                  />
                )}
              </p>
              {c.last_activity_at ? (
                <p className="text-body-m mt-[5px] text-muted">{formatDate(c.last_activity_at)}</p>
              ) : null}
            </div>
            <StatusBadge status={c.status} managed={c.client_user_id === null} />
          </div>
          <div className={`${workoutCountRow} mt-[10px]`}>{c.workout_count} тренировок</div>
        </div>
      </button>
    </li>
  );

  return (
    <div className="mx-auto flex max-w-md flex-col gap-[25px]">
      <Segment value={tab} onChange={(e) => setTab(e.target.value as 'clients' | 'requests')}>
        <SegmentOption value="clients">
          <Text>Мои клиенты</Text>
        </SegmentOption>
        <SegmentOption value="requests">
          <Text>Запросы</Text>
        </SegmentOption>
      </Segment>

      {/* Ключ по вкладке перемонтирует содержимое при переключении, поэтому
          короткий fade-in проигрывается заново и смена вкладки видна. */}
      <div key={tab} className="animate-fade-in flex flex-col gap-[25px]">
        {tab === 'requests' ? (
          // Обе стороны: отправленный клиенту запрос тренер иначе терял из виду.
          <RequestSections requestId={requestId} />
        ) : (
          <>
            <div className="flex gap-[15px]">
              <StatCard label="Всего клиентов" value={stats?.total ?? 0} role="brand" />
              <StatCard label="Активных" value={stats?.active ?? 0} role="success" />
              <StatCard label="Всего тренировок" value={stats?.workouts ?? 0} role="chart-4" />
            </div>

            {main.length === 0 ? (
              <p className="text-body-m py-8 text-center text-muted">Пока нет клиентов</p>
            ) : (
              <section className="flex flex-col gap-[5px]">
                <h2 className="text-h2 p-[10px] text-content">Мои клиенты</h2>
                <ul className="flex flex-col gap-[15px]">{main.map(renderRow)}</ul>
              </section>
            )}

            {/* Главное действие экрана на фоне страницы — тот случай, когда тень
              кодирует уровень (design-system.md «Тени»). */}
            <Button className="shadow-raised" onClick={() => history.push(paths.connectionAdd)}>
              Добавить клиента
            </Button>

            {former.length > 0 && (
              <section className="flex flex-col gap-[15px]">
                <h2 className="text-h2 text-content">Бывшие клиенты</h2>
                <ul className="flex flex-col gap-[15px]">{former.map(renderRow)}</ul>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
