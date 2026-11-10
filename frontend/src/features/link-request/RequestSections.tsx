import { useLinkRequests } from '@/entities/link-request/api/use-link-requests';

import { RequestList } from './RequestList';

/**
 * Обе стороны заявок на связь подряд: входящие и исходящие.
 *
 * Тренеру показывалась только `direction="incoming"` — отправив запрос
 * клиенту, он терял его из виду: не видел, что запрос висит в ожидании, и не
 * мог его отменить, хотя `useCancelLinkRequest` и права на бэкенде
 * (`clients.decide`: `cancel` разрешён отправителю) уже были на месте.
 *
 * Почему две секции, а не переключатель, как у клиента (ClientTrainerView):
 * на обоих экранах тренера (`TrainerClientsView`, `AddClientPage`) уже стоит
 * `Segment` верхнего уровня («Мои клиенты / Запросы», «Добавить / Запросы»).
 * Второй pill-селектор внутри вкладки первого дал бы два одинаковых контрола
 * друг под другом, и было бы неясно, какой из них главный. У клиента такого
 * верхнего переключателя нет, поэтому там `Segment` уместен — расхождение
 * экранов здесь осознанное, а не случайное.
 *
 * Списки короткие (заявка живёт до ответа), так что обе секции помещаются без
 * прокрутки, а каждая при пустоте сама рисует «Запросов нет» — то есть
 * состояние «я ничего не отправлял» тоже видно, а не просто отсутствует.
 */
interface Props {
  /**
   * Уровень заголовков секций. На «Моих клиентах» секции — первые заголовки
   * внутри вкладки, поэтому 2; на экране добавления клиента над ними уже стоит
   * <h2> «Актуальные запросы», и там 3. Иерархия не должна прыгать через
   * уровень (см. design-system.md, «Уровни заголовков экранов»).
   */
  headingLevel?: 2 | 3;
  requestId?: string;
}

export function RequestSections({ headingLevel = 2, requestId }: Props) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  // Роль типографики берётся по уровню, чтобы размер шёл за иерархией.
  const headingClass = headingLevel === 2 ? 'text-h2' : 'text-h3';
  const target = useLinkRequests(undefined, Boolean(requestId));
  if (requestId) {
    if (target.isLoading) return null;
    const request = target.data?.find((item) => item.id === requestId);
    if (
      target.isError ||
      !request ||
      request.status === 'declined' ||
      request.status === 'cancelled'
    )
      return <p className="text-body-m py-8 text-center text-muted">Заявка недоступна</p>;
    return (
      <section className="flex flex-col gap-[15px]">
        <Heading className={`${headingClass} text-content`}>
          {request.direction === 'incoming' ? 'Входящие' : 'Отправленные'}
        </Heading>
        <RequestList direction={request.direction} requestId={requestId} />
      </section>
    );
  }
  return (
    <div className="flex flex-col gap-[25px]">
      <section className="flex flex-col gap-[15px]">
        <Heading className={`${headingClass} text-content`}>Входящие</Heading>
        <RequestList direction="incoming" />
      </section>
      <section className="flex flex-col gap-[15px]">
        <Heading className={`${headingClass} text-content`}>Отправленные</Heading>
        <RequestList direction="outgoing" />
      </section>
    </div>
  );
}
