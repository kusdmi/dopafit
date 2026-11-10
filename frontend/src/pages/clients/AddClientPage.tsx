import { useSubscriptionStatus } from '@/entities/subscription/api/use-subscription-status';
import { PremiumNotice } from '@/shared/ui/PremiumNotice';
import {
  PageContent,
  PageHeader,
  Page,
  PageTitle,
  Segment,
  SegmentOption,
  Toolbar,
  useToast,
} from '@/shared/ui/primitives';
import { Navigate } from 'react-router-dom';
import { useState } from 'react';
import { useNavigation } from '@/shared/lib/navigation';

import { useCreateClient } from '@/entities/client/api/use-client-mutations';
import { useSessionStore } from '@/entities/session/model/store';
import { ClientForm } from '@/features/client-form/ClientForm';
import { RequestSections } from '@/features/link-request/RequestSections';
import { SendRequestForm } from '@/features/link-request/SendRequestForm';
import { toApiError } from '@/shared/api/client';
import { paths } from '@/shared/config/paths';
import { BackButton } from '@/shared/ui/BackButton';

export function AddClientPage() {
  const history = useNavigation();
  const create = useCreateClient();
  const subscription = useSubscriptionStatus();
  const access = subscription.data?.entitlements;
  const [present] = useToast();
  const role = useSessionStore((s) => s.user?.role);
  const [tab, setTab] = useState<'add' | 'requests'>('add');

  // Trainer-only page. A client reaching it via a deep link would otherwise get
  // the trainer form and a raw 403 on submit; redirect them to their connections.
  if (role !== 'trainer') return <Navigate replace to={paths.connections} />;

  return (
    // Figma 1101:3678 / 1101:3927 — один экран в двух вкладках («Добавить» и
    // «Запросы»), на основном градиенте с прозрачной шапкой.
    <Page background="gradient">
      <PageHeader transparent>
        <Toolbar>
          <BackButton to={paths.connections} />
          <PageTitle className="text-h1 text-left">Добавить клиента</PageTitle>
        </Toolbar>
      </PageHeader>
      <PageContent className="page-padding">
        <div className="mx-auto flex max-w-md flex-col gap-[25px]">
          <p className="-mt-[10px] text-body-s text-muted">
            Выберите способ добавления нового клиента
          </p>

          {/* Тот же переключатель, что на «Моих клиентах», — общий `.segment`,
              чтобы один контрол не выглядел на двух соседних экранах
              по-разному. */}
          <Segment value={tab} onChange={(e) => setTab(e.target.value as 'add' | 'requests')}>
            <SegmentOption value="add">Добавить</SegmentOption>
            <SegmentOption value="requests">Запросы</SegmentOption>
          </Segment>

          {tab === 'requests' ? (
            <section className="flex flex-col gap-[15px]">
              <h2 className="text-h2 text-content">Актуальные запросы</h2>
              {/* Исходящие особенно уместны здесь: запрос клиенту отправляют с
                  соседней вкладки этого же экрана, и после отправки он должен
                  быть виден, а не исчезать. */}
              <RequestSections headingLevel={3} />
            </section>
          ) : (
            <>
              {/* Без обводки секции. Поля внутри уже обведены, и рамка вокруг
                  них давала третий уровень рамок на одном экране: карточка →
                  поле → вторая карточка ниже. Границу между двумя способами
                  добавления держат заголовок и вертикальный ритм. */}
              <section className="flex flex-col gap-[10px]">
                <h2 className="text-h2 text-content">Создать клиента самому</h2>
                <p className="text-body-m text-muted">
                  Создайте профиль клиента и управляйте его программой
                </p>
                {access &&
                  !access.is_active &&
                  access.usage.managed_clients >= access.limits.managed_clients && (
                    <PremiumNotice
                      title="Лимит клиентов без аккаунта"
                      description={`В бесплатном доступе до ${access.limits.managed_clients} клиентов без аккаунта. Premium расширяет лимит.`}
                    />
                  )}
                <ClientForm
                  submitLabel="Создать профиль"
                  pending={create.isPending}
                  onSave={async ({ display_name, phone, injuries, note }) => {
                    try {
                      await create.mutateAsync({ display_name, phone, injuries, note });
                      void present({ message: 'Клиент создан', duration: 2000 });
                      history.replace(paths.connections);
                    } catch (e) {
                      void present({ message: toApiError(e).message, duration: 2500 });
                    }
                  }}
                />
              </section>

              <section className="flex flex-col gap-[10px] border-t border-line pt-[25px]">
                <h2 className="text-h2 text-content">Клиент уже в приложении?</h2>
                <p className="text-body-m text-muted">
                  Найдите клиента по email или номеру телефона
                </p>
                {access &&
                  !access.is_active &&
                  access.usage.registered_clients >= access.limits.registered_clients && (
                    <PremiumNotice
                      title="Лимит клиентов с аккаунтом"
                      description={`В бесплатном доступе до ${access.limits.registered_clients} клиентов с аккаунтом. Premium расширяет лимит.`}
                    />
                  )}
                <SendRequestForm placeholder="Введите email или телефон" />
              </section>
            </>
          )}
        </div>
      </PageContent>
    </Page>
  );
}
