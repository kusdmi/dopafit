import { PremiumNotice } from '@/shared/ui/PremiumNotice';
import { useSubscriptionStatus } from '@/entities/subscription/api/use-subscription-status';
import { useState } from 'react';

import { usePhotoCompare } from '@/entities/analytics/api/use-photo-compare';
import { PrivatePhoto } from '@/entities/measurement/ui/PrivatePhoto';
import { usePhotoDates } from '@/entities/analytics/api/use-photo-dates';
import type { components } from '@/shared/api/schema';
import { formatDate } from '@/shared/lib/time/formatDate';
import { Select } from '@/shared/ui/Select';

import { ToggleGroup } from '../ToggleGroup';

type PhotoKind = components['schemas']['PhotoKind'];

const PHOTO_KINDS: { id: PhotoKind; label: string }[] = [
  { id: 'front', label: 'Спереди' },
  { id: 'back', label: 'Сзади' },
  { id: 'left', label: 'Слева' },
  { id: 'right', label: 'Справа' },
];

/** Days between two ISO dates — the mock's «27 дней» badge (852:2069). */
function daysBetween(first: string, second: string): number {
  return Math.round(Math.abs(Date.parse(second) - Date.parse(first)) / 86400000);
}

/**
 * Progress-photo comparison (Figma 793:4331 / 852:1812), part of the
 * «Антропометрия» tab.
 *
 * Photos are private to their owner — a trainer never sees a client's — so the
 * caller renders this only for own data, and no client id is ever passed on.
 */
export function PhotoCompare() {
  const subscription = useSubscriptionStatus();
  const cutoff =
    subscription.data && !subscription.data.is_active
      ? new Date(subscription.serverNow - 30 * 86400000).toISOString().slice(0, 10)
      : '0001-01-01';
  const [kind, setKind] = useState<PhotoKind>('front');
  const [firstDate, setFirstDate] = useState('');
  const [secondDate, setSecondDate] = useState('');

  const photoDates = usePhotoDates(kind);
  const compare = usePhotoCompare(firstDate && secondDate ? { kind, firstDate, secondDate } : null);

  const dates = (photoDates.data?.dates ?? []).filter((date) => date >= cutoff);
  const comparison =
    compare.data &&
    compare.data.first.date >= cutoff &&
    compare.data.second.date >= cutoff &&
    !compare.isError
      ? compare.data
      : undefined;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-h2 text-content">Сравнение фотографий прогресса</h2>
      {subscription.data && !subscription.data.is_active && (
        <PremiumNotice
          compact
          title="Фото за всю историю"
          description="В бесплатном доступе фотографии за последние 30 дней. Premium открывает всю историю фотографий."
        />
      )}
      <ToggleGroup
        label="Тип фотографии"
        value={kind}
        onChange={setKind}
        options={PHOTO_KINDS.map((k) => ({ value: k.id, label: k.label }))}
      />
      {/* Подписи «Было»/«Стало», а не «Дата 1»/«Дата 2» из макета: два
          одинаковых серых поля подряд не говорят, которое из них «до». */}
      <div className="flex flex-col gap-3 min-[400px]:flex-row min-[400px]:items-end">
        <Select
          className="w-full min-w-0 flex-1"
          label="Было"
          value={firstDate}
          onChange={(e) => setFirstDate(e.target.value)}
        >
          <option value="">Выберите дату</option>
          {dates.map((d) => (
            <option key={d} value={d}>
              {formatDate(d)}
            </option>
          ))}
        </Select>
        <Select
          className="w-full min-w-0 flex-1"
          label="Стало"
          value={secondDate}
          onChange={(e) => setSecondDate(e.target.value)}
        >
          <option value="">Выберите дату</option>
          {dates.map((d) => (
            <option key={d} value={d}>
              {formatDate(d)}
            </option>
          ))}
        </Select>
      </div>
      {!comparison && (
        <div className="grid grid-cols-2 gap-2" aria-label="Места для фотографий">
          {['Было', 'Стало'].map((label) => (
            <div
              key={label}
              className="flex aspect-[3/4] items-center justify-center rounded-[16px] border border-line bg-card text-body-s text-muted"
            >
              {label}: выберите фотографию
            </div>
          ))}
        </div>
      )}
      {comparison && !compare.isError && (
        <>
          <div
            key={`${kind}:${comparison.first.date}:${comparison.second.date}`}
            className="animate-fade-in grid grid-cols-2 gap-2"
          >
            {/* lazy + async: блок стоит в конце длинной страницы и обычно вне
                вьюпорта при заходе, а декодирование двух полноразмерных фото на
                главном потоке перебивало бы fade-in при смене даты. */}
            <PrivatePhoto
              url={comparison.first.url}
              alt={`Фото ${formatDate(comparison.first.date)}`}
              loading="lazy"
              decoding="async"
              className="w-full rounded-[16px]"
            />
            <PrivatePhoto
              url={comparison.second.url}
              alt={`Фото ${formatDate(comparison.second.date)}`}
              loading="lazy"
              decoding="async"
              className="w-full rounded-[16px]"
            />
          </div>
          {/* «Период сравнения» из макета (852:2062): словами, плюс длина
              промежутка — её иначе пришлось бы считать в уме. */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-[16px] border border-line p-4">
            <span className="flex flex-col">
              <span className="text-body-s text-muted">Период сравнения</span>
              <span className="text-body-m text-content">
                {formatDate(comparison.first.date)} — {formatDate(comparison.second.date)}
              </span>
            </span>
            <span className="shrink-0 rounded-full border border-brand-400 px-3 py-1 text-tag text-brand-text">
              {daysBetween(comparison.first.date, comparison.second.date)} дней
            </span>
          </div>
        </>
      )}
    </section>
  );
}
