import { PageContent, Page } from '@/shared/ui/primitives';
import { RootPageHeader } from '@/shared/ui/RootPageHeader';

import { ProgramList } from '@/pages/programs/list/ProgramList';

export function ProgramsPage() {
  return (
    // Figma 954:1545: экран списка программ идёт на основном градиенте, а
    // заголовок лежит прямо на нём — без плашки шапки и разделителя, как на
    // аналитике (768:1058). Пару «заголовок + подзаголовок» даёт общий
    // RootPageHeader: тот же блок стоит на замерах и в настройках.
    <Page background="gradient">
      <RootPageHeader title="Программы тренировок" subtitle="Выберите готовую или создайте свою" />
      <PageContent className="page-padding">
        <ProgramList />
      </PageContent>
    </Page>
  );
}
