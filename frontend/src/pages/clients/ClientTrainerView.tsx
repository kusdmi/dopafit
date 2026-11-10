import { Text, Segment, SegmentOption, useToast } from '@/shared/ui/primitives';
import { useState } from 'react';
import { useLocation } from 'react-router-dom';

import { useUnlinkClient } from '@/entities/client/api/use-client-mutations';
import { useMyTrainer } from '@/entities/client/api/use-my-trainer';
import { useLinkRequests } from '@/entities/link-request/api/use-link-requests';
import { RequestList } from '@/features/link-request/RequestList';
import { SendRequestForm } from '@/features/link-request/SendRequestForm';
import { useDelayedVisible } from '@/shared/lib/loading/useDelayedVisible';
import { formatPhoneIntl } from '@/shared/lib/phone';
import { useNetworkStatus } from '@/shared/lib/network/useNetworkStatus';
import { formatDate } from '@/shared/lib/time/formatDate';
import { Button } from '@/shared/ui/Button';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { Skeleton } from '@/shared/ui/Skeleton';

import { clientCard } from './ui/clients-ui';

export function ClientTrainerView() {
  const [tab, setTab] = useState<'incoming' | 'outgoing'>('incoming');
  const location = useLocation();
  const requestId = new URLSearchParams(location.search).get('request_id');
  const target = useLinkRequests(undefined, Boolean(requestId));
  const request = requestId ? target.data?.find((item) => item.id === requestId) : undefined;
  const { data: trainer, isLoading } = useMyTrainer();
  const showSkeleton = useDelayedVisible(isLoading);

  return (
    // Figma 1084:3883: карточка пустого состояния, карточка поиска тренера и
    // блок «Ваши заявки» с pill-селектором (37.5px — это общий `.segment`,
    // в отличие от прямоугольных табов на экране добавления клиента).
    <div className="mx-auto flex max-w-md flex-col gap-[25px]">
      {/* Верх экрана — ровно одно из трёх: скелетон, тренер или приглашение
          его найти. Раньше пустая карточка и форма поиска стояли безусловно,
          и принявший запрос клиент навсегда читал «У вас пока нет тренера».
          Пока ответ не пришёл, не показываем ни то ни другое: мигнувшее
          пустое состояние у человека с тренером — та же ложь, только короче. */}
      {isLoading ? (
        // Держим пусто до порога, чтобы скелетон не вспыхивал на быстрых
        // ответах (тот же приём, что в TrainerClientsView).
        showSkeleton ? (
          <div className="animate-fade-in">
            <Skeleton variant="card" />
          </div>
        ) : null
      ) : trainer ? (
        <TrainerCard trainer={trainer} />
      ) : (
        <>
          <div className={`${clientCard} flex flex-col items-center gap-[10px] text-center`}>
            <p className="text-h3 text-content">У вас пока нет тренера</p>
            <p className="text-body-s text-content">
              Пригласите тренера или найдите его в приложении
            </p>
          </div>

          <section className={`${clientCard} flex flex-col gap-[10px]`}>
            <h2 className="text-h2 text-content">Тренер уже есть в приложении?</h2>
            <p className="text-body-m text-content">Введите его email или телефон</p>
            <SendRequestForm />
          </section>
        </>
      )}

      <section className="flex flex-col gap-[25px]">
        <h2 className="text-h2 text-content">Ваши заявки</h2>
        {requestId ? (
          target.isLoading ? null : request &&
            request.status !== 'declined' &&
            request.status !== 'cancelled' ? (
            <RequestList direction={request.direction} requestId={requestId} />
          ) : (
            <p className="text-body-m py-8 text-center text-muted">Заявка недоступна</p>
          )
        ) : (
          <>
            <Segment
              value={tab}
              onChange={(e) => setTab(e.target.value as 'incoming' | 'outgoing')}
            >
              <SegmentOption value="incoming">
                <Text>Запросы от тренера</Text>
              </SegmentOption>
              <SegmentOption value="outgoing">
                <Text>Мои запросы</Text>
              </SegmentOption>
            </Segment>
            <RequestList direction={tab} />
          </>
        )}
      </section>
    </div>
  );
}

interface TrainerCardProps {
  trainer: NonNullable<ReturnType<typeof useMyTrainer>['data']>;
}

/**
 * Карточка связанного тренера.
 *
 * В макете 1084:3883 этого состояния нет — экран нарисован только для клиента
 * без тренера, — поэтому карточка собрана из форм соседних экранов клиентов:
 * тот же `clientCard` (обводка 14px, padding 10px), имя ролью H2 и подписи
 * Body M, как в карточке клиента у тренера (1095:3064).
 *
 * «Отвязаться» стоит здесь же, рядом с именем тренера и датой начала работы:
 * действие относится именно к этой связи, и решают его, глядя на неё. Раньше
 * кнопки не было вовсе — связь разрывал только тренер, и клиент оставался в
 * ней, пока его не отпустят.
 */
function TrainerCard({ trainer }: TrainerCardProps) {
  const unlink = useUnlinkClient();
  const { isOffline } = useNetworkStatus();
  const [present] = useToast();
  const [confirming, setConfirming] = useState(false);

  return (
    <section className={`${clientCard} flex flex-col gap-[10px]`}>
      <h2 className="text-h2 text-content">Ваш тренер</h2>
      <p className="text-h3 text-content">{trainer.full_name?.trim() || 'Тренер'}</p>
      {trainer.phone ? (
        <a className="text-body-m text-brand-400" href={`tel:${trainer.phone}`}>
          {formatPhoneIntl(trainer.phone)}
        </a>
      ) : null}
      <p className="text-body-m text-muted">
        Работаете вместе с {formatDate(trainer.linked_since)}
      </p>
      {/* Тихая обводка, а не сплошная заливка: разрыв связи — не то действие,
          к которому экран подталкивает. Офлайн заблокирована, как и остальные
          изменяющие действия в приложении. */}
      <Button
        variant="outline"
        className="border-danger text-danger"
        disabled={isOffline}
        onClick={() => setConfirming(true)}
      >
        {isOffline ? 'Недоступно офлайн' : 'Отвязаться от тренера'}
      </Button>

      {/* Тот же ConfirmDialog, что у тренера на «Отвязать клиента?»: действие
          необратимо в один тап, а сообщение снимает главный страх — данные
          остаются на месте. */}
      <ConfirmDialog
        isOpen={confirming}
        title="Отвязаться от тренера?"
        message="Тренер потеряет доступ к вашим тренировкам и замерам. Ваши данные останутся с вами."
        confirmLabel="Отвязаться"
        pending={unlink.isPending}
        onConfirm={() => {
          setConfirming(false);
          unlink.mutate(trainer.card_id, {
            onSuccess: () => void present({ message: 'Вы отвязались от тренера', duration: 2000 }),
          });
        }}
        onCancel={() => setConfirming(false)}
      />
    </section>
  );
}
