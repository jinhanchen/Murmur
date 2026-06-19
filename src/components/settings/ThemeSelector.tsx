import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Sun, Moon, Monitor } from "lucide-react";
import { getTheme, applyTheme, type Theme } from "../../lib/theme";

// label 存的是 i18n key，渲染时 t() 翻译。
const OPTIONS: { value: Theme; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { value: "light", label: "appearance.theme.light", icon: Sun },
  { value: "dark", label: "appearance.theme.dark", icon: Moon },
  { value: "system", label: "appearance.theme.system", icon: Monitor },
];

export const ThemeSelector: React.FC = () => {
  const { t } = useTranslation();
  const [theme, setTheme] = useState<Theme>(getTheme());

  const pick = (t: Theme) => {
    setTheme(t);
    applyTheme(t);
  };

  return (
    <div className="flex gap-2">
      {OPTIONS.map((o) => {
        const Icon = o.icon;
        const active = theme === o.value;
        return (
          <button
            key={o.value}
            onClick={() => pick(o.value)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm border transition-colors cursor-pointer ${
              active
                ? "border-logo-primary bg-logo-primary/10 text-text"
                : "border-mid-gray/20 text-mid-gray hover:text-text hover:border-mid-gray/40"
            }`}
          >
            <Icon size={16} />
            <span>{t(o.label)}</span>
          </button>
        );
      })}
    </div>
  );
};
