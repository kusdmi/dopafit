import { Icon, useToast } from '@/shared/ui/primitives';
import { checkmarkCircle } from '@/shared/ui/icons';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { persistOfflineState } from '@/shared/lib/query/persistQueryClient';
import { Link } from 'react-router-dom';

import { useCreateTicket } from '@/entities/support/api/use-support';
import { paths } from '@/shared/config/paths';
import { useNetworkStatus } from '@/shared/lib/network/useNetworkStatus';
import { Button } from '@/shared/ui/Button';
import { Input } from '@/shared/ui/Input';
import { Textarea } from '@/shared/ui/Textarea';

import { SupportShell } from '../ui/SupportShell';

export function SupportPage() {
  const queryClient = useQueryClient();
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [submitted, setSubmitted] = useState<false | 'sent' | 'queued'>(false);
  const create = useCreateTicket();
  const { isOffline } = useNetworkStatus();
  const [presentToast] = useToast();

  const canSubmit = subject.trim().length > 0 && message.trim().length > 0;
  const messageTooLong = message.trim().length > 5000;

  const handleSubmit = async () => {
    if (!canSubmit || messageTooLong) return;
    const body = { subject: subject.trim(), message: message.trim() };

    if (isOffline) {
      // create-ticket is outbox-backed: offline the mutation PAUSES, so awaiting
      // mutateAsync would spin the submit button forever. Fire-and-forget so it
      // queues, then confirm imperatively (the outbox replays it on reconnect).
      create.mutate(body);
      try {
        await persistOfflineState(queryClient);
      } catch {
        void presentToast({
          message: 'Не удалось сохранить обращение на устройстве',
          duration: 2500,
        });
        return;
      }
      void presentToast({
        message: 'Обращение отправится при подключении к сети',
        duration: 2500,
      });
      // Офлайн тикет лежит в outbox и на сервер ещё не ушёл — экран-подтверждение
      // должен говорить именно это. Тост живёт 2.5 секунды и исчезает, а экран
      // остаётся: обещать «ответим в ближайшее время» здесь было бы неправдой.
      setSubmitted('queued');
      return;
    }

    try {
      await create.mutateAsync(body);
      setSubmitted('sent');
    } catch {
      void presentToast({ message: 'Не удалось отправить обращение', duration: 2500 });
    }
  };

  if (submitted) {
    const queued = submitted === 'queued';
    return (
      <SupportShell title="Техподдержка">
        {/* Подтверждение — единственный объект на экране, рамка здесь уместна
            как первый уровень. Иконка крупная, рамка ей не нужна. */}
        <div className="flex flex-col items-center gap-[15px] rounded-[15px] border border-line p-5 text-center">
          <Icon icon={checkmarkCircle} className="text-[100px] text-success" aria-hidden="true" />
          <p className="text-h1 text-content">
            {queued ? 'Обращение сохранено' : 'Спасибо за обращение!'}
          </p>
          <p className="text-h3 text-brand-text">
            {queued ? 'Отправится при подключении к сети' : 'Ответим в ближайшее время'}
          </p>
        </div>
        {/* Переход к списку — действие, а не плашка: контурная кнопка, как
            любое второстепенное действие экрана. */}
        <Link
          to={paths.supportList}
          className="flex min-h-[42px] items-center justify-center gap-2 rounded-[14px] border-2 border-brand-400 px-5 py-[10px] text-center text-h3 text-brand-text"
        >
          Мои обращения
        </Link>
      </SupportShell>
    );
  }

  return (
    <SupportShell title="Техподдержка">
      <p className="-mt-2 text-body-s text-muted">
        Опишите вашу проблему или вопрос, и мы свяжемся с вами в ближайшее время
      </p>
      <form
        className="flex flex-col gap-[15px]"
        onSubmit={(event) => {
          event.preventDefault();
          void handleSubmit();
        }}
      >
        <Input
          label="Тема обращения"
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
        />
        <Textarea
          label="Сообщение"
          rows={8}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
        />
        <p className="text-caption text-muted">До 5000 символов</p>
        {messageTooLong && (
          <p role="alert" className="text-body-s text-danger">
            Сообщение не должно превышать 5000 символов
          </p>
        )}
        <p className="text-caption text-muted">Уведомление придёт в приложении.</p>
        <Button type="submit" disabled={!canSubmit || create.isPending} loading={create.isPending}>
          Отправить
        </Button>
      </form>

      {/* Справка — тихий текст на тонированной подложке, без обводки: это
          не объект и не действие, а примечание к форме выше. Обводка ставила
          её в один ранг с кнопкой «Отправить» и полями. */}
      <p className="rounded-[14px] bg-card p-4 text-body-s text-muted">
        Среднее время ответа: 24 часа. Мы стараемся отвечать как можно быстрее!
      </p>

      {/* Переход к списку — второстепенное действие: контурная кнопка. */}
      <Link
        to={paths.supportList}
        className="flex min-h-[42px] items-center justify-center gap-2 rounded-[14px] border-2 border-brand-400 px-5 py-[10px] text-center text-h3 text-brand-text"
      >
        Мои обращения
      </Link>
    </SupportShell>
  );
}
