import {
  HistoryBack,
  ToolbarActions,
  PageContent,
  PageHeader,
  Icon,
  Page,
  PageTitle,
  Toolbar,
} from '@/shared/ui/primitives';
import { notificationsOutline } from '@/shared/ui/icons';

import { useMarkRead } from '@/entities/notification/api/use-mark-read';
import { useNotifications } from '@/entities/notification/api/use-notifications';
import { paths } from '@/shared/config/paths';
import { Button } from '@/shared/ui/Button';
import { DeferredLoading } from '@/shared/ui/DeferredLoading';
import { Skeleton } from '@/shared/ui/Skeleton';

import { NotificationCard } from './ui/NotificationCard';

export function NotificationsPage() {
  const { data, isLoading, isError, isFetching, refetch } = useNotifications();
  const markRead = useMarkRead();

  const items = data?.items ?? [];
  const unread = data?.unread ?? 0;

  return (
    // Figma 392:2836 puts the feed on the primary gradient with the chevron and
    // a Display-sized title floating on it — no header plate or divider.
    <Page background="gradient">
      <PageHeader transparent>
        <Toolbar>
          <ToolbarActions slot="start">
            <HistoryBack defaultHref={paths.home} text="" />
          </ToolbarActions>
          {/* The shared .page-title is a centred 17px toolbar title; this screen's
              title is Display (26px ExtraBold), left-aligned against the chevron
              (392:2840), so the role class and alignment are set here rather
              than by forking the shared class. */}
          <PageTitle className="text-h1 text-left">Уведомления</PageTitle>
        </Toolbar>
      </PageHeader>
      <PageContent className="page-padding">
        <div className="mx-auto flex max-w-md flex-col gap-4 pt-4">
          <DeferredLoading loading={isLoading} fallback={<Skeleton variant="list" />}>
            {isError ? (
              // Distinguish a load failure from a genuinely empty feed — otherwise a
              // fetch error masquerades as "no notifications".
              <div className="flex flex-col items-center gap-4 py-8 text-center">
                <p className="text-danger">Не удалось загрузить уведомления</p>
                <Button variant="outline" loading={isFetching} onClick={() => void refetch()}>
                  Повторить
                </Button>
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center gap-3 pt-16 text-center">
                <Icon icon={notificationsOutline} style={{ fontSize: 48 }} className="text-muted" />
                <p className="text-body-m text-muted">Нет новых уведомлений</p>
              </div>
            ) : (
              // Своя flex-колонка с отступом, а НЕ голый фрагмент: кнопка и
              // список — соседи внутри `DeferredLoading`, а тот оборачивает
              // содержимое в обычный блочный <div className="animate-fade-in">.
              // `gap-4` внешнего контейнера страницы до них не доставал (они не
              // его flex-дети), и кнопка «Отметить все прочитанными» прилипала
              // к первой карточке вплотную. Отступ между самими карточками был
              // на месте всё это время — его задаёт `gap-[15px]` на <ul> ниже.
              <div className="flex flex-col gap-[15px]">
                {unread > 0 && (
                  <Button
                    variant="outline"
                    loading={markRead.isPending}
                    onClick={() => markRead.mutate({})}
                  >
                    Отметить все прочитанными
                  </Button>
                )}
                <ul className="flex flex-col gap-[15px]">
                  {items.map((item) => (
                    <NotificationCard key={item.id} item={item} />
                  ))}
                </ul>
              </div>
            )}
          </DeferredLoading>
        </div>
      </PageContent>
    </Page>
  );
}
