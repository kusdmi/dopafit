import {
  PageContent,
  PageHeader,
  Page,
  PageTitle,
  Toolbar,
  useToast,
} from '@/shared/ui/primitives';
import { useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { useNavigation } from '@/shared/lib/navigation';

import { useSessionStore } from '@/entities/session/model/store';
import { useClient } from '@/entities/client/api/use-client';
import {
  useArchiveClient,
  useUnarchiveClient,
  useUnlinkClient,
  useUpdateClient,
} from '@/entities/client/api/use-client-mutations';
import { useUpdateClientTrainerFields } from '@/entities/client/api/use-update-client-trainer-fields';
import { useCreateLinkRequest } from '@/entities/link-request/api/use-link-request-mutations';
import { ClientForm } from '@/features/client-form/ClientForm';
import { toApiError } from '@/shared/api/client';
import { connectionMeasurements, paths } from '@/shared/config/paths';
import { useNetworkStatus } from '@/shared/lib/network/useNetworkStatus';
import { BackButton } from '@/shared/ui/BackButton';
import { Button } from '@/shared/ui/Button';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { Skeleton } from '@/shared/ui/Skeleton';

import { ClientActions } from './ui/ClientActions';
import { ClientDates, ClientHeaderCard, ClientInjuriesCard } from './ui/ClientSummary';

export function ClientEditPage() {
  const { id = '' } = useParams<{ id: string }>();
  const history = useNavigation();
  const { data: client, isLoading } = useClient(id);
  const update = useUpdateClient(id);
  const updateNote = useUpdateClientTrainerFields(id);
  const unlink = useUnlinkClient();
  const archive = useArchiveClient();
  const unarchive = useUnarchiveClient();
  const resend = useCreateLinkRequest();
  const { isOffline } = useNetworkStatus();
  const [present] = useToast();
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  const role = useSessionStore((s) => s.user?.role);

  const isLinked = client?.client_user_id !== null && client?.client_user_id !== undefined;
  const isUnlinked = client?.status === 'unlinked';

  // Trainer-only page (see AddClientPage): redirect a client who deep-links here.
  if (role !== 'trainer') return <Navigate replace to={paths.connections} />;

  /** Общий хвост архивации/разархивации: тост и возврат к списку. */
  const afterStatusChange = (message: string) => ({
    onSuccess: () => {
      void present({ message, duration: 2000 });
      history.replace(paths.connections);
    },
  });

  return (
    // Figma 1100:3247 — градиент + прозрачная шапка, как на остальных экранах
    // блока.
    <Page background="gradient">
      <PageHeader transparent>
        <Toolbar>
          <BackButton to={paths.connections} />
          <PageTitle className="text-h1 text-left">
            Редактирование клиента
          </PageTitle>
        </Toolbar>
      </PageHeader>
      <PageContent className="page-padding">
        {isLoading || !client ? (
          <Skeleton variant="form" count={2} />
        ) : (
          <div className="mx-auto flex max-w-md flex-col gap-[10px]">
            {/* Карточка-шапка — только у привязанного клиента. У него форма
                ниже нередактируемая и своих полей с именем и статусом не
                показывает, так что карточка остаётся единственным источником.
                У «своего» клиента форма редактируемая и те же имя и статус
                выводит сама — там карточка была чистым дублем. */}
            {isLinked && <ClientHeaderCard client={client} />}

            {isLinked && (
              <p className="text-body-m text-muted">
                Это аккаунт-клиент. Личные данные редактирует сам клиент.
              </p>
            )}

            <ClientForm
              initial={{
                display_name: client.display_name,
                phone: client.phone,
                injuries: client.injuries,
                note: client.note,
              }}
              submitLabel="Сохранить изменения"
              pending={update.isPending || updateNote.isPending}
              linked={isLinked}
              onSave={async ({ display_name, phone, injuries, note }) => {
                try {
                  if (!isLinked) {
                    await update.mutateAsync({ display_name, phone, injuries });
                  }
                  await updateNote.mutateAsync({ note });
                  void present({ message: 'Изменения сохранены!', duration: 2000 });
                } catch (e) {
                  void present({ message: toApiError(e).message, duration: 2500 });
                }
              }}
            />

            <ClientDates client={client} />

            {isLinked && <ClientInjuriesCard injuries={client.injuries} />}

            {isLinked && (
              // A linked client has a real account whose measurements the trainer
              // may view read-only (photos stay private, see ClientMeasurementsPage).
              <Button
                variant="outline"
                onClick={() => history.push(connectionMeasurements(client.id))}
              >
                Замеры клиента
              </Button>
            )}

            {!isUnlinked && (
              <ClientActions
                archived={client.status === 'archived'}
                isOffline={isOffline}
                onArchive={() =>
                  archive.mutate(client.id, afterStatusChange('Клиент архивирован'))
                }
                onUnarchive={() =>
                  unarchive.mutate(client.id, afterStatusChange('Клиент разархивирован'))
                }
                onUnlink={() => setConfirmUnlink(true)}
              />
            )}

            {isUnlinked && client.client_user_id && (
              <Button
                variant="primary"
                disabled={isOffline}
                onClick={() =>
                  resend.mutate(
                    { query: client.client_user_id as string },
                    {
                      ...afterStatusChange('Запрос отправлен'),
                      onError: (e) =>
                        void present({ message: toApiError(e).message, duration: 2500 }),
                    },
                  )
                }
              >
                Отправить запрос снова
              </Button>
            )}
          </div>
        )}
      </PageContent>

      {/* Тот же ConfirmDialog, что у выхода из аккаунта и остальных «да/нет»
          вопросов, вместо собственного окна через useAlert: у того кнопки
          рисовались голым `action-button` без вариантов, поэтому «Отмена» и
          «OK» выглядели одинаково и ответ приходилось читать, а не видеть. */}
      <ConfirmDialog
        isOpen={confirmUnlink}
        title="Отвязать клиента?"
        message="Это отменит связь с аккаунтом, но сохранит все данные."
        confirmLabel="Отвязать"
        pending={unlink.isPending}
        onConfirm={() => {
          setConfirmUnlink(false);
          if (client) {
            unlink.mutate(client.id, afterStatusChange('Клиент отвязан от аккаунта!'));
          }
        }}
        onCancel={() => setConfirmUnlink(false)}
      />
    </Page>
  );
}
