import {
  HistoryBack,
  ToolbarActions,
  PageContent,
  PageHeader,
  Page,
  PageTitle,
  Toolbar,
} from '@/shared/ui/primitives';

import { RegisterFlow } from '@/features/auth/register/RegisterFlow';
import { paths } from '@/shared/config/paths';

/** Screens 2-6: account creation, verification, password, and onboarding.
 *  Figma (392:1972) floats the back chevron and the title straight on the
 *  gradient with no header plate — hence <PageHeader transparent>. The title
 *  lives there (PageTitle is the page's single <h1>), so the wizard steps
 *  below use <h2> for their own Display headings. */
export function RegisterPage() {
  return (
    <Page background="gradient">
      <PageHeader transparent>
        <Toolbar>
          <ToolbarActions slot="start">
            <HistoryBack defaultHref={paths.welcome} text="" />
          </ToolbarActions>
          <PageTitle>Регистрация</PageTitle>
        </Toolbar>
      </PageHeader>
      <PageContent className="page-padding">
        <div className="mx-auto flex max-w-md flex-col gap-8 pt-6">
          <RegisterFlow />
        </div>
      </PageContent>
    </Page>
  );
}
