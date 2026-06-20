import React from "react";
import { useTranslation } from "react-i18next";
import {
  Home,
  History,
  BookOpen,
  Activity,
  Hand,
  Settings,
  HelpCircle,
} from "lucide-react";
import murmurLogo from "../assets/murmur-logo.png";
import { useGestureStore } from "@/stores/gestureStore";

export type AppPage = "home" | "history" | "dictionary" | "usage" | "gesture";

interface PageDef {
  id: AppPage;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

// label 存的是 i18n key，渲染时 t() 翻译。
export const PAGES: PageDef[] = [
  { id: "home", label: "sidebarNav.home", icon: Home },
  { id: "gesture", label: "sidebarNav.gesture", icon: Hand },
  { id: "usage", label: "sidebarNav.usage", icon: Activity },
  { id: "history", label: "sidebarNav.history", icon: History },
  { id: "dictionary", label: "sidebarNav.dictionary", icon: BookOpen },
];

interface SidebarProps {
  active: AppPage;
  onChange: (page: AppPage) => void;
  onOpenSettings: (section?: "general" | "about") => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  active,
  onChange,
  onOpenSettings,
}) => {
  const { t } = useTranslation();
  // 手势模式标签仅在实验性功能解锁后出现。
  const gestureUnlocked = useGestureStore((s) => s.unlocked);
  const visiblePages = PAGES.filter(
    (p) => p.id !== "gesture" || gestureUnlocked,
  );
  return (
    <div className="flex flex-col w-44 h-full border-e border-mid-gray/15 px-3 py-4 bg-[var(--color-sidebar)]">
      <div className="px-2 mb-5 flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-xl bg-[#1b1c21] flex items-center justify-center shrink-0 shadow-sm">
          <img src={murmurLogo} alt="Murmur" className="w-7 h-7 object-contain" />
        </div>
        <span className="mm-wordmark text-2xl">Murmur</span>
      </div>

      <div className="flex flex-col gap-1">
        {visiblePages.map((page) => {
          const Icon = page.icon;
          const isActive = active === page.id;
          return (
            <button
              key={page.id}
              onClick={() => onChange(page.id)}
              className={`flex gap-2.5 items-center px-3 py-2 w-full rounded-lg cursor-pointer transition-colors text-sm font-medium ${
                isActive
                  ? "bg-logo-primary text-white"
                  : "text-text/70 hover:bg-mid-gray/10"
              }`}
            >
              <Icon size={18} className="shrink-0" />
              <span>{t(page.label)}</span>
            </button>
          );
        })}
      </div>

      {/* Bottom icon row — settings gear lives here (Typeless style), not in main nav */}
      <div className="mt-auto flex items-center gap-1 px-1 pt-3">
        <button
          onClick={() => onOpenSettings("general")}
          title={t("sidebarNav.settings")}
          className="p-2 rounded-lg text-text/60 hover:bg-mid-gray/10 hover:text-text transition-colors cursor-pointer"
        >
          <Settings size={18} />
        </button>
        <button
          title={t("sidebarNav.about")}
          className="p-2 rounded-lg text-text/60 hover:bg-mid-gray/10 hover:text-text transition-colors cursor-pointer"
          onClick={() => onOpenSettings("about")}
        >
          <HelpCircle size={18} />
        </button>
      </div>
    </div>
  );
};
