import {
  HistoryBack,
  ToolbarActions,
  PageContent,
  PageHeader,
  Page,
  PageTitle,
  Toolbar,
} from '@/shared/ui/primitives';

import { PasswordResetFlow } from '@/features/auth/password-reset/PasswordResetFlow';
import { paths } from '@/shared/config/paths';

/** Screens 8-10: password reset contact, code, and new password.
 *  Figma 392:2034 / 392:4895 / 392:4914 float the back chevron and the title
 *  straight on the gradient with no header plate — hence
 *  <PageHeader transparent>. The title lives there (PageTitle is the page's
 *  single <h1>), so the flow's own Display headings below stay <h2>. */
export function PasswordResetPage() {
  return (
    <Page background="gradient">
      <PageHeader transparent>
        <Toolbar>
          <ToolbarActions slot="start">
            <HistoryBack defaultHref={paths.login} text="" />
          </ToolbarActions>
          <PageTitle>Восстановление пароля</PageTitle>
        </Toolbar>
      </PageHeader>
      <PageContent className="page-padding">
        <div className="mx-auto flex max-w-md flex-col gap-8 pt-6">
          <PasswordResetFlow />
        </div>
      </PageContent>
    </Page>
  );
}
