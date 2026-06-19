import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { X, Mic } from "lucide-react";
import "./onboarding.css";
import type { HardwareInfo } from "./hardware";
import WelcomeStep from "./steps/WelcomeStep";
import HardwareScanStep from "./steps/HardwareScanStep";
import ModelStep from "./steps/ModelStep";
import LlmStep from "./steps/LlmStep";
import TutorialStep from "./steps/TutorialStep";

export type WizardMode = "full" | "tutorial";

interface OnboardingWizardProps {
  mode?: WizardMode;
  onClose: () => void;
}

const FULL_STEPS = ["welcome", "hardware", "model", "llm", "tutorial"] as const;

export const OnboardingWizard: React.FC<OnboardingWizardProps> = ({
  mode = "full",
  onClose,
}) => {
  const { t } = useTranslation();
  const isTutorialOnly = mode === "tutorial";
  const steps = isTutorialOnly ? (["tutorial"] as const) : FULL_STEPS;
  const [index, setIndex] = useState(0);
  const [hardware, setHardware] = useState<HardwareInfo | null>(null);

  const current = steps[index];
  const goNext = () => setIndex((i) => Math.min(i + 1, steps.length - 1));
  const goBack = () => setIndex((i) => Math.max(i - 1, 0));

  // Esc 关闭（等于跳过）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const renderStep = () => {
    switch (current) {
      case "welcome":
        return <WelcomeStep onNext={goNext} onSkipAll={onClose} />;
      case "hardware":
        return (
          <HardwareScanStep
            hardware={hardware}
            onDetected={setHardware}
            onNext={goNext}
            onBack={goBack}
          />
        );
      case "model":
        return (
          <ModelStep
            hardware={hardware}
            onNext={goNext}
            onBack={goBack}
            onSkip={goNext}
          />
        );
      case "llm":
        return <LlmStep hardware={hardware} onNext={goNext} onBack={goBack} />;
      case "tutorial":
        return (
          <TutorialStep
            onFinish={onClose}
            onBack={isTutorialOnly ? undefined : goBack}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div
        className="mm-overlay absolute inset-0 bg-black/50"
        aria-hidden="true"
      />
      <div className="mm-card relative w-[min(560px,94vw)] max-h-[92vh] rounded-3xl border border-mid-gray/15 bg-background shadow-2xl overflow-hidden flex flex-col">
        {/* 动态背景 */}
        <div className="mm-aurora" />

        {/* 顶部：品牌 + 进度 + 关闭 */}
        <div className="relative flex items-center justify-between px-6 pt-5 pb-3 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg grid place-items-center bg-logo-primary text-white">
              <Mic className="w-4 h-4" />
            </div>
            <span className="font-bold text-text tracking-tight">Murmur</span>
          </div>

          {!isTutorialOnly && (
            <div className="flex items-center gap-1.5">
              {steps.map((s, i) => (
                <span
                  key={s}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    i === index
                      ? "w-6 bg-logo-primary"
                      : i < index
                        ? "w-1.5 bg-logo-primary/50"
                        : "w-1.5 bg-mid-gray/25"
                  }`}
                />
              ))}
            </div>
          )}

          <button
            onClick={onClose}
            title={isTutorialOnly ? t("wizard.close") : t("wizard.skip")}
            className="w-8 h-8 grid place-items-center rounded-lg text-mid-gray hover:bg-mid-gray/10 hover:text-text transition-colors cursor-pointer"
          >
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        {/* 步骤内容 */}
        <div className="relative flex-1 overflow-y-auto" key={current}>
          {renderStep()}
        </div>
      </div>
    </div>
  );
};

export default OnboardingWizard;
