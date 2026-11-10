import { PageContent, PageHeader, Page, PageTitle, Toolbar } from '@/shared/ui/primitives';
import { useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';

import { useSessionStore } from '@/entities/session/model/store';
import { useClient } from '@/entities/client/api/use-client';
import { useClientMeasurements } from '@/entities/measurement/api/use-client-measurements';
import { BASE_FIELDS, EXTRA_FIELDS, FIELD_LABELS } from '@/entities/measurement/model/fields';
import { summaryMetrics } from '@/entities/measurement/model/summary';
import type { components } from '@/shared/api/schema';
import { connectionEdit } from '@/shared/config/paths';
import { paths } from '@/shared/config/paths';
import { useDelayedVisible } from '@/shared/lib/loading/useDelayedVisible';
import { BackButton } from '@/shared/ui/BackButton';
import { Skeleton } from '@/shared/ui/Skeleton';

type MeasurementOut = components['schemas']['MeasurementOut'];

const MONTHS_SHORT = [
  'янв.',
  'фев.',
  'мар.',
  'апр.',
  'мая',
  'июн.',
  'июл.',
  'авг.',
  'сен.',
  'окт.',
  'ноя.',
  'дек.',
];

/** ISO date -> { year: "2026", day: "16 янв." }, как в MeasurementHistory. */
function splitDate(iso: string): { year: string; day: string } {
  const [y, m, d] = iso.split('-');
  const month = MONTHS_SHORT[Number(m) - 1] ?? m;
  return { year: y ?? iso, day: `${Number(d)} ${month}` };
}

// Read-only detail. Photos are intentionally NOT rendered: the client's progress
// photos are private (the backend returns them empty / 403 for a trainer).
function MeasurementDetail({ record }: { record: MeasurementOut }) {
  const base = BASE_FIELDS.filter((f) => record[f] != null);
  const extra = EXTRA_FIELDS.filter((f) => record[f] != null);
  const custom = record.custom_values ?? [];

  const renderGroup = (title: string, rows: { key: string; label: string; value: string }[]) => (
    <section className="flex flex-col gap-[5px]">
      <h3 className="text-label text-muted">{title}</h3>
      <ul className="flex flex-col gap-[5px]">
        {rows.map((row) => (
          <li key={row.key} className="text-body-s flex justify-between">
            <span className="text-muted">{row.label}</span>
            <span className="text-content">{row.value}</span>
          </li>
        ))}
      </ul>
    </section>
  );

  return (
    <div className="mt-[10px] flex flex-col gap-[15px] border-t border-line pt-[10px]">
      {base.length > 0 &&
        renderGroup(
          'Основные',
          base.map((f) => ({ key: f, label: FIELD_LABELS[f], value: String(record[f]) })),
        )}
      {extra.length > 0 &&
        renderGroup(
          'Дополнительные',
          extra.map((f) => ({ key: f, label: FIELD_LABELS[f], value: String(record[f]) })),
        )}
      {custom.length > 0 &&
        renderGroup(
          'Кастомные',
          custom.map((cv) => ({
            key: String(cv.slot),
            label: cv.name,
            value: `${cv.value} ${cv.unit}`,
          })),
        )}
    </div>
  );
}

export function ClientMeasurementsPage() {
  const { id = '' } = useParams<{ id: string }>();
  const role = useSessionStore((s) => s.user?.role);
  const { data: client } = useClient(id);
  const { data, isLoading, isFetching, isError, isFetchedAfterMount } = useClientMeasurements(id);
  const [openId, setOpenId] = useState<string | null>(null);

  // Skeleton only after the delay (no flash on instant cache hits); the empty
  // state must wait for the load to actually finish, never show mid-load
  // (mirrors CalendarPage's showSkeleton pattern).
  const waitingForAccess = isLoading || isFetching || !isFetchedAfterMount;
  const showSkeleton = useDelayedVisible(waitingForAccess);

  // Trainer-only page (like ClientEditPage): redirect a client who deep-links here.
  if (role !== 'trainer') return <Navigate replace to={paths.connections} />;

  // A restored or in-memory result can predate an unlink in another session.
  // Show client data only after this mount has verified access with the server.
  const verified = isFetchedAfterMount && !isFetching && !isError;
  const items = verified ? (data?.items ?? []) : [];

  return (
    // Тренерский вид замеров приведён к клиентскому экрану (756:1712,
    // pages/measurements): тот же градиент, прозрачная шапка и те же
    // строки истории — одни и те же данные не должны выглядеть по-разному.
    <Page background="gradient">
      <PageHeader transparent>
        <Toolbar>
          <BackButton to={connectionEdit(id)} />
          <PageTitle className="text-h1 text-left">Замеры клиента</PageTitle>
        </Toolbar>
      </PageHeader>
      <PageContent className="page-padding">
        <div className="mx-auto flex max-w-md flex-col gap-[15px]">
          {verified && client && <h2 className="text-h2 text-content">{client.display_name}</h2>}

          {isError ? (
            <p className="text-body-s text-center text-danger">
              Не удалось загрузить замеры клиента
            </p>
          ) : waitingForAccess && showSkeleton ? (
            <Skeleton variant="list" count={3} />
          ) : waitingForAccess ? null : items.length === 0 ? (
            <p className="text-body-s text-center text-muted">Нет записей</p>
          ) : (
            <ul className="flex flex-col gap-[15px]">
              {items.map((item) => {
                const open = openId === item.id;
                const { year, day } = splitDate(item.date);
                // Те же метрики, что на клиентском экране замеров — одни и те
                // же данные не должны выглядеть по-разному у клиента и тренера.
                const metrics = summaryMetrics(item);
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      aria-expanded={open}
                      // Дата разбита на год и день, как в макете, поэтому
                      // полную дату несёт доступное имя строки.
                      aria-label={`Замер за ${day} ${year}`}
                      onClick={() => setOpenId(open ? null : item.id)}
                      className="w-full rounded-[14px] border border-line px-[22px] py-[10px] text-left transition-colors hover:bg-card-light"
                    >
                      <div className="flex items-center justify-between gap-[15px]">
                        <div className="flex shrink-0 flex-col">
                          <span className="text-caption text-content">{year}</span>
                          <span className="text-h3 text-brand-text">{day}</span>
                        </div>
                        <div className="flex items-center gap-[10px]">
                          {metrics.map((metric) => (
                            <div key={metric.key} className="flex flex-col items-end">
                              <span className="text-caption text-content">{metric.label}</span>
                              <span className="text-h3 text-brand-text">
                                {metric.value} {metric.unit}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                      {open && <MeasurementDetail record={item} />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </PageContent>
    </Page>
  );
}
