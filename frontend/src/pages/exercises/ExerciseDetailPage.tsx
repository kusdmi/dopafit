import { useState } from 'react';

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
import {  useParams  } from 'react-router-dom';
import { useNavigation } from '@/shared/lib/navigation';

import { useDeleteExercise } from '@/entities/exercise/api/use-delete-exercise';
import { useDeleteExerciseMedia } from '@/entities/exercise/api/use-exercise-media';
import { useExercise } from '@/entities/exercise/api/use-exercise';
import { useUpdateExercise } from '@/entities/exercise/api/use-update-exercise';
import { ExerciseMedia } from '@/entities/exercise/ui/ExerciseMedia';
import { ExerciseForm } from '@/features/program-editor/exercise-form/ExerciseForm';
import type { ExerciseFormValues } from '@/features/program-editor/exercise-form/schema';
import { FavoriteToggle } from '@/features/exercise-catalog/FavoriteToggle';
import { AddToProgramModal } from '@/features/add-to-program/AddToProgramModal';
import { paths } from '@/shared/config/paths';
import { Button } from '@/shared/ui/Button';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { Modal } from '@/shared/ui/Modal';
import { Skeleton } from '@/shared/ui/Skeleton';

import { DifficultyMeter } from './ui/DifficultyMeter';
import { ExerciseBody } from './ui/ExerciseBody';

export function ExerciseDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const history = useNavigation();
  const exercise = useExercise(id);
  const updateExercise = useUpdateExercise();
  const deleteExercise = useDeleteExercise();
  const deleteMedia = useDeleteExerciseMedia();
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [presentToast] = useToast();

  const ex = exercise.data;
  const isOwn = ex?.ownership === 'own';

  const onSaveEdit = async (values: ExerciseFormValues) => {
    if (!ex) return;
    try {
      await updateExercise.mutateAsync({ id: ex.id, body: values });
      setEditing(false);
    } catch {
      void presentToast({ message: 'Не удалось сохранить упражнение', duration: 2500 });
    }
  };

  const onDelete = async () => {
    if (!ex) return;
    try {
      await deleteExercise.mutateAsync(ex.id);
      setConfirmDelete(false);
      history.goBack();
    } catch {
      void presentToast({ message: 'Не удалось удалить упражнение', duration: 2500 });
    }
  };

  return (
    <Page background="gradient">
      <PageHeader transparent>
        <Toolbar>
          <ToolbarActions slot="start">
            <HistoryBack defaultHref={paths.exercises} text="" />
          </ToolbarActions>
          <PageTitle>Упражнение</PageTitle>
          {ex && (
            <ToolbarActions slot="end">
              <FavoriteToggle id={ex.id} isFavorite={ex.is_favorite} />
            </ToolbarActions>
          )}
        </Toolbar>
      </PageHeader>
      <PageContent className="page-padding">
        {exercise.isLoading ? (
          <Skeleton variant="card" />
        ) : exercise.isError ? (
          <p className="text-body-m text-danger">Не удалось загрузить упражнение</p>
        ) : !ex ? (
          <p className="text-body-m text-muted">Упражнение не найдено</p>
        ) : (
          <div className="mx-auto flex max-w-md flex-col gap-[25px]">
            <ExerciseMedia media={ex.media} imageUrl={ex.image_url} />

            {isOwn && ex.media.length > 0 && (
              <div className="flex flex-col gap-1">
                {ex.media.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() =>
                      deleteMedia.mutate(
                        { exerciseId: ex.id, mediaId: m.id },
                        {
                          onError: () =>
                            void presentToast({
                              message: 'Не удалось удалить медиа',
                              duration: 2500,
                            }),
                        },
                      )
                    }
                    disabled={deleteMedia.isPending}
                    className="self-start text-caption text-danger disabled:opacity-50"
                  >
                    Удалить медиа
                  </button>
                ))}
              </div>
            )}

            <div className="flex flex-col gap-[15px]">
              <div className="flex flex-wrap items-center gap-[10px]">
                <h2 className="text-stat-s text-content">{ex.name}</h2>
                {ex.ownership === 'shared' && (
                  <span className="rounded-full bg-card-light px-2 py-0.5 text-tag text-muted">
                    От тренера
                  </span>
                )}
              </div>

              {isOwn && (
                <div className="flex gap-4">
                  <button
                    type="button"
                    onClick={() => setEditing(true)}
                    className="text-body-s text-brand-text"
                  >
                    Редактировать
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    disabled={deleteExercise.isPending}
                    className="text-body-s text-danger disabled:opacity-50"
                  >
                    Удалить
                  </button>
                </div>
              )}

              {ex.alt_names.length > 0 && (
                <div className="flex flex-col gap-[5px]">
                  <p className="text-body-m text-content">Так же известно как:</p>
                  <div className="flex flex-wrap gap-[10px]">
                    {/* Тег облегает свой текст. `flex-1` делил между тегами
                        всю ширину строки, поэтому два синонима растягивались в
                        половину экрана каждый и читались кнопками, а не
                        тегами. Радиус-пилюля и более плотный отступ довершают
                        форму. */}
                    {ex.alt_names.map((n) => (
                      <span
                        key={n}
                        className="rounded-full bg-card px-[12px] py-[6px] text-label text-content"
                      >
                        {n}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-[10px]">
                <span className="shrink-0 text-body-m text-content">Уровень сложности</span>
                <span className="flex-1">
                  <DifficultyMeter difficulty={ex.difficulty} />
                </span>
              </div>
            </div>

            <ExerciseBody exercise={ex} />

            <Button onClick={() => setAddOpen(true)}>Добавить в тренировку</Button>

            {addOpen && (
              <AddToProgramModal
                exerciseId={ex.id}
                exerciseName={ex.name}
                onClose={() => setAddOpen(false)}
              />
            )}

            {isOwn && (
              <Modal
                isOpen={editing}
                onClose={() => setEditing(false)}
                title="Редактировать упражнение"
              >
                <ExerciseForm
                  saving={updateExercise.isPending}
                  initial={{
                    name: ex.name,
                    category_id: ex.category_id,
                    difficulty: ex.difficulty,
                    description: ex.description,
                  }}
                  onSave={onSaveEdit}
                />
              </Modal>
            )}

            {isOwn && (
              <ConfirmDialog
                isOpen={confirmDelete}
                title="Удалить упражнение?"
                message="Это действие необратимо."
                confirmLabel="Удалить"
                destructive
                pending={deleteExercise.isPending}
                onConfirm={() => void onDelete()}
                onCancel={() => setConfirmDelete(false)}
              />
            )}
          </div>
        )}
      </PageContent>
    </Page>
  );
}
