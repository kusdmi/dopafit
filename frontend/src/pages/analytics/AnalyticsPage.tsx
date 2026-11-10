import { PageContent, PageHeader, Page, PageTitle } from '@/shared/ui/primitives';
import { useEffect } from 'react';

import { useClients } from '@/entities/client/api/use-clients';
import { useSessionStore } from '@/entities/session/model/store';
import { AnthropometryChart } from '@/features/analytics/charts/AnthropometryChart';
import { ExerciseCharts } from '@/features/analytics/charts/ExerciseCharts';
import { AnthropometryControls } from '@/features/analytics/view/AnthropometryControls';
import { PhotoCompare } from '@/features/analytics/view/PhotoCompare';
import { useAnalyticsView } from '@/features/analytics/view/useAnalyticsView';
import { WorkoutControls } from '@/features/analytics/view/WorkoutControls';
import { ToggleGroup } from '@/features/analytics/ToggleGroup';
import { ChartCard } from '@/features/analytics/ChartCard';
import { Select } from '@/shared/ui/Select';

/**
 * Аналитика прогресса (Figma 768:1058, 784:1093, 786:1531, 786:2076, 790:2522,
 * 790:3333, 793:4331, 852:1812).
 *
 * Экран показывает один режим за раз — «Тренировки» или «Антропометрия», — и
 * все его параметры выбираются прямо на странице. Прежний конструктор графиков
 * (попап с видимостью, порядком и периодом каждой карточки) удалён: по макету
 * настроек в попапе нет.
 *
 * Состояние живёт в URL (см. useAnalyticsView), поэтому экран переживает
 * перезагрузку и им можно поделиться ссылкой.
 */
export function AnalyticsPage() {
  const user = useSessionStore((s) => s.user);
  const isTrainer = user?.role === 'trainer';
  const { view, patch } = useAnalyticsView();
  const clients = useClients({ enabled: isTrainer });
  const clientItems = clients.data?.items ?? [];

  // Фото прогресса приватны: тренер не видит их даже у своего клиента.
  const ownData = view.clientId === null;
  // Конкретный клиент выбран только когда это настоящий id, а не 'pending'.
  const selectedClientId = view.clientId === 'pending' ? null : view.clientId;

  // Переключатель «Клиенты» можно нажать раньше, чем приедет список клиентов.
  // Тогда выбор остаётся 'pending' и подхватывает первого клиента, как только
  // список пришёл — иначе нажатие молча не делало бы ничего.
  const firstClientId = clientItems[0]?.id;
  useEffect(() => {
    if (view.clientId === 'pending' && firstClientId) patch({ clientId: firstClientId });
  }, [view.clientId, firstClientId, patch]);

  return (
    // Figma 768:1058 / 852:1812: экран лежит на основном градиенте, заголовок
    // плавает прямо на нём — как на экранах авторизации.
    <Page background="gradient">
      <PageHeader transparent>
        <div className="flex flex-col gap-1.5 px-6 pb-2 pt-4">
          <PageTitle className="text-h1 text-left text-content">Аналитика прогресса</PageTitle>
          <p className="m-0 text-body-s text-muted">Отслеживайте прогресс ваших тренировок</p>
        </div>
      </PageHeader>
      <PageContent className="page-padding">
        <div className="mx-auto flex max-w-md flex-col gap-4 py-4">
          <ToggleGroup
            ariaLabel="Раздел аналитики"
            value={view.tab}
            onChange={(tab) => patch({ tab })}
            options={[
              { value: 'workouts', label: 'Тренировки' },
              { value: 'anthropometry', label: 'Антропометрия' },
            ]}
          />

          {isTrainer && (
            <>
              <ToggleGroup
                label="Просмотр данных"
                value={ownData ? 'self' : 'client'}
                onChange={(next) => {
                  // 'pending' — выбор сделан, id подставит эффект выше, когда
                  // список клиентов приедет.
                  patch({ clientId: next === 'self' ? null : (clientItems[0]?.id ?? 'pending') });
                }}
                options={[
                  { value: 'self', label: 'Я' },
                  { value: 'client', label: 'Клиенты' },
                ]}
              />
              {!ownData && clientItems.length > 0 && (
                <Select
                  label="Выберите клиента"
                  value={selectedClientId ?? ''}
                  onChange={(e) => patch({ clientId: e.target.value })}
                >
                  {clientItems.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.full_name ?? c.display_name}
                    </option>
                  ))}
                </Select>
              )}
            </>
          )}

          {view.tab === 'workouts' ? (
            <WorkoutControls view={view} patch={patch} />
          ) : (
            <AnthropometryControls view={view} patch={patch} />
          )}

          {/* Ключ по выбранному источнику данных перемонтирует графики при смене
              клиента, чтобы смену контента отыграл fade-in — иначе цифры молча
              подменялись бы на месте. */}
          <div key={`${view.tab}:${selectedClientId ?? 'self'}`} className="animate-fade-in flex flex-col gap-6 pt-2">
            {view.tab === 'workouts' ? (
              <ExerciseCharts
                view={view.workoutView}
                dateFrom={view.dateFrom}
                dateTo={view.dateTo}
                clientId={selectedClientId}
                programId={view.programId}
                dayId={view.dayId}
                exerciseId={view.exerciseId}
              />
            ) : (
              <>
                <ChartCard title="График измерений">
                  <AnthropometryChart
                    params={{ parameters: view.parameters, customSlots: view.customSlots }}
                    dateFrom={view.dateFrom}
                    dateTo={view.dateTo}
                    clientId={selectedClientId}
                  />
                </ChartCard>
                {ownData && <PhotoCompare />}
              </>
            )}
          </div>
        </div>
      </PageContent>
    </Page>
  );
}
