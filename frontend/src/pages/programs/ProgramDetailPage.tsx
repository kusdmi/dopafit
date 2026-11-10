import { useState } from 'react';
import {
  HistoryBack,
  ToolbarActions,
  PageContent,
  PageHeader,
  Icon,
  Page,
  PageTitle,
  Toolbar,
} from '@/shared/ui/primitives';
import {  useParams  } from 'react-router-dom';
import { useNavigation } from '@/shared/lib/navigation';

import { useDeleteProgram } from '@/entities/program/api/use-delete-program';
import { useProgram } from '@/entities/program/api/use-program';
import { useSessionStore } from '@/entities/session/model/store';
import { ExerciseRow } from '@/pages/programs/ui/ExerciseRow';
import { paths, programEdit, programShare, programStart } from '@/shared/config/paths';
import { useNetworkStatus } from '@/shared/lib/network/useNetworkStatus';
import { Button } from '@/shared/ui/Button';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { chevronDown } from '@/shared/ui/icons';
import { Skeleton } from '@/shared/ui/Skeleton';

export function ProgramDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const history = useNavigation();
  const program = useProgram(id);
  const role = useSessionStore((s) => s.user?.role);
  const del = useDeleteProgram();
  const { isOffline } = useNetworkStatus();
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Дни в макете (932:1951) сворачиваются шевроном. Храним только свёрнутые —
  // так новый день из ответа API по умолчанию раскрыт, как в макете.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const p = program.data;

  return (
    // Figma 932:1941: экран на основном градиенте, шапка прозрачная —
    // шеврон «назад» и заголовок лежат прямо на градиенте.
    <Page background="gradient">
      <PageHeader transparent>
        <Toolbar>
          <ToolbarActions slot="start">
            <HistoryBack defaultHref={paths.programs} text="" />
          </ToolbarActions>
          <PageTitle className="text-content">Программа тренировки</PageTitle>
        </Toolbar>
      </PageHeader>
      <PageContent className="page-padding">
        {program.isLoading ? (
          <Skeleton variant="card" />
        ) : program.isError ? (
          <p className="text-danger">Не удалось загрузить программу</p>
        ) : !p ? (
          <p className="text-muted">Программа не найдена</p>
        ) : (
          // 24px между днями — разные разделы; внутри дня список идёт плотнее.
          <div className="flex flex-col gap-6">
            {/* 932:1948 — название программы под шапкой, а не в шапке: в шапке
                макет держит постоянный заголовок «Программа тренировки», и это
                подтверждают узлы 932:1941 и 932:2189.

                Роль — УРОВЕНЬ 1 (H1 22px, влево), а не H2 по центру. Макет
                рисует здесь строку 18px в рамке, но рамка снята предыдущей
                правкой (пустой контур во всю ширину читался полем ввода), и
                голая строка 18px по центру оставляла иерархию перевёрнутой:
                название программы (18px) выходило МЕЛЬЧЕ названий дней внутри
                неё (stat-s 20px), то есть вложенное крупнее родительского.

                Уровень 1 — это ровно тот случай из design-system.md: «заголовок
                владеет всей шириной». Название программы и есть предмет экрана,
                поэтому 22px ставят его выше дней (20px), а выключка влево
                совпадает с днями, карточками и кнопками под ним — центрированной
                на экране остаётся только постоянная строка в шапке, и три
                заголовка подряд перестают читаться одним уровнем. */}
            <h2 className="m-0 break-words text-h1 text-content">{p.name}</h2>
            {p.source_author_name && (
              <p className="m-0 text-body-s text-muted">
                Автор: <span className="text-content">{p.source_author_name}</span>
              </p>
            )}

            {p.days.map((day) => {
              const isCollapsed = !!collapsed[day.id];
              return (
                // 10px между упражнениями дня — это однородный список, его
                // сканируют, а не читают разделами.
                <section key={day.id} className="flex flex-col gap-[10px]">
                  {/* Отступ ТОЛЬКО по вертикали: горизонтальный сдвинул бы текст
                      переключателя правее названия программы и карточек
                      упражнений, выбив его из общей левой линии столбца.
                      Тап-цель держит `min-h-[44px]` (a11y): сам по себе текст
                      16px даёт бокс 38px. */}
                  <button
                    type="button"
                    aria-expanded={!isCollapsed}
                    onClick={() => setCollapsed((c) => ({ ...c, [day.id]: !c[day.id] }))}
                    className="flex min-h-[44px] max-w-full items-center gap-[5px] self-start py-[10px] text-left"
                  >
                    {/* Название дня — ПЕРЕКЛЮЧАТЕЛЬ секции, а не второй заголовок
                        экрана. От названия программы (H1 22px Bold) его разводит
                        не размер, а роль: H3 (16px SemiBold) и приглушённый цвет —
                        одинаковый вес и цвет при разнице в 2px читались бы двумя
                        заголовками подряд. `min-w-0` + `truncate` на строке
                        держат длинное имя дня в одну строку, иконка при этом не
                        уезжает (shrink-0). */}
                    <span className="min-w-0 truncate text-h3 text-muted">{day.name}</span>
                    <Icon
                      icon={chevronDown}
                      className={`shrink-0 text-muted transition-transform ${
                        isCollapsed ? '' : 'rotate-180'
                      }`}
                      style={{ fontSize: 18 }}
                    />
                  </button>
                  {!isCollapsed &&
                    day.slots.map((slot) => <ExerciseRow key={slot.id} exercises={slot.exercises} />)}
                </section>
              );
            })}

            {/* Стопка действий внизу: вторичные кнопки на фиолетовой
                обводке серии 4 (#C96EFF в макете), главная — заливка акцентом. */}
            <div className="flex flex-col gap-[10px] pt-2">
              <Button
                variant="outline"
                className="border-chart-4-text text-content"
                onClick={() => history.push(programEdit(id))}
              >
                Изменить тренировку
              </Button>
              {role === 'trainer' && !p.is_standard && (
                <Button
                  variant="outline"
                  className="border-chart-4-text text-content"
                  onClick={() => history.push(programShare(id))}
                >
                  Поделиться программой с клиентом
                </Button>
              )}
              <Button variant="primary" onClick={() => history.push(programStart(id))}>
                Начать тренировку
              </Button>
              {!p.is_standard && (
                <>
                  <Button
                    variant="outline"
                    className="border-danger text-danger"
                    disabled={isOffline || del.isPending}
                    onClick={() => setConfirmDelete(true)}
                  >
                    Удалить программу
                  </Button>
                  {isOffline && (
                    <p className="text-center text-caption text-muted">
                      Удаление доступно только онлайн
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </PageContent>

      <ConfirmDialog
        isOpen={confirmDelete}
        title="Удалить программу?"
        message="Программа и все её дни будут удалены без возможности восстановить."
        confirmLabel="Удалить"
        destructive
        pending={del.isPending}
        onConfirm={() => {
          setConfirmDelete(false);
          del.mutate(id, { onSuccess: () => history.replace(paths.programs) });
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </Page>
  );
}
