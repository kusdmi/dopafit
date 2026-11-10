import { useToast } from '@/shared/ui/primitives';
import { useState } from 'react';

import { useCreateLinkRequest } from '@/entities/link-request/api/use-link-request-mutations';
import { toApiError } from '@/shared/api/client';
import { errorText } from '@/shared/api/error-reasons';
import { useNetworkStatus } from '@/shared/lib/network/useNetworkStatus';
import { Button } from '@/shared/ui/Button';
import { Input } from '@/shared/ui/Input';

interface Props {
  /** Плейсхолдер поля из макета (1084:4059 «email / телефон»,
   *  1101:3515 «Введите email или телефон»). Подпись поля остаётся видимой:
   *  фасад Input строит из неё и доступное имя (BaseInput ariaLabel), поэтому
   *  прятать её ради макета значило бы форкать общий FieldShell. */
  placeholder?: string;
  submitLabel?: string;
}

export function SendRequestForm({ placeholder, submitLabel = 'Отправить запрос' }: Props = {}) {
  const [query, setQuery] = useState('');
  const { isOffline } = useNetworkStatus();
  const create = useCreateLinkRequest();
  const [present] = useToast();

  const submit = async () => {
    if (!query.trim()) return;
    try {
      await create.mutateAsync({ query: query.trim() });
      setQuery('');
      void present({ message: 'Запрос отправлен', duration: 2000 });
    } catch (e) {
      // Unknown reasons use the localized fallback for the error code.
      void present({ message: errorText(e, toApiError(e).message), duration: 2500 });
    }
  };

  return (
    <div className="flex flex-col gap-[15px]">
      <Input
        label="Телефон или email"
        placeholder={placeholder}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <Button onClick={submit} disabled={!query.trim() || isOffline} loading={create.isPending}>
        {isOffline ? 'Недоступно офлайн' : submitLabel}
      </Button>
    </div>
  );
}
