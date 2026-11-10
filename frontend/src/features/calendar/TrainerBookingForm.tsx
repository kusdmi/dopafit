import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';

import { useCreateEvent } from '@/entities/calendar/api/use-calendar-mutations';
import { eventBookingSchema, type EventBookingValues } from '@/entities/calendar/model/schema';
import { useClients } from '@/entities/client/api/use-clients';

import { BookingFields } from './BookingFields';
import { ClientPicker } from './ClientPicker';
import { ProgramPicker } from './ProgramPicker';
import { BookingFormActions } from './BookingFormActions';

interface Props {
  date: string;
  onClose: () => void;
  onSubmitted: () => void;
}

export function TrainerBookingForm({ date, onClose, onSubmitted }: Props) {
  const createEvent = useCreateEvent();
  const clients = useClients();
  const activeClients = (clients.data?.items ?? []).filter((c) => c.status === 'active');

  const { register, handleSubmit, control, setValue, formState } = useForm<EventBookingValues>({
    resolver: zodResolver(eventBookingSchema),
    defaultValues: { time: '', program_id: '', client_ids: [] },
  });
  const selected = useWatch({ control, name: 'client_ids' }) ?? [];

  const toggleClient = (id: string) => {
    const next = selected.includes(id)
      ? selected.filter((cid) => cid !== id)
      : [...selected, id];
    setValue('client_ids', next, { shouldValidate: false });
  };

  const submit = handleSubmit((values) => {
    createEvent.mutate(
      { date, time: values.time, program_id: values.program_id || null, client_ids: values.client_ids },
      { onSuccess: onSubmitted },
    );
  });

  return (
    <form onSubmit={submit} className="space-y-4">
      <BookingFields date={date} timeError={formState.errors.time?.message} timeField={register('time')} />

      <ProgramPicker field={register('program_id')} />

      {activeClients.length > 0 && (
        <ClientPicker clients={activeClients} selected={selected} onToggle={toggleClient} />
      )}

      <BookingFormActions loading={createEvent.isPending} onCancel={onClose} clientTone />
    </form>
  );
}
