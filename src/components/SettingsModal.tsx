import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  X,
  Cog,
  Cpu,
  Sparkles,
  Palette,
  Info,
  FlaskConical,
  GraduationCap,
} from "lucide-react";
import {
  GeneralSettings,
  ModelsSettings,
  PostProcessingSettings,
  AdvancedSettings,
  AboutSettings,
} from "./settings";
import { AppearanceSettings } from "./settings/AppearanceSettings";

interface SettingsModalProps {
  onClose: () => void;
}

type SectionId =
  | "general"
  | "models"
  | "postprocess"
  | "appearance"
  | "about"
  | "advanced";

interface SectionDef {
  id: SectionId;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  component: React.ComponentType;
}

// label 存的是 i18n key，渲染时 t() 翻译。
const SECTIONS: SectionDef[] = [
  { id: "general", label: "nav.general", icon: Cog, component: GeneralSettings },
  { id: "models", label: "nav.models", icon: Cpu, component: ModelsSettings },
  {
    id: "postprocess",
    label: "nav.postprocess",
    icon: Sparkles,
    component: PostProcessingSettings,
  },
  {
    id: "appearance",
    label: "nav.appearance",
    icon: Palette,
    component: AppearanceSettings,
  },
  { id: "about", label: "nav.about", icon: Info, component: AboutSettings },
];

const ADVANCED: SectionDef = {
  id: "advanced",
  label: "nav.advanced",
  icon: FlaskConical,
  component: AdvancedSettings,
};

export const SettingsModal: React.FC<SettingsModalProps> = ({ onClose }) => {
  const { t } = useTranslation();
  const [active, setActive] = useState<SectionId>("general");
  const ActiveComponent =
    [...SECTIONS, ADVANCED].find((s) => s.id === active)?.component ||
    GeneralSettings;

  const navButton = (s: SectionDef) => {
    const Icon = s.icon;
    const isActive = active === s.id;
    return (
      <button
        key={s.id}
        onClick={() => setActive(s.id)}
        className={`flex gap-2.5 items-center px-3 py-2 w-full rounded-lg cursor-pointer transition-colors text-sm font-medium text-left ${
          isActive
            ? "bg-logo-primary text-white"
            : "text-text/70 hover:bg-mid-gray/10"
        }`}
      >
        <Icon size={17} className="shrink-0" />
        <span>{t(s.label)}</span>
      </button>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-background rounded-2xl shadow-2xl border border-mid-gray/15 w-[min(920px,94vw)] h-[min(680px,90vh)] overflow-hidden flex">
        {/* 左侧子导航 */}
        <div className="w-44 shrink-0 border-e border-mid-gray/15 p-3 flex flex-col gap-1 bg-[var(--color-sidebar)]">
          <div className="px-2 pt-1 pb-3 text-lg font-bold text-text">
            {t("nav.title")}
          </div>
          {SECTIONS.map(navButton)}
          <div className="mt-auto pt-2 border-t border-mid-gray/10 flex flex-col gap-1">
            <button
              onClick={() => {
                onClose();
                window.dispatchEvent(new Event("open-onboarding"));
              }}
              className="flex gap-2.5 items-center px-3 py-2 w-full rounded-lg cursor-pointer transition-colors text-sm font-medium text-left text-text/70 hover:bg-mid-gray/10"
            >
              <GraduationCap size={17} className="shrink-0" />
              <span>{t("nav.tutorial")}</span>
            </button>
            {navButton(ADVANCED)}
          </div>
        </div>

        {/* 内容区 */}
        <div className="flex-1 overflow-y-auto relative">
          <button
            onClick={onClose}
            title={t("nav.close")}
            className="absolute top-4 right-4 z-10 p-1.5 rounded-lg text-text/50 hover:bg-mid-gray/10 hover:text-text cursor-pointer"
          >
            <X size={20} />
          </button>
          <div className="p-6">
            <ActiveComponent />
          </div>
        </div>
      </div>
    </div>
  );
};
