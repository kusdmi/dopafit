import { Icon } from '@/shared/ui/primitives';
import { checkmarkCircle, copyOutline } from '@/shared/ui/icons';
import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useRef, useState } from 'react';

import { useReferralInfo } from '@/entities/referral/api/use-referral-info';
import { Skeleton } from '@/shared/ui/Skeleton';

import { SettingsShell } from '../ui/SettingsShell';

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard may be unavailable (e.g. insecure context); fail silently.
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={label}
      className="flex w-full items-center justify-center gap-2 rounded-[14px] border border-line p-[10px] text-center text-h3 text-content"
    >
      {/* Галочка «Скопировано» — success-ролью, а не унаследованным от кнопки
          text-content. Алиас тематический: 400 в тёмной теме, 600 в
          светлой, поэтому читается на обеих. */}
      <Icon
        icon={copied ? checkmarkCircle : copyOutline}
        aria-hidden="true"
        className={copied ? 'text-success' : undefined}
      />
      {copied ? 'Скопировано' : label}
    </button>
  );
}

function ReferralStat({ value, caption }: { value: number; caption: string }) {
  return (
    // Плитка статистики — тихая заливка без обводки: она лежит внутри
    // обведённой карточки «Статистика», а min-h выравнивает плитки, подпись
    // у которых занимает одну или две строки.
    <div className="flex min-h-[72px] flex-1 flex-col items-center justify-center gap-[5px] rounded-[14px] bg-card-light p-[10px] text-center">
      <span className="text-h3 text-content">{value}</span>
      <span className="text-caption text-muted">{caption}</span>
    </div>
  );
}

export function ReferralPage() {
  const { data: info, isLoading } = useReferralInfo();

  return (
    <SettingsShell title="Реферальная программа">
      {isLoading || !info ? (
        <Skeleton variant="form" count={2} />
      ) : (
        <>
          {/* Акцентная обводка — только здесь. Код приглашения и есть то, ради
              чего экран открывают; когда её носили все восемь блоков подряд,
              акцент переставал что-либо выделять. Остальные поверхности —
              нейтральная линия. */}
          <div className="flex flex-col gap-[10px] rounded-[14px] border border-brand-400 p-[10px]">
            <p className="text-body-m px-[10px] text-content">Ваш реферальный код</p>
            <p className="text-display break-all px-[10px] text-center text-brand-text">
              {info.code}
            </p>
            <CopyButton value={info.code} label="Скопировать код" />
          </div>

          <div className="flex flex-col items-center gap-[10px] rounded-[14px] border border-line p-[10px]">
            <p className="text-body-m text-content">QR-код для быстрого приглашения</p>
            {/* ОСОЗНАННОЕ ИСКЛЮЧЕНИЕ из правила «только семантические токены»:
                QR-код обязан оставаться сканируемым, а сканеры рассчитывают на
                тёмные модули на светлом фоне. Тематические токены инвертировали
                бы пару в тёмной теме и сломали бы распознавание, поэтому белая
                подложка и #ffffff/#000000 у самого кода зафиксированы намеренно
                и не должны выметаться зачисткой цветовых литералов. */}
            <div className="rounded-card bg-white p-4">
              <QRCodeSVG
                value={info.link}
                size={176}
                bgColor="#ffffff"
                fgColor="#000000"
                title="QR-код реферальной ссылки"
              />
            </div>
            {/* Ссылка выключкой влево: длинный URL по центру рвётся так, что
                обе строки начинаются в разных местах и читаются хуже. */}
            <p className="w-full break-all text-body-m text-content">{info.link}</p>
            <CopyButton value={info.link} label="Скопировать ссылку" />
          </div>

          <section className="flex flex-col gap-[10px] rounded-[14px] border border-line p-[10px]">
            <h2 className="text-h3 text-center text-content">Статистика</h2>
            <div className="flex gap-[15px]">
              <ReferralStat value={info.invited_count} caption="Приглашено" />
              <ReferralStat value={info.active_count} caption="Активных" />
              <ReferralStat value={info.earned_days} caption="Дней начислено" />
            </div>
          </section>
        </>
      )}
    </SettingsShell>
  );
}
