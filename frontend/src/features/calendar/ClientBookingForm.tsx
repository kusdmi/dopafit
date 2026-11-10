import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import { useCreateEvent } from '@/entities/calendar/api/use-calendar-mutations';
import { eventBookingSchema, type EventBookingValues } from '@/entities/calendar/model/schema';

import { BookingFields } from './BookingFields';
import { BookingFormActions } from './BookingFormActions';
import { ProgramPicker } from './ProgramPicker';

interface Props {
  date: string;
  onClose: () => void;
  onSubmitted: () => void;
}

export function ClientBookingForm({ date, onClose, onSubmitted }: Props) {
  const createEvent = useCreateEvent();

  const { register, handleSubmit, formState } = useForm<EventBookingValues>({
    resolver: zodResolver(eventBookingSchema),
    defaultValues: { time: '', program_id: '', client_ids: [] },
  });

  const submit = handleSubmit((values) => {
    createEvent.mutate(
      { date, time: values.time, program_id: values.program_id || null, client_ids: [] },
      { onSuccess: onSubmitted },
    );
  });

  return (
    <form onSubmit={submit} className="space-y-4">
      <BookingFields date={date} timeError={formState.errors.time?.message} timeField={register('time')} />
      <ProgramPicker field={register('program_id')} />
      <BookingFormActions loading={createEvent.isPending} onCancel={onClose} />
    </form>
  );
}
