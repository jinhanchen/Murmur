import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, Cpu, Check } from "lucide-react";
import { useModelStore } from "@/stores/modelStore";
import type { ModelInfo } from "@/bindings";

export const ModelQuickSwitch: React.FC = () => {
  const { t } = useTranslation();
  const { models, currentModel, selectModel } = useModelStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const downloaded = models.filter(
    (m: ModelInfo) => m.is_downloaded || m.is_custom,
  );
  const current = models.find((m: ModelInfo) => m.id === currentModel);

  const handlePick = async (id: string) => {
    setOpen(false);
    if (id !== currentModel) await selectModel(id);
  };

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-3 py-2 rounded-xl border border-mid-gray/15 bg-background text-sm text-text hover:border-mid-gray/30 transition-colors cursor-pointer shadow-sm"
        title={t("modelSwitch.title")}
      >
        <Cpu size={15} className="text-logo-primary" />
        <span className="font-medium max-w-[150px] truncate">
          {current?.name || t("modelSwitch.selectModel")}
        </span>
        <ChevronDown
          size={14}
          className={`text-mid-gray transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-1.5 w-60 bg-background border border-mid-gray/15 rounded-xl shadow-lg z-30 overflow-hidden py-1">
          <div className="px-3 py-1.5 text-xs text-mid-gray">
            {t("modelSwitch.downloaded")}
          </div>
          {downloaded.length === 0 && (
            <div className="px-3 py-2 text-sm text-mid-gray">
              {t("modelSwitch.noneDownloaded")}
            </div>
          )}
          {downloaded.map((m: ModelInfo) => (
            <button
              key={m.id}
              onClick={() => handlePick(m.id)}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-left hover:bg-mid-gray/10 transition-colors cursor-pointer"
            >
              <span className="truncate">{m.name}</span>
              {m.id === currentModel && (
                <Check size={15} className="text-logo-primary shrink-0" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
