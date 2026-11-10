import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import { offlineLabel } from '@/shared/lib/network/offlineLabel';
import { useNetworkStatus } from '@/shared/lib/network/useNetworkStatus';
import { Button } from '@/shared/ui/Button';
import { Input } from '@/shared/ui/Input';

import { trainerSchema, type TrainerValues } from '../lib/schemas';
import { ErrorMessage } from '../ui/ErrorMessage';

interface TrainerStepProps {
  isPending: boolean;
  error?: string;
  onFinish: (values: TrainerValues) => void;
}

/** Screen 6 (trainer only): clients per month, then finish onboarding. */
export function TrainerStep({ isPending, error, onFinish }: TrainerStepProps) {
  const { isOnline } = useNetworkStatus();

  const form = useForm<TrainerValues>({
    resolver: zodResolver(trainerSchema),
    defaultValues: { clients_per_month: '' },
  });

  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      onSubmit={form.handleSubmit((values) => onFinish(values))}
    >
      <h2 className="text-display text-center text-content">
        Укажите среднее кол-во ваших клиентов в месяц
      </h2>
      <Input
        label="Клиентов в месяц"
        type="number"
        min={0}
        placeholder="Например, 15"
        error={form.formState.errors.clients_per_month?.message}
        {...form.register('clients_per_month')}
      />
      <ErrorMessage message={error} />
      <Button type="submit" disabled={!isOnline || isPending} loading={isPending}>
        {offlineLabel(isOnline, 'Завершить')}
      </Button>
    </form>
  );
}
