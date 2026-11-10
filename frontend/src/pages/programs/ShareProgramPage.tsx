import {
  PageContent,
  PageHeader,
  Page,
  PageTitle,
  Toolbar,
  useToast,
} from '@/shared/ui/primitives';
import { useState } from 'react';
import {  Navigate, useParams  } from 'react-router-dom';
import { useNavigation } from '@/shared/lib/navigation';

import { useShareProgram } from '@/entities/program/api/use-share-program';
import { useSessionStore } from '@/entities/session/model/store';
import { ClientPicker } from '@/features/share-program/ClientPicker';
import { hintBox } from '@/pages/programs/ui/program-ui';
import { toApiError } from '@/shared/api/client';
import { paths, program } from '@/shared/config/paths';
import { useNetworkStatus } from '@/shared/lib/network/useNetworkStatus';
import { BackButton } from '@/shared/ui/BackButton';
import { Button } from '@/shared/ui/Button';

export function ShareProgramPage() {
  const { id = '' } = useParams<{ id: string }>();
  const history = useNavigation();
  const share = useShareProgram(id);
  const { isOffline } = useNetworkStatus();
  const [selected, setSelected] = useState<string | null>(null);
  const [present] = useToast();
  const role = useSessionStore((s) => s.user?.role);

  // Trainer-only page (see AddClientPage): redirect a client who deep-links here.
  if (role !== 'trainer') return <Navigate replace to={paths.programs} />;

  return (
    // Своего узла у экрана в макетах нет — ведём его по общим правилам
    // спеки, как соседние экраны программ: градиент, прозрачная шапка,
    // плашка-подсказка, единый Button.
    <Page background="gradient">
      <PageHeader transparent>
        <Toolbar>
          <BackButton to={program(id)} />
          <PageTitle className="text-content">Скопировать программу</PageTitle>
        </Toolbar>
      </PageHeader>
      <PageContent className="page-padding">
        <div className="flex flex-col gap-[25px]">
        <h2 className={`m-0 ${hintBox}`}>Выберите клиента</h2>
        <ClientPicker selectedId={selected} onSelect={setSelected} />
        <Button
          variant="primary"
          disabled={!selected || isOffline}
          loading={share.isPending}
          onClick={async () => {
            if (!selected) return;
            try {
              await share.mutateAsync(selected);
              void present({ message: 'Программа скопирована', duration: 2000 });
              history.goBack();
            } catch (e) {
              void present({ message: toApiError(e).message, duration: 2500 });
            }
          }}
        >
          {isOffline ? 'Недоступно офлайн' : 'Скопировать'}
        </Button>
        </div>
      </PageContent>
    </Page>
  );
}
