import { ArrowLeft, Plus } from 'lucide-react';
import type { ReactNode } from 'react';

export function SettingsHeader({
  title,
  onBack,
  onAction,
  actionLabel = 'Добавить',
  actionIcon
}: {
  title: string;
  onBack: () => void;
  onAction?: () => void;
  actionLabel?: string;
  actionIcon?: ReactNode;
}) {
  return (
    <header className="settings-header">
      <button className="icon-button" type="button" onClick={onBack} aria-label="Назад">
        <ArrowLeft />
      </button>
      <h1>{title}</h1>
      {onAction ? (
        <button className="icon-button" type="button" onClick={onAction} aria-label={actionLabel}>
          {actionIcon ?? <Plus />}
        </button>
      ) : (
        <span />
      )}
    </header>
  );
}
