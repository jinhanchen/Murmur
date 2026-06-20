import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ChevronDown, Check, Sparkles } from "lucide-react";
import type { ModelInfo } from "@/bindings";
import { useModelStore } from "../../../../stores/modelStore";
import { useSettings } from "../../../../hooks/useSettings";
import { getTranslatedModelName } from "../../../../lib/utils/modelTranslation";
import ModelCard, { type ModelCardStatus } from "../../ModelCard";
import {
  recommendModel,
  resolveUserLang,
  isLangAppropriate,
  type HardwareInfo,
} from "../hardware";

interface ModelStepProps {
  hardware: HardwareInfo | null;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}

export const ModelStep: React.FC<ModelStepProps> = ({
  hardware,
  onNext,
  onBack,
  onSkip,
}) => {
  const { t } = useTranslation();
  const { getSetting } = useSettings();
  const {
    models,
    currentModel,
    downloadModel,
    selectModel,
    downloadingModels,
    verifyingModels,
    extractingModels,
    downloadProgress,
    downloadStats,
  } = useModelStore();

  const [activeId, setActiveId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const tier = hardware?.tier ?? "balanced";

  const userLang = useMemo(
    () =>
      resolveUserLang({
        selectedLanguage: getSetting("selected_language"),
        appLanguage: getSetting("app_language"),
      }),
    [getSetting],
  );

  const rec = useMemo(
    () =>
      recommendModel(models, tier, {
        currentModelId: currentModel,
        userLang,
      }),
    [models, tier, currentModel, userLang],
  );

  const currentInfo = useMemo(
    () => models.find((m) => m.id === currentModel && m.is_downloaded),
    [models, currentModel],
  );
  const anyDownloaded = useMemo(
    () => models.find((m) => m.is_downloaded),
    [models],
  );
  const hasReadyModel = Boolean(anyDownloaded);

  // 待下载的推荐项（仅当推荐不是「当前模型」且尚未下载时展示为主推卡）。
  const downloadRec =
    rec.reason !== "current" && rec.model && !rec.model.is_downloaded
      ? rec.model
      : undefined;

  const isBusy = activeId !== null;

  // 监听所选模型下载/校验/解压完成 → 自动设为当前模型。
  useEffect(() => {
    if (!activeId) return;
    const model = models.find((m) => m.id === activeId);
    const busy =
      activeId in downloadingModels ||
      activeId in verifyingModels ||
      activeId in extractingModels;
    if (model?.is_downloaded && !busy) {
      selectModel(activeId).then((ok) => {
        if (!ok) toast.error(t("wizard.model.selectFailed"));
        setActiveId(null);
      });
    }
  }, [
    activeId,
    models,
    downloadingModels,
    verifyingModels,
    extractingModels,
    selectModel,
  ]);

  const handleDownload = async (modelId: string) => {
    setActiveId(modelId);
    const ok = await downloadModel(modelId);
    if (!ok) setActiveId(null);
  };

  const statusOf = (modelId: string): ModelCardStatus => {
    if (modelId in extractingModels) return "extracting";
    if (modelId in verifyingModels) return "verifying";
    if (modelId in downloadingModels) return "downloading";
    const m = models.find((x) => x.id === modelId);
    if (m?.is_downloaded) return modelId === currentModel ? "active" : "available";
    return "downloadable";
  };

  // 其他模型：排除主推项，语言适配的排前面，再按体积升序。
  const otherModels = useMemo(() => {
    const excludeId = downloadRec?.id ?? rec.model?.id;
    return models
      .filter((m) => !m.is_custom && m.id !== excludeId)
      .sort((a, b) => {
        const la = isLangAppropriate(a, userLang) ? 0 : 1;
        const lb = isLangAppropriate(b, userLang) ? 0 : 1;
        if (la !== lb) return la - lb;
        return Number(a.size_mb) - Number(b.size_mb);
      });
  }, [models, downloadRec, rec.model, userLang]);

  return (
    <div className="mm-step flex flex-col px-8 py-8 min-h-[460px]">
      <div className="text-center mb-5 shrink-0">
        <h2 className="text-2xl font-bold text-text">
          {t("wizard.model.title")}
        </h2>
        <p className="text-mid-gray text-sm mt-1.5">
          {t("wizard.model.subtitle")}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto -mx-2 px-2">
        {hasReadyModel ? (
          /* 已装好模型 → 中性确认即可继续，不假设"正在使用"。
             覆盖两种情况：当前模型已下载，或仅有其他已下载模型。 */
          <div className="mb-4 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3.5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full grid place-items-center bg-emerald-400/15 text-emerald-500 shrink-0">
              <Check className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-text">
                {t("wizard.model.ready", {
                  model: getTranslatedModelName(
                    (currentInfo ?? anyDownloaded) as ModelInfo,
                    t,
                  ),
                })}
              </div>
              <div className="text-xs text-mid-gray mt-0.5">
                {t("wizard.model.readyHint")}
              </div>
            </div>
          </div>
        ) : (
          /* 新用户：还没有任何模型 → 主推一个最贴合配置的待下载模型，
             下载完成后即可继续。这是 onboarding 的主线动作。 */
          downloadRec && (
            <div className="mb-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-logo-primary mb-2">
                <Sparkles className="w-3.5 h-3.5" />
                {t("wizard.model.recommendFor", {
                  tier: t(`wizard.tier.${tier}`),
                })}
                {userLang === "zh" && t("wizard.model.supportsChinese")}
              </div>
              <ModelCard
                model={downloadRec}
                variant="featured"
                status={statusOf(downloadRec.id)}
                disabled={isBusy}
                onSelect={handleDownload}
                onDownload={handleDownload}
                downloadProgress={downloadProgress[downloadRec.id]?.percentage}
                downloadSpeed={downloadStats[downloadRec.id]?.speed}
              />
              <p className="text-[11px] text-mid-gray/70 mt-2 px-0.5 leading-relaxed">
                {t("wizard.model.downloadHint")}
              </p>
            </div>
          )
        )}

        {/* 其他模型 */}
        {otherModels.length > 0 && (
          <div className="mt-3">
            <button
              onClick={() => setShowAll((v) => !v)}
              className="flex items-center gap-1 text-sm text-mid-gray hover:text-text transition-colors cursor-pointer"
            >
              <ChevronDown
                className={`w-4 h-4 transition-transform ${showAll ? "rotate-180" : ""}`}
              />
              {showAll
                ? t("wizard.model.collapseOthers")
                : t("wizard.model.showOthers", { count: otherModels.length })}
            </button>
            {showAll && (
              <div className="flex flex-col gap-3 mt-3">
                {otherModels.map((m) => (
                  <ModelCard
                    key={m.id}
                    model={m}
                    status={statusOf(m.id)}
                    disabled={isBusy}
                    onSelect={handleDownload}
                    onDownload={handleDownload}
                    downloadProgress={downloadProgress[m.id]?.percentage}
                    downloadSpeed={downloadStats[m.id]?.speed}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 mt-5 pt-4 border-t border-mid-gray/10 shrink-0">
        <button
          onClick={onBack}
          className="px-5 py-2.5 rounded-xl border border-mid-gray/25 text-text/80 font-medium hover:bg-mid-gray/10 transition-colors cursor-pointer"
        >
          {t("wizard.back")}
        </button>
        <div className="flex items-center gap-3">
          {!hasReadyModel && (
            <button
              onClick={onSkip}
              className="text-sm text-mid-gray hover:text-text transition-colors cursor-pointer"
            >
              {t("wizard.model.skip")}
            </button>
          )}
          <button
            onClick={onNext}
            disabled={!hasReadyModel}
            className="px-8 py-2.5 rounded-xl bg-logo-primary text-white font-semibold shadow-lg shadow-logo-primary/30 hover:brightness-110 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
          >
            {t("wizard.next")}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ModelStep;
