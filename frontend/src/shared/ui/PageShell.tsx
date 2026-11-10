import {
  HistoryBack,
  ToolbarActions,
  PageContent,
  PageHeader,
  Page,
  PageTitle,
  Toolbar,
} from '@/shared/ui/primitives';
import { RootPageHeader } from '@/shared/ui/RootPageHeader';
import { type ReactNode } from 'react';

/**
 * Standard page wrapper: Page > PageHeader/Toolbar (title + optional back)
 * > padded, centered PageContent. Omit `backHref` for a root page without a back
 * button.
 *
 * Used ONLY by the settings subtree (pages/settings/ui/SettingsShell) and by
 * support (pages/support/ui/SupportShell) — eleven screens in total, which is
 * why the Figma-mandated chrome is set here once instead of on each screen.
 *
 * Every settings/support mock (1059:2001, 1064:2035, 1064:2218, 1071:2094,
 * 1073:2420, 1081:2565, 1082:3011, 1082:3295, 1083:3528) draws the screen on
 * the primary background gradient, with the back chevron and the title floating
 * straight on it — no opaque --card header plate and no divider under it. That
 * is exactly the `<Page background="gradient">` + `<PageHeader transparent>`
 * pair introduced for the gradient auth screens, so both are opted into here.
 *
 * Два уровня шапки, а не один:
 *
 * - БЕЗ `backHref` это КОРНЕВОЙ экран вкладки (сами «Настройки»), и шапка у
 *   него общая с другими корневыми экранами — `RootPageHeader`: заголовок
 *   уровня 1 влево плюс строка-пояснение. Ровно эту пару рисует макет
 *   1059:2004 / 1064:2038 («Frame 452» = заголовок 36px + Body S 18px), и ровно
 *   она стоит на «Программах» и «Замерах».
 * - С `backHref` это ВЛОЖЕННЫЙ экран: уровень 2, заголовок по центру под
 *   стрелкой «назад» (см. design-system.md, «Уровни заголовков экранов»).
 *
 * `PageTitle` в обоих случаях остаётся единственным <h1> экрана; per-screen
 * section headings inside the content are <h2>/<h3>.
 */
export function PageShell({
  title,
  subtitle,
  backHref,
  children,
}: {
  title: string;
  subtitle?: string;
  backHref?: string;
  children: ReactNode;
}) {
  const root = backHref === undefined;
  return (
    <Page background="gradient">
      {root ? (
        <RootPageHeader title={title} subtitle={subtitle} />
      ) : (
        <PageHeader transparent>
          <Toolbar>
            <ToolbarActions slot="start">
              <HistoryBack defaultHref={backHref} text="" />
            </ToolbarActions>
            <PageTitle>{title}</PageTitle>
          </Toolbar>
        </PageHeader>
      )}
      {/* Открытие экрана — тоже ответ на действие, поэтому содержимое
          появляется тем же коротким fade-in, что и смена контента на других
          экранах. Один класс здесь покрывает все одиннадцать экранов настроек
          и поддержки. `prefers-reduced-motion` учтён в `.animate-fade-in`.

          Своего `pt-*` здесь НЕТ: верхний отступ задаёт `.page-padding` (24px),
          как и на экранах, которые верстают `PageContent` напрямую. */}
      <PageContent className="page-padding">
        <div className="animate-fade-in mx-auto flex max-w-md flex-col gap-6">{children}</div>
      </PageContent>
    </Page>
  );
}
