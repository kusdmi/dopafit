import { errorReason } from '@/shared/api/error-reasons';
import { PremiumNotice } from '@/shared/ui/PremiumNotice';
import { isProgramGroupPending, isProgramRestricted } from '@/entities/subscription/model/access';
import { useSubscriptionStatus } from '@/entities/subscription/api/use-subscription-status';
import {
  HistoryBack,
  ToolbarActions,
  PageContent,
  PageHeader,
  Page,
  PageTitle,
  Toolbar,
  useToast,
} from '@/shared/ui/primitives';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useNavigation } from '@/shared/lib/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { persistOfflineState } from '@/shared/lib/query/persistQueryClient';

import { useProgram } from '@/entities/program/api/use-program';
import { useSaveProgram } from '@/entities/program/api/use-save-program';
import { ProgramBuilder } from '@/features/program-editor/builder/ProgramBuilder';
import { serializeDraft } from '@/features/program-editor/builder/model/serialize';
import { useBuilderApi, useBuilderStore } from '@/features/program-editor/builder/model/store';
import { paths, program } from '@/shared/config/paths';
import { useNetworkStatus } from '@/shared/lib/network/useNetworkStatus';
import { validateDraft } from '@/features/program-editor/builder/model/validation';
import { trainingError } from '@/shared/lib/validation/training-errors';
import { containsProfanity } from '@/shared/lib/validation/profanity';

export function ProgramBuilderPage() {
  const queryClient = useQueryClient();
  const builder = useBuilderApi();
  const subscription = useSubscriptionStatus();
  const { id } = useParams<{ id?: string }>();
  const history = useNavigation();
  const existing = useProgram(id ?? null, true);
  const initEmpty = useBuilderStore((s) => s.initEmpty);
  const initFromProgram = useBuilderStore((s) => s.initFromProgram);
  const setName = useBuilderStore((s) => s.setName);
  const save = useSaveProgram();
  const { isOffline } = useNetworkStatus();
  const [presentToast] = useToast();
  // Derive "is this a fork of a standard program?" from the builder draft, which is
  // seeded once on init and survives transient query refetches/remounts. Falling back
  // to live query data avoids a flicker before the draft is populated.
  const fromStandard = useBuilderStore((s) => s.draft.fromStandard);
  const isStandard =
    fromStandard || existing.data?.is_standard === true || existing.data?.is_received === true;
  const initializedFor = useRef<string | null>(null);
  const loadedVersion = useRef<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [accessRestricted, setAccessRestricted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const key = id ?? 'new';
    if (initializedFor.current === key) return;
    if (!id) {
      initializedFor.current = key;
      loadedVersion.current = null;
      initEmpty();
      return;
    }
    // A persisted detail may be stale even when Query marks it fresh for 30 seconds.
    // Wait for the editor's forced re-fetch before copying it into the mutable draft.
    if (existing.data && !existing.isFetching) {
      initializedFor.current = key;
      loadedVersion.current = existing.data.updated_at;
      initFromProgram(existing.data);
      if (existing.data.is_standard || existing.data.is_received) {
        setName(`${existing.data.name} (копия)`);
      }
    }
  }, [id, existing.data, existing.isFetching, initEmpty, initFromProgram, setName]);

  useEffect(
    () =>
      builder.subscribe((state, previous) => {
        if (state.draft !== previous.draft) {
          setFieldErrors({});
          setError(null);
        }
      }),
    [builder],
  );

  const onSave = async () => {
    setAccessRestricted(false);
    const draft = builder.getState().draft;
    const validation = validateDraft(draft);
    setFieldErrors(validation);
    if (Object.keys(validation).length) {
      setError('Исправьте ошибки в полях программы');
      return;
    }
    const access = subscription.data?.entitlements;
    const limits = access?.limits;
    if (
      limits &&
      (draft.days.length > limits.days ||
        draft.days.some(
          (d) =>
            d.slots.length > limits.exercises ||
            d.slots.some((s) => s.exercises.length > limits.alternatives + 1),
        ))
    ) {
      setAccessRestricted(true);
      setError(
        `Ваш тариф: до ${limits.days} дней, ${limits.exercises} упражнений и ${limits.alternatives} альтернатив`,
      );
      return;
    }
    if (access && !subscription.data?.is_active) {
      const resource = access.programs.find((p) => p.id === id);
      const selected = access.programs.filter(
        (p) => !p.client_id && access.selection.program_ids.includes(p.id),
      );
      if (
        isProgramGroupPending(access, resource?.client_id ?? null) ||
        (resource && isProgramRestricted(access, resource.id)) ||
        ((!id || isStandard) && selected.length >= access.limits.own_programs)
      ) {
        setAccessRestricted(true);
        setError(
          'Превышен бесплатный лимит. Откройте раздел «Премиум» для выбора доступных программ.',
        );
        return;
      }
    }
    if (containsProfanity(draft.name)) {
      setError('Недопустимое название программы');
      return;
    }
    setError(null);
    const body = {
      body: serializeDraft(draft),
      programId: isStandard ? undefined : id,
      expectedUpdatedAt: isStandard ? undefined : (loadedVersion.current ?? undefined),
    };
    if (isOffline) {
      // The mutation is paused (outbox) and its onSuccess won't fire until replay,
      // so the spinner would look stuck. The list is updated optimistically, so
      // navigate away now and tell the user it will sync. Crucially, DON'T attach
      // an onSuccess navigation callback here: this observer stays mounted, so on
      // reconnect-replay it would fire again and yank the user back to the catalog
      // from wherever they'd since navigated. Navigate imperatively instead.
      save.mutate(body);
      try {
        await persistOfflineState(queryClient);
      } catch {
        setError('Не удалось сохранить программу на устройстве. Повторите попытку.');
        return;
      }
      void presentToast({
        message: 'Программа сохранится при подключении к сети',
        duration: 2500,
      });
      history.push(paths.programs);
      return;
    }
    save.mutate(body, {
      onSuccess: () => history.push(paths.programs),
      onError: (failure) => {
        setAccessRestricted(
          [
            'program_limit',
            'program_size',
            'program_read_only',
            'client_read_only',
            'free_selection_required',
          ].includes(errorReason(failure) ?? ''),
        );
        const detail = trainingError(failure, body.body);
        setError(detail.message);
        setFieldErrors(detail.fields);
      },
    });
  };

  // Back to the program detail when editing, otherwise to the catalog.
  const backHref = id ? program(id) : paths.programs;

  return (
    // Figma 916:2586: градиентный фон, прозрачная шапка, центрированный H2.
    <Page background="gradient">
      <PageHeader transparent>
        <Toolbar>
          <ToolbarActions slot="start">
            <HistoryBack defaultHref={backHref} text="" />
          </ToolbarActions>
          <PageTitle className="text-content">{id ? 'Редактировать' : 'Новая программа'}</PageTitle>
        </Toolbar>
      </PageHeader>
      <PageContent className="page-padding">
        {id && existing.isError ? (
          <p className="text-danger">Не удалось загрузить программу</p>
        ) : (
          <>
            {error && accessRestricted && (
              <PremiumNotice title="Ограничение программы" description={error} />
            )}
            <ProgramBuilder
              onSave={onSave}
              isSaving={save.isPending || (Boolean(id) && (existing.isFetching || !existing.data))}
              error={error}
              fieldErrors={fieldErrors}
              isCopy={isStandard}
            />
          </>
        )}
      </PageContent>
    </Page>
  );
}
