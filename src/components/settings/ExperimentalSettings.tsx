import React from "react";
import { useTranslation } from "react-i18next";
import { Hand, Mic, ChevronRight, Loader2, Check, Camera } from "lucide-react";
import { useGestureStore, gestureActions } from "@/stores/gestureStore";
import { getModelBuffer } from "@/lib/gesture/model";

export const ExperimentalSettings: React.FC = () => {
  const { t } = useTranslation();
  const unlocked = useGestureStore((s) => s.unlocked);
  const modelStatus = useGestureStore((s) => s.modelStatus);
  const modelProgress = useGestureStore((s) => s.modelProgress);
  const modelError = useGestureStore((s) => s.modelError);
  const setUnlocked = useGestureStore((s) => s.setUnlocked);
  const setEnabled = useGestureStore((s) => s.setEnabled);

  const downloading = modelStatus === "downloading";

  const handleToggle = async () => {
    if (downloading) return;
    if (unlocked) {
      setUnlocked(false);
      setEnabled(false);
      gestureActions.setModel("absent");
      return;
    }
    gestureActions.setModel("downloading", 0, null);
    try {
      await getModelBuffer((pct) =>
        gestureActions.setModel("downloading", pct, null),
      );
      gestureActions.setModel("ready", 100, null);
      setUnlocked(true);
      setEnabled(true);
    } catch (e) {
      gestureActions.setModel(
        "error",
        0,
        e instanceof Error ? e.message : String(e),
      );
    }
  };

  const steps = [
    { icon: <Hand className="w-4 h-4" />, k: "step1" },
    { icon: <Mic className="w-4 h-4" />, k: "step2" },
    { icon: <Hand className="w-4 h-4" />, k: "step3" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-text tracking-tight">
          {t("experimental.title")}
        </h2>
        <p className="text-sm text-mid-gray mt-1.5 leading-relaxed">
          {t("experimental.intro")}
        </p>
      </div>

      <div className="rounded-2xl border border-mid-gray/15 bg-background/40 p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3.5 min-w-0">
            <div className="w-11 h-11 rounded-2xl grid place-items-center bg-gradient-to-br from-logo-primary/18 to-logo-primary/[0.03] text-logo-primary border border-logo-primary/12 shrink-0">
              <Hand className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2.5">
                <h3 className="text-base font-semibold text-text">
                  {t("experimental.gesture.title")}
                </h3>
                <span className="text-[10px] uppercase tracking-[0.18em] text-mid-gray/55 font-medium">
                  {t("experimental.badge")}
                </span>
              </div>
              <p className="text-sm text-mid-gray mt-1.5 leading-relaxed">
                {t("experimental.gesture.desc")}
              </p>
            </div>
          </div>

          <button
            onClick={handleToggle}
            disabled={downloading}
            role="switch"
            aria-checked={unlocked}
            className={`relative w-[52px] h-7 rounded-full transition-colors shrink-0 mt-0.5 cursor-pointer disabled:opacity-50 ${
              unlocked ? "bg-logo-primary" : "bg-mid-gray/25"
            }`}
          >
            <span
              className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow-md transition-all ${
                unlocked ? "left-[26px]" : "left-1"
              }`}
            />
          </button>
        </div>

        {/* 流程：举手开始 → 说话 → 再举手停止 */}
        <div className="mt-5 flex items-center gap-1 text-mid-gray">
          {steps.map((s, i) => (
            <React.Fragment key={s.k}>
              <div className="flex items-center gap-2 px-1">
                <span className="text-text/50">{s.icon}</span>
                <span className="text-xs">
                  {t(`experimental.gesture.${s.k}`)}
                </span>
              </div>
              {i < steps.length - 1 && (
                <ChevronRight className="w-3.5 h-3.5 text-mid-gray/35 shrink-0" />
              )}
            </React.Fragment>
          ))}
        </div>

        {/* 状态 */}
        <div className="mt-5 pt-4 border-t border-mid-gray/10">
          {downloading ? (
            <div>
              <div className="flex items-center justify-between text-xs text-mid-gray mb-2">
                <span className="inline-flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  {t("experimental.downloading")}
                </span>
                <span className="tabular-nums">{modelProgress}%</span>
              </div>
              <div className="w-full h-1 bg-mid-gray/15 rounded-full overflow-hidden">
                <div
                  className="h-full bg-logo-primary rounded-full transition-all duration-200"
                  style={{ width: `${Math.max(2, modelProgress)}%` }}
                />
              </div>
            </div>
          ) : unlocked ? (
            <div className="inline-flex items-center gap-1.5 text-xs text-text/60">
              <Check className="w-3.5 h-3.5 text-logo-primary" />
              {t("experimental.ready")}
            </div>
          ) : modelStatus === "error" ? (
            <div className="text-xs text-red-500/90">
              {t("experimental.error", { error: modelError ?? "" })}
            </div>
          ) : (
            <div className="inline-flex items-center gap-1.5 text-xs text-mid-gray/70">
              <Camera className="w-3.5 h-3.5" />
              {t("experimental.requirements")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ExperimentalSettings;
