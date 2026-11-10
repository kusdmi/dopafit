import { Avatar } from '@/shared/ui/primitives';

interface Props {
  name: string;
  slot?: string;
}

export function ClientAvatar({ name, slot }: Props) {
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  // aria-hidden: the avatar is decorative — consumers always render the client name
  // as adjacent text, so screen readers get the identity from there, not the initial.
  // Layout/size via Tailwind utilities; only the theme-token colors need inline style.
  return (
    <Avatar
      slot={slot}
      aria-hidden="true"
      className="text-h3 flex h-10 w-10 items-center justify-center"
      style={{
        background: 'var(--ion-color-primary)',
        color: 'var(--ion-color-primary-contrast)',
      }}
    >
      {initial}
    </Avatar>
  );
}
