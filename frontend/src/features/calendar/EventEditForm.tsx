import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';

import { useUpdateEvent } from '@/entities/calendar/api/use-calendar-mutations';
import { eventBookingSchema } from '@/entities/calendar/model/schema';
import { useClients } from '@/entities/client/api/use-clients';
import type { components } from '@/shared/api/schema';

import { BookingFields } from './BookingFields';
import { ClientPicker } from './ClientPicker';
import { BookingFormActions } from './BookingFormActions';
import { ProgramPicker } from './ProgramPicker';

type EventOut = components['schemas']['EventOut'];
type Role = 'trainer' | 'client';
const eventEditSchema = eventBookingSchema.extend({
  date: z.string().min(1, 'Укажите дату').date('Некорректная дата'),
});
type EventEditValues = z.infer<typeof eventEditSchema>;

interface Props {
  event: EventOut;
  role: Role;
  onClose: () => void;
  onSubmitted: () => void;
}

// Edits an existing event: prefill the booking fields from the event, then PUT
// via useUpdateEvent (invalidation + reminder reschedule live in the mutation).
// Mirrors the create forms (TrainerBookingForm / ClientBookingForm) so the shape
// of the form stays consistent; only the trainer sees the client selector.
export function EventEditForm({ event, role, onClose, onSubmitted }: Props) {
  const updateEvent = useUpdateEvent();
  const clients = useClients();
  const isTrainer = role === 'trainer';
  const activeClients = isTrainer
    ? (clients.data?.items ?? []).filter((c) => c.status === 'active')
    : [];

  const { register, handleSubmit, control, setValue, formState } = useForm<EventEditValues>({
    resolver: zodResolver(eventEditSchema),
    defaultValues: {
      date: event.date,
      time: event.time.slice(0, 5),
      program_id: event.program_id ?? '',
      client_ids: event.clients.map((c) => c.client_id),
    },
  });
  const date = useWatch({ control, name: 'date' });
  const selected = useWatch({ control, name: 'client_ids' }) ?? [];

  const toggleClient = (id: string) => {
    const next = selected.includes(id)
      ? selected.filter((cid) => cid !== id)
      : [...selected, id];
    setValue('client_ids', next, { shouldValidate: false });
  };

  const submit = handleSubmit((values) => {
    updateEvent.mutate(
      {
        id: event.id,
        // Clients cannot reassign participants; only the trainer sends client_ids.
        body: isTrainer
          ? { date: values.date, time: values.time, program_id: values.program_id || null, client_ids: values.client_ids }
          : { date: values.date, time: values.time, program_id: values.program_id || null },
      },
      { onSuccess: onSubmitted },
    );
  });

  return (
    <form onSubmit={submit} className="space-y-4">
      <BookingFields
        date={date}
        dateError={formState.errors.date?.message}
        dateField={register('date')}
        timeError={formState.errors.time?.message}
        timeField={register('time')}
      />

      <ProgramPicker field={register('program_id')} />

      {isTrainer && activeClients.length > 0 && (
        <ClientPicker clients={activeClients} selected={selected} onToggle={toggleClient} />
      )}

      <BookingFormActions
        loading={updateEvent.isPending}
        onCancel={onClose}
        submitLabel="Сохранить"
      />
    </form>
  );
}
