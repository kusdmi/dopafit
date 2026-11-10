import { errorReason, errorText } from '@/shared/api/error-reasons';
import { useToast } from '@/shared/ui/primitives';
import { useState } from 'react';

import { useCreateExercise } from '@/entities/exercise/api/use-create-exercise';
import {
  useAddExerciseMediaLink,
  useUploadExerciseMedia,
} from '@/entities/exercise/api/use-exercise-media';
import { Modal } from '@/shared/ui/Modal';

import { ExerciseForm } from './ExerciseForm';
import type { ExerciseFormValues } from './schema';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: (id: string) => void;
}

// Orchestrates create-then-attach: creates the exercise, then attaches a picked
// file / link using the returned id, and surfaces the limit 409 as a toast
// (the limit itself is never shown otherwise).
export function CreateExerciseModal({ isOpen, onClose, onCreated }: Props) {
  const create = useCreateExercise();
  const upload = useUploadExerciseMedia();
  const addLink = useAddExerciseMediaLink();
  const [present] = useToast();
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingLink, setPendingLink] = useState<string | null>(null);

  // The Modal/Dialog hides its children instead of unmounting them, so the
  // pending media and the form's field values would otherwise persist between
  // openings (e.g. re-using a previous file/link for a brand-new exercise via
  // the program-builder picker). Reset everything only on the closed→open
  // transition: clear the pending media and bump `formKey` so ExerciseForm
  // remounts back to its defaults. Adjusting state during render (React's "you
  // might not need an effect" pattern) instead of a useEffect avoids a cascading
  // re-render and the set-state-in-effect lint rule.
  const [wasOpen, setWasOpen] = useState(isOpen);
  const [formKey, setFormKey] = useState(0);
  if (isOpen && !wasOpen) {
    setWasOpen(true);
    setPendingFile(null);
    setPendingLink(null);
    setFormKey((k) => k + 1);
  } else if (!isOpen && wasOpen) {
    setWasOpen(false);
  }

  const save = async (values: ExerciseFormValues) => {
    // 1) Create the exercise. Only its own failure (limit 409 / generic) means
    //    nothing was created — surface it and abort.
    let created;
    try {
      created = await create.mutateAsync({
        ...values,
        steps: [],
        alt_names: [],
      });
    } catch (err) {
      // Разбор `details.reason` переехал в общий словарь shared/api/error-reasons:
      // мест перевода стало больше одного, и текст лимита незачем держать в двух
      // копиях. Позиция тоста у лимита была своя (bottom) — сохраняем её, поэтому
      // признак ещё и проверяется отдельно.
      const limited = errorReason(err) === 'custom_exercise_limit';
      await present({
        message: errorText(err, 'Не удалось сохранить упражнение'),
        duration: 2500,
        ...(limited ? { position: 'bottom' as const } : {}),
      });
      return;
    }

    // 2) The exercise is created and valid. Attaching media is best-effort:
    //    a failure (e.g. a non-whitelisted video link → 422) must not roll the
    //    creation back nor show a generic "save failed" toast.
    let fileFailed = false;
    let linkFailed = false;
    if (pendingFile) {
      try {
        const kind = pendingFile.type === 'image/gif' ? 'gif' : 'image';
        await upload.mutateAsync({ exerciseId: created.id, kind, file: pendingFile });
      } catch {
        fileFailed = true;
      }
    }
    if (pendingLink) {
      try {
        await addLink.mutateAsync({
          exerciseId: created.id,
          body: { kind: 'iframe', url: pendingLink, position: 0 },
        });
      } catch {
        linkFailed = true;
      }
    }

    // 3) Creation succeeded → always report it and close.
    onCreated?.(created.id);
    onClose();

    if (fileFailed && linkFailed) {
      await present({ message: 'Упражнение создано, но медиа не добавлено', duration: 2500 });
    } else if (linkFailed) {
      await present({
        message: 'Упражнение создано, но ссылка на видео не добавлена (недопустимый адрес)',
        duration: 2500,
      });
    } else if (fileFailed) {
      await present({ message: 'Упражнение создано, но фото не загружено', duration: 2500 });
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Новое упражнение">
      <ExerciseForm
        key={formKey}
        saving={create.isPending || upload.isPending || addLink.isPending}
        onSave={save}
        onPickFile={setPendingFile}
        onAddLink={setPendingLink}
      />
    </Modal>
  );
}
