import { type ReactNode } from 'react';

import { PageHeader, PageTitle } from '@/shared/ui/primitives';

/**
 * Шапка КОРНЕВОГО экрана вкладки: заголовок уровня 1 плюс строка-пояснение под
 * ним, обе прижаты влево и лежат прямо на градиенте.
 *
 * Такую пару «заголовок + подзаголовок» рисуют все макеты корневых экранов:
 * настройки (1059:2004 / 1064:2038), антропометрия (756:1979), деактивация
 * (1071:2097) — везде это блок «Frame 452» высотой 54px = заголовок 36px плюс
 * Body S 18px. Общий компонент нужен, чтобы один и тот же блок не расходился
 * по трём файлам.
 *
 * Уровень заголовка — 1 (H1 22px, влево), а НЕ Display 26px из макета: это
 * продуктовое решение, записанное в design-system.md («Уровни заголовков
 * экранов»). Подзаголовок — роль Body S приглушённым цветом, как в макете.
 *
 * Вложенные экраны (подстраницы настроек, флоу, авторизация) сюда не
 * относятся: у них уровень 2 — центрированный заголовок под стрелкой «назад»,
 * его даёт `Toolbar` + `PageTitle` без класса `text-left`.
 */
export function RootPageHeader({ title, subtitle }: { title: ReactNode; subtitle?: ReactNode }) {
  return (
    <PageHeader transparent>
      {/* Собственные отступы блока, а не `.toolbar`: тулбар — это строка с
          тап-целью стрелки «назад» под центрированный заголовок уровня 2, и
          его 44px здесь только мешали бы паре из двух строк. */}
      <div className="flex flex-col gap-1.5 px-6 pb-2 pt-4">
        <PageTitle className="text-h1 text-left text-content">{title}</PageTitle>
        {subtitle !== undefined && <p className="m-0 text-body-s text-muted">{subtitle}</p>}
      </div>
    </PageHeader>
  );
}
