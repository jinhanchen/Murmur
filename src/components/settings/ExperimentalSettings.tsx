import React from "react";
import { useTranslation } from "react-i18next";
import { Hand, Loader2, Check, Mic, ArrowDown, Camera } from "lucide-react";
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
      // 关闭：停掉检测、隐藏标签（模型缓存保留，重开秒进）。
      setUnlocked(false);
      setEnabled(false);
      gestureActions.setModel("absent");
      return;
    }
    // 开启：下载模型 = 完成设置。
    gestureActions.setModel("downloading", 0, null);
    try {
      await getModelBuffer((pct) =>
        gestureActions.setModel("downloading", pct, null),
      );
      gestureActions.setModel("ready", 100, null);
      setUnlocked(true);
      setEnabled(true); // 解锁后默认开着
    } catch (e) {
      gestureActions.setModel(
        "error",
        0,
        e instanceof Error ? e.message : String(e),
      );
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-text">
          {t("experimental.title")}
        </h2>
        <p className="text-sm text-mid-gray mt-1">{t("experimental.intro")}</p>
      </div>

      <div className="rounded-2xl border border-mid-gray/15 bg-background overflow-hidden">
        <div className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-11 h-11 rounded-xl grid place-items-center bg-logo-primary/12 text-logo-primary shrink-0">
                <Hand className="w-6 h-6" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-text">
                    {t("experimental.gesture.title")}
                  </h3>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-400/15 text-amber-500 font-semibold">
                    {t("experimental.badge")}
                  </span>
                </div>
                <p className="text-sm text-mid-gray mt-1 leading-relaxed">
                  {t("experimental.gesture.desc")}
                </p>
              </div>
            </div>

            {/* 主开关 */}
            <button
              onClick={handleToggle}
              disabled={downloading}
              role="switch"
              aria-checked={unlocked}
              className={`relative w-14 h-8 rounded-full transition-colors shrink-0 cursor-pointer disabled:opacity-60 ${
                unlocked ? "bg-logo-primary" : "bg-mid-gray/30"
              }`}
            >
              <span
                className={`absolute top-1 w-6 h-6 rounded-full bg-white shadow transition-all ${
                  unlocked ? "left-7" : "left-1"
                }`}
              />
            </button>
          </div>

          {/* 三步说明 */}
          <div className="mt-4 grid grid-cols-3 gap-2">
            {[
              { icon: <Hand className="w-4 h-4" />, k: "step1" },
              { icon: <Mic className="w-4 h-4" />, k: "step2" },
              { icon: <ArrowDown className="w-4 h-4" />, k: "step3" },
            ].map((s) => (
              <div
                key={s.k}
                className="rounded-xl bg-mid-gray/5 border border-mid-gray/10 p-3 text-center"
              >
                <div className="w-8 h-8 rounded-lg grid place-items-center bg-background text-logo-primary mx-auto mb-1.5">
                  {s.icon}
                </div>
                <div className="text-[11px] text-mid-gray leading-snug">
                  {t(`experimental.gesture.${s.k}`)}
                </div>
              </div>
            ))}
          </div>

          {/* 状态行 */}
          <div className="mt-4">
            {downloading && (
              <div>
                <div className="flex items-center justify-between text-xs text-mid-gray mb-1.5">
                  <span className="inline-flex items-center gap-1.5">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    {t("experimental.downloading")}
                  </span>
                  <span className="tabular-nums">{modelProgress}%</span>
                </div>
                <div className="w-full h-1.5 bg-mid-gray/20 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-logo-primary rounded-full transition-all duration-200"
                    style={{ width: `${Math.max(3, modelProgress)}%` }}
                  />
                </div>
              </div>
            )}
            {!downloading && unlocked && (
              <div className="inline-flex items-center gap-1.5 text-xs text-emerald-500 font-medium">
                <Check className="w-4 h-4" />
                {t("experimental.ready")}
              </div>
            )}
            {!downloading && modelStatus === "error" && (
              <div className="text-xs text-red-500">
                {t("experimental.error", { error: modelError ?? "" })}
              </div>
            )}
            {!downloading && !unlocked && modelStatus !== "error" && (
              <div className="inline-flex items-center gap-1.5 text-xs text-mid-gray">
                <Camera className="w-3.5 h-3.5" />
                {t("experimental.requirements")}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExperimentalSettings;
