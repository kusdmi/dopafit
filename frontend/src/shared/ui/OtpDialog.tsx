import { Dialog } from '@/shared/ui/primitives';
import type { CSSProperties } from 'react';

import { Button } from '@/shared/ui/Button';
import { OtpInput } from '@/shared/ui/OtpInput';

interface OtpDialogProps {
  isOpen: boolean;
  title: string;
  /** Address the code went to; renders the "Код отправлен на …" hint. */
  contact: string | null;
  error?: string;
  pending?: boolean;
  onComplete: (code: string) => void;
  onResend?: () => unknown;
  resendCooldownSeconds?: number;
  onCancel: () => void;
}

export function OtpDialog({
  isOpen,
  title,
  contact,
  error,
  pending = false,
  onComplete,
  onResend,
  resendCooldownSeconds,
  onCancel,
}: OtpDialogProps) {
  return (
    <Dialog
      isOpen={isOpen}
      onClose={onCancel}
      // Floating card, so it takes the safe-area inset itself: the backdrop no
      // longer applies one (that would shrink the box the full-screen Modal
      // sizes against and stop it reaching the screen edges).
      className="dialog--floating"
      style={
        {
          '--width': '90%',
          '--max-width': '360px',
          '--height': 'auto',
          '--border-radius': '16px',
        } as CSSProperties
      }
    >
      {/* Symmetric `p-5`: the home-indicator inset is applied once, by
          `.dialog--floating` above. Adding it to the bottom padding here
          counted it twice. */}
      <div className="flex flex-col gap-4 bg-card p-5 text-content">
        <div>
          <h2 className="text-h3">{title}</h2>
          {contact ? (
            <p className="text-body-m mt-1 text-muted">Код отправлен на {contact}</p>
          ) : null}
        </div>
        <OtpInput
          onComplete={onComplete}
          error={error}
          disabled={pending}
          onResend={onResend}
          resendCooldownSeconds={resendCooldownSeconds}
        />
        <Button type="button" variant="outline" onClick={onCancel}>
          Отмена
        </Button>
      </div>
    </Dialog>
  );
}
