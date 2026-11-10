import { Icon } from '@/shared/ui/primitives';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { clientsKeyRoot } from '@/entities/client/api/use-clients';
import {
  useAcceptLinkRequest,
  useCancelLinkRequest,
  useDeclineLinkRequest,
} from '@/entities/link-request/api/use-link-request-mutations';
import { useLinkRequests } from '@/entities/link-request/api/use-link-requests';
import type { components } from '@/shared/api/schema';
import { useNetworkStatus } from '@/shared/lib/network/useNetworkStatus';
import { formatDate } from '@/shared/lib/time/formatDate';
import { timeOutline } from '@/shared/ui/icons';
import { Button } from '@/shared/ui/Button';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { Skeleton } from '@/shared/ui/Skeleton';

// Exhaustive over the contract enum so a server-returned status never leaks raw English.
const STATUS_LABEL: Record<components['schemas']['LinkRequestStatus'], string> = {
  pending: 'Ожидает',
  accepted: 'Принят',
  declined: 'Отклонён',
  cancelled: 'Отменён',
};

export function RequestList({
  direction,
  requestId,
}: {
  direction: 'incoming' | 'outgoing';
  requestId?: string;
}) {
  const qc = useQueryClient();
  const { data, isLoading } = useLinkRequests(direction);
  const accept = useAcceptLinkRequest();
  const decline = useDeclineLinkRequest();
  const cancel = useCancelLinkRequest();
  const { isOffline } = useNetworkStatus();
  const [cancelId, setCancelId] = useState<string | null>(null);

  // Принятая заявка меняет отношение целиком: у тренера прибавляется карточка
  // в списке, у клиента появляется тренер на «Моём тренере». Инвалидируем весь
  // префикс ['clients'], а не один clientsListKey: иначе клиент принимал бы
  // запрос и продолжал видеть «У вас пока нет тренера» до истечения staleTime.
  const onAccept = (id: string) =>
    accept.mutate(id, {
      onSuccess: () => void qc.invalidateQueries({ queryKey: clientsKeyRoot }),
    });

  if (isLoading) return <Skeleton variant="list" count={3} />;

  const items = (data ?? []).filter((r) => !requestId || r.id === requestId);
  if (items.length === 0)
    return <p className="text-body-m py-8 text-center text-muted">Запросов нет</p>;

  return (
    // Figma 1084:4198 / 1101:4000: карточка заявки — контакт (H3) и дата
    // (Label) слева, чип статуса справа, пара кнопок «Принять»/«Отклонить»
    // снизу. Чип «Ожидает» в макете — инфо-роль с иконкой часов.
    <ul className="flex flex-col gap-[15px]">
      {items.map((r) => (
        <li key={r.id} className="w-full rounded-[14px] border border-line py-[10px]">
          <div className="flex items-center justify-between gap-[10px] px-[10px]">
            <div className="min-w-0">
              <p className="text-h3 truncate text-content">{r.counterpart.name}</p>
              <p className="text-label mt-[10px] text-content">{formatDate(r.created_at)}</p>
            </div>
            {r.status === 'pending' ? (
              <span className="text-label flex shrink-0 items-center gap-1 rounded-full border border-info-fill px-[10px] py-[6px] text-info-fill">
                <Icon icon={timeOutline} aria-hidden="true" />
                {STATUS_LABEL[r.status]}
              </span>
            ) : (
              <span className="text-label shrink-0 text-muted">{STATUS_LABEL[r.status]}</span>
            )}
          </div>

          {direction === 'incoming' && r.status === 'pending' && (
            <div className="mt-[10px] flex items-center gap-[22px] px-[10px]">
              <Button
                className="flex-1 bg-success-fill"
                disabled={isOffline}
                loading={accept.isPending}
                onClick={() => onAccept(r.id)}
              >
                Принять
              </Button>
              <Button
                className="flex-1 bg-danger-fill"
                disabled={isOffline}
                onClick={() => decline.mutate(r.id)}
              >
                Отклонить
              </Button>
            </div>
          )}
          {direction === 'outgoing' && r.status === 'pending' && (
            <div className="mt-[10px] px-[10px]">
              <Button variant="outline" disabled={isOffline} onClick={() => setCancelId(r.id)}>
                Отменить запрос
              </Button>
            </div>
          )}
        </li>
      ))}
      {/* Один диалог на список, а не по одному на строку: вопрос одинаков, а
          различает их только id отменяемого запроса. */}
      <ConfirmDialog
        isOpen={cancelId !== null}
        title="Отменить запрос?"
        confirmLabel="Отменить запрос"
        cancelLabel="Назад"
        pending={cancel.isPending}
        onConfirm={() => {
          if (cancelId) cancel.mutate(cancelId);
          setCancelId(null);
        }}
        onCancel={() => setCancelId(null)}
      />
    </ul>
  );
}
