import { useState } from 'react';
import { Link } from 'react-router-dom';
import { paths } from '@/shared/config/paths';
import { Modal } from './Modal';
import { Icon } from './primitives';
import { lockClosedOutline } from './icons';

interface Props {
  title: string;
  description: string;
  compact?: boolean;
  badgeOnly?: boolean;
}

export function PremiumNotice({ title, description, compact = false, badgeOnly = false }: Props) {
  const [open, setOpen] = useState(false);
  const badge = (
    <span className="inline-flex items-center gap-1 rounded-lg border border-trainer-text bg-card-light px-2 py-1 text-caption font-bold text-trainer-text">
      <Icon icon={lockClosedOutline} aria-hidden="true" className="text-[14px]" />
      Premium
    </span>
  );
  const details = (
    <div className="flex flex-col items-start gap-3 text-body-s text-content">
      {badge}
      <p>{description}</p>
      <Link
        to={paths.settingsSubscription}
        className="inline-flex min-h-[44px] items-center font-bold text-brand-text underline"
        onClick={() => setOpen(false)}
      >
        Подробнее о Premium
      </Link>
    </div>
  );
  if (!compact)
    return (
      <aside aria-label={title} className="rounded-[14px] border border-line bg-card p-3">
        {details}
      </aside>
    );
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`${title} · Premium`}
        className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[14px] px-2 text-body-s text-content focus-visible:ring-2 focus-visible:ring-brand-400"
      >
        {!badgeOnly && <span>{title}</span>}
        {badge}
      </button>
      <Modal isOpen={open} onClose={() => setOpen(false)} title={title} variant="popup">
        {details}
      </Modal>
    </>
  );
}
