import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { X, Cpu } from "lucide-react";
import type { ModelInfo } from "@/bindings";
import { useModelStore } from "../stores/modelStore";
import ModelCard, { type ModelCardStatus } from "./onboarding/ModelCard";

interface NoModelModalProps {
  onClose: () => void;
  onOpenModelSettings: () => void;
}

export const NoModelModal: React.FC<NoModelModalProps> = ({
  onClose,
  onOpenModelSettings,
}) => {
  const { t } = useTranslation();
  const {
    models,
    downloadModel,
    selectModel,
    downloadingModels,
    verifyingModels,
    extractingModels,
    downloadProgress,
    downloadStats,
  } = useModelStore();
  const [activeId, setActiveId] = useState<string | null>(null);

  // 下载+校验+解压完成 → 选中并关闭（用户已经有可用模型了）。
  useEffect(() => {
    if (!activeId) return;
    const m = models.find((x) => x.id === activeId);
    const busy =
      activeId in downloadingModels ||
      activeId in verifyingModels ||
      activeId in extractingModels;
    if (m?.is_downloaded && !busy) {
      selectModel(activeId).then(() => {
        setActiveId(null);
        onClose();
      });
    }
  }, [
    activeId,
    models,
    downloadingModels,
    verifyingModels,
    extractingModels,
    selectModel,
    onClose,
  ]);

  const handleDownload = async (id: string) => {
    setActiveId(id);
    const ok = await downloadModel(id);
    if (!ok) {
      setActiveId(null);
      toast.error(t("onboarding.errors.downloadModel", { error: "" }));
    }
  };

  const statusOf = (id: string): ModelCardStatus => {
    if (id in extractingModels) return "extracting";
    if (id in verifyingModels) return "verifying";
    if (id in downloadingModels) return "downloading";
    return "downloadable";
  };

  const candidates = models.filter(
    (m: ModelInfo) => !m.is_downloaded && !m.is_custom,
  );
  const recommended = candidates.filter((m: ModelInfo) => m.is_recommended);
  const list = (recommended.length ? recommended : candidates)
    .sort((a, b) => Number(a.size_mb) - Number(b.size_mb))
    .slice(0, 3);
  const busy = activeId !== null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-[min(560px,94vw)] max-h-[88vh] rounded-3xl border border-mid-gray/15 bg-background shadow-2xl overflow-hidden flex flex-col">
        <div className="flex items-start gap-3 px-6 pt-6 pb-3 shrink-0">
          <div className="w-10 h-10 rounded-xl grid place-items-center bg-logo-primary/12 text-logo-primary shrink-0">
            <Cpu className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-text">{t("noModel.title")}</h2>
            <p className="text-sm text-mid-gray mt-1">{t("noModel.subtitle")}</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 grid place-items-center rounded-lg text-mid-gray hover:bg-mid-gray/10 hover:text-text transition cursor-pointer shrink-0"
          >
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-2 flex flex-col gap-3">
          {list.map((m) => (
            <ModelCard
              key={m.id}
              model={m}
              status={statusOf(m.id)}
              disabled={busy}
              onSelect={handleDownload}
              onDownload={handleDownload}
              downloadProgress={downloadProgress[m.id]?.percentage}
              downloadSpeed={downloadStats[m.id]?.speed}
            />
          ))}
        </div>

        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-mid-gray/10 shrink-0">
          <button
            onClick={onOpenModelSettings}
            className="text-sm text-logo-primary hover:underline cursor-pointer"
          >
            {t("noModel.openSettings")}
          </button>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl border border-mid-gray/25 text-text/80 text-sm font-medium hover:bg-mid-gray/10 transition cursor-pointer"
          >
            {t("noModel.close")}
          </button>
        </div>
      </div>
    </div>
  );
};
