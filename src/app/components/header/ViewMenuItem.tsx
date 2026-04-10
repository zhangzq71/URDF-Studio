import { Check } from 'lucide-react';

interface ViewMenuItemProps {
  checked: boolean;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

export function ViewMenuItem({ checked, label, onClick, disabled = false }: ViewMenuItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      role="menuitemcheckbox"
      aria-checked={checked}
      disabled={disabled}
      className="w-full text-left px-3 py-2 text-xs whitespace-nowrap hover:bg-element-bg dark:hover:bg-element-bg transition-colors text-text-primary dark:text-text-secondary flex items-center justify-between group disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
    >
      <div className="flex items-center gap-2">
        <div
          className={`w-4 h-4 flex items-center justify-center rounded border ${
            checked ? 'bg-system-blue border-system-blue text-white' : 'border-border-strong'
          }`}
        >
          {checked && <Check className="w-3 h-3" />}
        </div>
        <span>{label}</span>
      </div>
    </button>
  );
}
