import { ContactsSettingsPage } from '../contacts/ContactsSettingsPage';
import { SecuritySettingsPage } from '../security/SecuritySettingsPage';
import { useState } from 'react';

import { useMe, useUpdateMe } from '@/entities/user/api/use-me';
import { offlineLabel } from '@/shared/lib/network/offlineLabel';
import { useNetworkStatus } from '@/shared/lib/network/useNetworkStatus';
import { Button } from '@/shared/ui/Button';
import { Input } from '@/shared/ui/Input';
import { Select } from '@/shared/ui/Select';
import { Skeleton } from '@/shared/ui/Skeleton';
import { Textarea } from '@/shared/ui/Textarea';

import { ErrorText, SettingsShell, StatusText } from '../ui/SettingsShell';

export function ProfileSettingsPage() {
  const { data: me } = useMe();
  const updateMe = useUpdateMe();
  const { isOnline } = useNetworkStatus();
  const [saved, setSaved] = useState('');

  return (
    <SettingsShell title="Личные данные">
      {!me ? (
        <Skeleton variant="form" count={2} />
      ) : (
        <form
          className="flex flex-col gap-[15px]"
          onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            const gender = String(formData.get('gender') ?? '');
            updateMe.mutate(
              {
                first_name: String(formData.get('first_name') ?? ''),
                last_name: String(formData.get('last_name') ?? '') || null,
                middle_name: String(formData.get('middle_name') ?? '') || null,
                gender: gender ? (gender as 'female' | 'male') : null,
                birth_date: String(formData.get('birth_date') ?? '') || null,
                city: String(formData.get('city') ?? '') || null,
                injuries: String(formData.get('injuries') ?? '') || null,
              },
              { onSuccess: () => setSaved('Профиль сохранён') },
            );
          }}
        >
          <Input label="Имя" name="first_name" required defaultValue={me.profile.first_name} />
          <Input label="Фамилия" name="last_name" defaultValue={me.profile.last_name ?? ''} />
          <Input label="Отчество" name="middle_name" defaultValue={me.profile.middle_name ?? ''} />
          <Select label="Пол" name="gender" defaultValue={me.profile.gender ?? ''}>
            <option value="">Не указан</option>
            <option value="female">Женский</option>
            <option value="male">Мужской</option>
          </Select>
          <Input
            label="Дата рождения"
            name="birth_date"
            type="date"
            defaultValue={me.profile.birth_date ?? ''}
          />
          <Input label="Город" name="city" defaultValue={me.profile.city ?? ''} />
          <Textarea
            label="Травмы и ограничения"
            name="injuries"
            rows={4}
            defaultValue={me.profile.injuries ?? ''}
          />
          <ErrorText error={updateMe.error} />
          <StatusText message={saved} />
          <Button
            type="submit"
            disabled={!isOnline || updateMe.isPending}
            loading={updateMe.isPending}
          >
            {offlineLabel(isOnline, 'Сохранить профиль')}
          </Button>
        </form>
      )}
      <div id="contacts">
        <ContactsSettingsPage embedded />
      </div>
      <div id="security">
        <SecuritySettingsPage embedded />
      </div>
    </SettingsShell>
  );
}
