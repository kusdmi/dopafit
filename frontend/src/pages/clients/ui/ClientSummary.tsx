import { medkitOutline } from '@/shared/ui/icons';
import { Icon } from '@/shared/ui/primitives';
import { StatusBadge } from '@/shared/ui/StatusBadge';
import type { components } from '@/shared/api/schema';
import { formatDate } from '@/shared/lib/time/formatDate';

import { accentCard, clientCard, dateBox, fieldLabel } from './clients-ui';

type ClientOut = components['schemas']['ClientOut'];

/** Шапка клиента: имя с бейджем статуса на акцентной карточке.
 *
 *  Было две оранжевые рамки подряд: внешняя от `accentCard('brand')` и
 *  внутренняя `border-l` как разделитель — обводка внутри обводки теряет
 *  смысл структурного признака (см. «Вложенность карточек»). Разделитель снят.
 *
 *  Подписи «Клиент:» нет: на экране редактирования клиента, который так и
 *  назван в шапке, она ничего не сообщает, а её `shrink-0` отнимал бы у
 *  длинного имени треть ширины. Имя занимает всю карточку. */
export function ClientHeaderCard({ client }: { client: ClientOut }) {
  return (
    <div className={`${accentCard('brand')} flex flex-col items-start gap-[10px]`}>
      <h2 className="text-h2 w-full truncate text-content">{client.display_name}</h2>
      <StatusBadge status={client.status} managed={client.client_user_id === null} />
    </div>
  );
}

/** Даты работы с клиентом: отсутствующая дата окончания — приглушённым
 *  текстом, а не пустой плашкой. */
export function ClientDates({ client }: { client: ClientOut }) {
  return (
    <div className="flex items-start gap-[15px]">
      <div className="flex flex-1 flex-col gap-[5px]">
        <span className={`${fieldLabel} p-[10px] text-muted`}>Дата начала работы с клиентом</span>
        <span className={`${dateBox} text-content`}>{formatDate(client.start_date)}</span>
      </div>
      <div className="flex flex-1 flex-col gap-[5px]">
        <span className={`${fieldLabel} p-[10px] text-muted`}>
          Дата окончания работы с клиентом
        </span>
        <span className={`${dateBox} text-muted`}>
          {client.end_date ? formatDate(client.end_date) : 'отсутствует'}
        </span>
      </div>
    </div>
  );
}

/** Травмы и ограничения — только у привязанного аккаунта-клиента. */
export function ClientInjuriesCard({ injuries }: { injuries: string | null | undefined }) {
  return (
    <div className={`${clientCard} flex flex-col gap-[10px]`}>
      <h3 className="text-h3 flex items-center gap-2 text-muted">
        {/* Фиолетовый DS-токен — «Ан - Фиол.» = chart-4; выдуманной до макетов
            шкалы trainer-* в Figma нет. Иконка красится как текст, поэтому
            тематический `chart-4-text`. */}
        <Icon icon={medkitOutline} aria-hidden="true" className="text-chart-4-text" />
        Травмы и ограничения
      </h3>
      {injuries ? (
        <p className="text-body-m whitespace-pre-line text-content">{injuries}</p>
      ) : (
        <p className="text-body-m text-muted">Не указано</p>
      )}
    </div>
  );
}
