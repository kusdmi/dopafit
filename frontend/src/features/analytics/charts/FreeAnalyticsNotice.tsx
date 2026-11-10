import { PremiumNotice } from '@/shared/ui/PremiumNotice';
import type { components } from '@/shared/api/schema';
import { formatDate } from '@/shared/lib/time/formatDate';
import { informationCircleOutline } from '@/shared/ui/icons';
import { Icon } from '@/shared/ui/primitives';

export function FreeAnalyticsNotice({
  range,
}: {
  range?: components['schemas']['AnalyticsRange'];
}) {
  if (!range?.limited) return null;

  return (
    <aside
      role="note"
      aria-label="Бесплатная аналитика"
      className="flex items-start gap-3 rounded-[14px] border border-brand-400 bg-card-light p-4"
    >
      <Icon icon={informationCircleOutline} className="shrink-0 text-[24px] text-brand-text" />
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-h3 text-content">Бесплатная аналитика за последние 30 дней</p>
        <p className="text-body-m text-content">
          Показаны данные с{' '}
          <time dateTime={range.date_from} className="whitespace-nowrap">
            {formatDate(range.date_from)}
          </time>{' '}
          по{' '}
          <time dateTime={range.date_to} className="whitespace-nowrap">
            {formatDate(range.date_to)}
          </time>
          .
        </p>
        <PremiumNotice
          compact
          title="Аналитика за всю историю"
          description="В бесплатном доступе показаны последние 30 дней. Аналитика за всю историю доступна с Premium."
        />
      </div>
    </aside>
  );
}
