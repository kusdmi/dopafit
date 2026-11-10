import { usePushRegistration } from '@/entities/notification/api/use-push-registration';

/** Render-less: регистрирует пуш-токен внутри QueryClientProvider (хук использует useQuery). */
export function PushRegistration() {
  usePushRegistration();
  return null;
}
