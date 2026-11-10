import { PageContent, PageHeader, Page, PageTitle, Toolbar } from '@/shared/ui/primitives';

import { useSessionStore } from '@/entities/session/model/store';
import { paths } from '@/shared/config/paths';
import { BackButton } from '@/shared/ui/BackButton';

import { ClientTrainerView } from './ClientTrainerView';
import { TrainerClientsView } from './TrainerClientsView';

export function ClientsPage() {
  const role = useSessionStore((s) => s.user?.role);
  const isTrainer = role === 'trainer';

  return (
    // Figma 1094:2933 («Мои клиенты») и 1084:3883 («Мой тренер») — оба экрана
    // на основном градиенте с прозрачной шапкой: стрелка «назад» и заголовок
    // Display лежат прямо на градиенте, без плашки --card и разделителя.
    <Page background="gradient">
      <PageHeader transparent>
        <Toolbar>
          <BackButton to={paths.settings} />
          {/* Общий .page-title — центрированный заголовок тулбара 17px; в
              макете это Display (26px ExtraBold) по левому краю, поэтому роль
              и выравнивание задаём здесь, не форкая общий класс. */}
          <PageTitle className="text-h1 text-left">
            {isTrainer ? 'Мои клиенты' : 'Мой тренер'}
          </PageTitle>
        </Toolbar>
      </PageHeader>
      <PageContent className="page-padding">
        {isTrainer ? <TrainerClientsView /> : <ClientTrainerView />}
      </PageContent>
    </Page>
  );
}
