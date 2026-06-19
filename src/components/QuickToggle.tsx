import React from "react";

interface QuickToggleProps {
  checked: boolean;
  onToggle: (v: boolean) => void;
  updating?: boolean;
  label: string;
  hint: string;
  icon?: React.ReactNode;
}

/**
 * Compact presentational toggle for the home page "快速开关" card.
 * Wiring (read/write of a setting) is the parent's job, so changes flow through
 * the shared settings store and stay in sync with the Settings modal.
 */
export const QuickToggle: React.FC<QuickToggleProps> = ({
  checked,
  onToggle,
  updating = false,
  label,
  hint,
  icon,
}) => {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="flex items-center gap-3 min-w-0">
        {icon && <div className="text-logo-primary shrink-0">{icon}</div>}
        <div className="min-w-0">
          <div className="text-sm font-medium text-text">{label}</div>
          <div className="text-xs text-mid-gray">{hint}</div>
        </div>
      </div>
      <label
        className={`relative inline-flex items-center shrink-0 ${updating ? "cursor-wait opacity-60" : "cursor-pointer"}`}
      >
        <input
          type="checkbox"
          className="sr-only peer"
          checked={checked}
          disabled={updating}
          onChange={(e) => onToggle(e.target.checked)}
        />
        <div className="w-11 h-6 bg-mid-gray/25 rounded-full peer peer-checked:bg-logo-primary after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:shadow after:transition-all peer-checked:after:translate-x-full" />
      </label>
    </div>
  );
};
