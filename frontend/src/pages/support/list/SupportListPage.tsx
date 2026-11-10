import { Icon } from '@/shared/ui/primitives';
import { chevronForward } from '@/shared/ui/icons';
import { Link } from 'react-router-dom';

import { useSupportTickets } from '@/entities/support/api/use-support';
import { supportThread } from '@/shared/config/paths';
import { formatDate } from '@/shared/lib/time/formatDate';
import { DeferredLoading } from '@/shared/ui/DeferredLoading';
import { Skeleton } from '@/shared/ui/Skeleton';

import { StatusChip } from '../ui/StatusChip';
import { SupportShell } from '../ui/SupportShell';

export function SupportListPage() {
  const { data: tickets, isLoading } = useSupportTickets();

  return (
    <SupportShell title="Мои обращения">
      <DeferredLoading
        loading={isLoading || !tickets}
        fallback={<Skeleton variant="card" count={3} />}
      >
        {!tickets || tickets.length === 0 ? (
          // Пустое состояние ЭКРАНА (вокруг нет карточек) — рамка здесь первый
          // и единственный уровень, поэтому остаётся.
          <div className="rounded-[14px] border border-line p-4 text-center text-body-s text-muted">
            У вас пока нет обращений
          </div>
        ) : (
          <nav className="flex flex-col gap-[15px]">
            {tickets.map((ticket) => (
              <Link
                key={ticket.id}
                to={supportThread(ticket.id)}
                // Строка списка — заливка, а не обводка: строк много, и
                // одинаковые рамки подряд сливались в сетку из ничего. Заливка
                // отделяет строку от градиента фона и оставляет обводку
                // свободной как признак единичного объекта.
                className="flex items-center gap-3 rounded-[14px] bg-card p-3"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-[5px]">
                  <span className="text-h3 truncate text-content">{ticket.subject}</span>
                  <span className="text-caption text-muted">{formatDate(ticket.created_at)}</span>
                </div>
                <StatusChip status={ticket.status} />
                <Icon icon={chevronForward} className="text-muted" aria-hidden="true" />
              </Link>
            ))}
          </nav>
        )}
      </DeferredLoading>
    </SupportShell>
  );
}
