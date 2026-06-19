import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Cpu, MemoryStick, Zap, MonitorCog, Check } from "lucide-react";
import {
  detectHardware,
  formatRam,
  formatVram,
  type HardwareInfo,
} from "../hardware";

interface HardwareScanStepProps {
  hardware: HardwareInfo | null;
  onDetected: (info: HardwareInfo) => void;
  onNext: () => void;
  onBack: () => void;
}

const SCAN_MIN_MS = 1700;
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

const tierColor: Record<HardwareInfo["tier"], string> = {
  high: "text-emerald-400 border-emerald-400/40 bg-emerald-400/10",
  balanced: "text-logo-primary border-logo-primary/40 bg-logo-primary/10",
  basic: "text-amber-400 border-amber-400/40 bg-amber-400/10",
};

export const HardwareScanStep: React.FC<HardwareScanStepProps> = ({
  hardware,
  onDetected,
  onNext,
  onBack,
}) => {
  const { t } = useTranslation();
  const [scanning, setScanning] = useState(hardware === null);
  const [info, setInfo] = useState<HardwareInfo | null>(hardware);

  useEffect(() => {
    if (hardware) return; // 已检测过（返回上一步再进来）
    let cancelled = false;
    (async () => {
      const [result] = await Promise.all([detectHardware(), delay(SCAN_MIN_MS)]);
      if (cancelled) return;
      setInfo(result);
      setScanning(false);
      onDetected(result);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ram = info ? formatRam(info) : null;
  const gpu = info && info.gpus.length > 0 ? info.gpus[0] : null;

  return (
    <div className="mm-step flex flex-col items-center text-center px-8 py-9 min-h-[460px] justify-center">
      {scanning ? (
        <div className="flex flex-col items-center">
          <div className="mm-radar relative w-40 h-40 grid place-items-center">
            <span className="mm-radar-ring" />
            <MonitorCog className="w-12 h-12 text-logo-primary/80" strokeWidth={1.4} />
          </div>
          <h2 className="text-xl font-bold text-text mt-7">
            {t("wizard.hardware.scanningTitle")}
          </h2>
          <p className="text-mid-gray text-sm mt-2">
            {t("wizard.hardware.scanningHint")}
          </p>
          <div className="flex gap-1.5 mt-5">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="w-2 h-2 rounded-full bg-logo-primary mm-float"
                style={{ animationDelay: `${i * 0.2}s`, animationDuration: "1.2s" }}
              />
            ))}
          </div>
        </div>
      ) : info ? (
        <div className="w-full max-w-lg flex flex-col items-center">
          <h2 className="text-2xl font-bold text-text mm-rise">
            {t("wizard.hardware.doneTitle")}
          </h2>
          <div
            className={`mm-rise mt-3 inline-flex items-center gap-2 px-4 py-1.5 rounded-full border text-sm font-semibold ${tierColor[info.tier]}`}
            style={{ animationDelay: "0.05s" }}
          >
            <Zap className="w-4 h-4" />
            {t("wizard.hardware.tierBadge", {
              tier: t(`wizard.tier.${info.tier}`),
            })}
          </div>
          <p
            className="mm-rise text-mid-gray text-sm mt-2"
            style={{ animationDelay: "0.1s" }}
          >
            {t(`wizard.tierBlurb.${info.tier}`)}
          </p>

          <div className="grid grid-cols-3 gap-3 mt-7 w-full">
            <SpecCard
              icon={<Cpu className="w-5 h-5" />}
              label={t("wizard.hardware.spec.cpu")}
              value={
                info.cpuCores
                  ? t("wizard.hardware.spec.cpuCores", { count: info.cpuCores })
                  : "—"
              }
              delay={0.15}
            />
            <SpecCard
              icon={<MemoryStick className="w-5 h-5" />}
              label={t("wizard.hardware.spec.ram")}
              value={ram ?? "—"}
              delay={0.25}
            />
            <SpecCard
              icon={<MonitorCog className="w-5 h-5" />}
              label={t("wizard.hardware.spec.gpu")}
              value={
                gpu
                  ? formatVram(gpu.vramMb)
                  : info.hasGpu
                    ? t("wizard.hardware.spec.gpuDetected")
                    : t("wizard.hardware.spec.gpuIntegrated")
              }
              sub={gpu ? gpu.name : undefined}
              delay={0.35}
            />
          </div>

          <div
            className="mm-rise flex items-center gap-2 text-xs text-emerald-400 mt-5"
            style={{ animationDelay: "0.45s" }}
          >
            <Check className="w-4 h-4" />
            {t("wizard.hardware.recommendedReady")}
          </div>

          <div className="flex items-center gap-3 mt-8">
            <button
              onClick={onBack}
              className="px-5 py-2.5 rounded-xl border border-mid-gray/25 text-text/80 font-medium hover:bg-mid-gray/10 transition-colors cursor-pointer"
            >
              {t("wizard.back")}
            </button>
            <button
              onClick={onNext}
              className="px-8 py-2.5 rounded-xl bg-logo-primary text-white font-semibold shadow-lg shadow-logo-primary/30 hover:brightness-110 transition-all cursor-pointer"
            >
              {t("wizard.next")}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
};

const SpecCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  delay: number;
}> = ({ icon, label, value, sub, delay }) => (
  <div
    className="mm-rise rounded-2xl border border-mid-gray/15 bg-background/70 p-4 flex flex-col items-center gap-1.5 backdrop-blur-sm"
    style={{ animationDelay: `${delay}s` }}
  >
    <div className="w-9 h-9 rounded-lg grid place-items-center bg-logo-primary/12 text-logo-primary">
      {icon}
    </div>
    <div className="text-[11px] text-mid-gray">{label}</div>
    <div className="text-sm font-semibold text-text">{value}</div>
    {sub && (
      <div className="text-[10px] text-mid-gray/70 line-clamp-1 max-w-full" title={sub}>
        {sub}
      </div>
    )}
  </div>
);

export default HardwareScanStep;
