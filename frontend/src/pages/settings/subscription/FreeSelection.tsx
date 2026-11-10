import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, toApiError } from '@/shared/api/client';
import type { components } from '@/shared/api/schema';
import { Button } from '@/shared/ui/Button';

type Access = components['schemas']['EntitlementsOut'];
export function FreeSelection({ access, online }: { access: Access; online: boolean }) {
  const qc = useQueryClient();
  const [programs, setPrograms] = useState<string[]>([]);
  const [clients, setClients] = useState<string[]>([]);
  const [reduced, setReduced] = useState<string[]>([]);
  const confirm = useMutation({
    mutationFn: async () => {
      const copies: components['schemas']['ProgramOut'][] = [];
      for (const id of reduced) {
        const { data, error } = await api.GET('/api/v1/programs/{program_id}', {
          params: { path: { program_id: id } },
        });
        if (error || !data) throw toApiError(error);
        copies.push(data);
      }
      const { error } = await api.POST('/api/v1/subscriptions/free-selection', {
        body: {
          cycle: access.selection.cycle,
          program_ids: programs,
          client_ids: clients,
          copies: copies.map((p) => ({
            source_id: p.id,
            program: {
              name: `${p.name} — сокращённая копия`,
              kind: p.kind,
              days: p.days
                .slice(0, 3)
                .map((d, i) => ({
                  name: d.name,
                  position: i,
                  slots: d.slots
                    .slice(0, 5)
                    .map((s, j) => ({
                      position: j,
                      exercises: s.exercises
                        .slice(0, 3)
                        .map((e, k) => ({
                          exercise_id: e.exercise_id,
                          custom_name: e.exercise_id ? null : e.name,
                          sets: e.sets,
                          reps: e.reps,
                          variant_order: k,
                        })),
                    })),
                })),
            },
          })),
        },
      });
      if (error) throw toApiError(error);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['subscription'] });
      void qc.invalidateQueries({ queryKey: ['programs'] });
    },
  });
  const toggle = (ids: string[], id: string) =>
    ids.includes(id) ? ids.filter((v) => v !== id) : [...ids, id];
  return (
    <section className="flex flex-col gap-3 rounded-[14px] border border-line p-4">
      <h2 className="text-h2 text-content">Выберите ресурсы бесплатного тарифа</h2>
      <p className="text-body-s text-muted">
        До одной собственной программы, десяти клиентов и одной программы на клиента. Выбор для
        этого окончания подписки подтверждается один раз. Остальные данные сохранятся для просмотра.
      </p>
      {access.clients.map((c) => (
        <label key={c.id} className="flex items-center gap-3 text-content">
          <input
            type="checkbox"
            checked={clients.includes(c.id)}
            onChange={() => setClients(toggle(clients, c.id))}
          />
          {c.name}
        </label>
      ))}
      {access.programs.map((p) => (
        <label key={p.id} className="flex items-center gap-3 text-content">
          <input
            type="checkbox"
            checked={programs.includes(p.id) || reduced.includes(p.id)}
            disabled={!!p.client_id && !clients.includes(p.client_id)}
            onChange={() =>
              p.compatible ? setPrograms(toggle(programs, p.id)) : setReduced(toggle(reduced, p.id))
            }
          />
          {p.name}
          {!p.compatible && ' (создать сокращённую копию: 3 дня, 5 упражнений, 2 альтернативы)'}
        </label>
      ))}
      {confirm.isError && (
        <p role="alert" className="text-danger">
          Не удалось подтвердить. Проверьте количество выбранных программ и клиентов.
        </p>
      )}
      <Button disabled={!online || confirm.isPending} onClick={() => confirm.mutate()}>
        Подтвердить выбор
      </Button>
    </section>
  );
}
