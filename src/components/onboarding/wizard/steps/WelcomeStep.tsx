import React from "react";
import { useTranslation } from "react-i18next";
import { Mic, Globe, Lock, Sparkles } from "lucide-react";

interface WelcomeStepProps {
  onNext: () => void;
  onSkipAll: () => void;
}

// title/desc 存的是 i18n key，渲染时 t() 翻译。
const FEATURES = [
  {
    icon: Globe,
    title: "wizard.welcome.features.anyApp.title",
    desc: "wizard.welcome.features.anyApp.desc",
  },
  {
    icon: Lock,
    title: "wizard.welcome.features.offline.title",
    desc: "wizard.welcome.features.offline.desc",
  },
  {
    icon: Sparkles,
    title: "wizard.welcome.features.aiCleanup.title",
    desc: "wizard.welcome.features.aiCleanup.desc",
  },
];

export const WelcomeStep: React.FC<WelcomeStepProps> = ({
  onNext,
  onSkipAll,
}) => {
  const { t } = useTranslation();
  return (
    <div className="mm-step flex flex-col items-center text-center px-8 py-10">
      {/* 麦克风光环 */}
      <div className="relative mb-7 mt-2">
        <span className="mm-ping absolute inset-0 rounded-full border border-logo-primary/40" />
        <span
          className="mm-ping absolute inset-0 rounded-full border border-logo-primary/40"
          style={{ animationDelay: "0.6s" }}
        />
        <div className="relative w-24 h-24 rounded-full grid place-items-center bg-gradient-to-br from-logo-primary to-logo-primary/60 shadow-xl shadow-logo-primary/30">
          <Mic className="w-11 h-11 text-white" strokeWidth={1.6} />
        </div>
      </div>

      <h1 className="text-3xl font-bold mm-shimmer-text leading-tight">
        {t("wizard.welcome.title")}
      </h1>
      <p className="text-text/70 mt-3 max-w-md leading-relaxed">
        {t("wizard.welcome.subtitle")
          .split("\n")
          .map((line, i, arr) => (
            <React.Fragment key={i}>
              {line}
              {i < arr.length - 1 && <br />}
            </React.Fragment>
          ))}
      </p>

      <div className="grid grid-cols-3 gap-3 mt-8 w-full max-w-lg">
        {FEATURES.map((f, i) => {
          const Icon = f.icon;
          return (
            <div
              key={f.title}
              className="mm-rise rounded-2xl border border-mid-gray/15 bg-background/70 p-4 flex flex-col items-center gap-2 backdrop-blur-sm"
              style={{ animationDelay: `${0.15 + i * 0.1}s` }}
            >
              <div className="w-10 h-10 rounded-xl grid place-items-center bg-logo-primary/12 text-logo-primary">
                <Icon className="w-5 h-5" />
              </div>
              <div className="text-sm font-semibold text-text">
                {t(f.title)}
              </div>
              <div className="text-[11px] text-mid-gray leading-snug">
                {t(f.desc)}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-col items-center gap-3 mt-9">
        <button
          onClick={onNext}
          className="px-8 py-3 rounded-xl bg-logo-primary text-white font-semibold shadow-lg shadow-logo-primary/30 hover:brightness-110 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer"
        >
          {t("wizard.welcome.start")}
        </button>
        <button
          onClick={onSkipAll}
          className="text-sm text-mid-gray hover:text-text transition-colors cursor-pointer"
        >
          {t("wizard.skip")}
        </button>
      </div>
    </div>
  );
};

export default WelcomeStep;
