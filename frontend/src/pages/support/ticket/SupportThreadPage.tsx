import { useState } from 'react';
import { useParams } from 'react-router-dom';

import { useSupportTicket, useAddReply } from '@/entities/support/api/use-support';
import { useNetworkStatus } from '@/shared/lib/network/useNetworkStatus';
import { formatDate } from '@/shared/lib/time/formatDate';
import { Button } from '@/shared/ui/Button';
import { Skeleton } from '@/shared/ui/Skeleton';
import { Textarea } from '@/shared/ui/Textarea';

import { SupportShell } from '../ui/SupportShell';

export function SupportThreadPage() {
  const { id = '' } = useParams<{ id: string }>();
  const { data: ticket, isLoading } = useSupportTicket(id);
  const addReply = useAddReply(id);
  const { isOffline } = useNetworkStatus();
  const [body, setBody] = useState('');

  const handleReply = () => {
    if (body.trim().length === 0) return;
    // The reply is outbox-backed (ADD_SUPPORT_REPLY offline default), so offline
    // we clear the field immediately instead of leaving the button spinning on a
    // paused mutation — the reply replays on reconnect.
    addReply.mutate(
      { ticketId: id, body: { body: body.trim() } },
      { onSuccess: () => setBody('') },
    );
    if (isOffline) setBody('');
  };

  return (
    <SupportShell title="Обращение">
      {isLoading || !ticket ? (
        <Skeleton variant="card" count={2} />
      ) : (
        <>
          {/* Заголовок экрана — в шапке (PageTitle, единственный h1), тема
              обращения здесь это подзаголовок контента. */}
          <h2 className="text-h2 text-content">{ticket.subject}</h2>
          <div className="flex flex-col gap-[15px]">
            {/* Собственное сообщение — заливка акцентом; текст поверх заливки
                берём из парного chart-1-fg, а не из text-white. */}
            <div className="self-end max-w-[85%] rounded-[14px] bg-brand-400 p-3 text-body-s text-chart-1-fg">
              {ticket.message}
            </div>
            {ticket.replies.map((reply) => (
              <div
                key={reply.id}
                className={
                  // Ответ поддержки — заливка --card, а не обводка: это
                  // реплика в переписке, парная залитому собственному
                  // сообщению, а обводка делала её отдельным объектом другого
                  // рода, чем сообщение напротив.
                  reply.author === 'admin'
                    ? 'self-start max-w-[85%] rounded-[14px] bg-card p-3 text-body-s text-content'
                    : 'self-end max-w-[85%] rounded-[14px] bg-brand-400 p-3 text-body-s text-chart-1-fg'
                }
              >
                <p>{reply.body}</p>
                <p
                  className={
                    reply.author === 'admin'
                      ? 'mt-1 text-caption text-muted'
                      : 'mt-1 text-caption text-chart-1-fg opacity-80'
                  }
                >
                  {formatDate(reply.created_at)}
                </p>
              </div>
            ))}
          </div>

          {ticket.status !== 'closed' && (
            <div className="flex flex-col gap-[15px]">
              <Textarea
                label="Ваш ответ"
                rows={4}
                value={body}
                onChange={(event) => setBody(event.target.value)}
              />
              <Button
                disabled={body.trim().length === 0 || (!isOffline && addReply.isPending)}
                loading={!isOffline && addReply.isPending}
                onClick={handleReply}
              >
                Отправить
              </Button>
              {isOffline && (
                <p className="text-caption text-muted">
                  Отправится автоматически при подключении к сети
                </p>
              )}
            </div>
          )}
        </>
      )}
    </SupportShell>
  );
}
