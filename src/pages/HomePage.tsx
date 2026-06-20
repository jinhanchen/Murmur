import React from "react";
import { useTranslation } from "react-i18next";
import {
  Clock,
  Type,
  Timer,
  Gauge,
  Sparkle,
  Lock,
  Mic,
  Hand,
  BarChart3,
} from "lucide-react";
import { useSettings } from "../hooks/useSettings";
import type { AppPage } from "../components/Sidebar";
import { ModelQuickSwitch } from "../components/ModelQuickSwitch";
import { formatKeyCombination } from "../lib/utils/keyboard";
import { useOsType } from "../hooks/useOsType";
import { QuickToggle } from "../components/QuickToggle";
import { useUsageStats, type DayBar } from "../hooks/useUsageStats";

type TFunc = (key: string, opts?: Record<string, unknown>) => string;

const fmtDuration = (
  sec: number,
  t: TFunc,
): { value: string; unit: string } => {
  const m = Math.floor(sec / 60);
  if (m < 60) return { value: String(m), unit: t("home.unitMin") };
  return {
    value: String(Math.floor(m / 60)),
    unit: t("home.unitHrMin", { min: m % 60 }),
  };
};

const WeeklyBars: React.FC<{ data: DayBar[] }> = ({ data }) => {
  const { t } = useTranslation();
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div className="mt-4 flex items-end justify-between gap-1.5 h-28">
      {data.map((d, i) => {
        const count = d.count;
        const pct = (d.count / max) * 100;
        const isToday = i === data.length - 1;
        const label = t(`home.weekday.${d.dow}`);
        return (
          <div
            key={i}
            className="flex-1 flex flex-col items-center gap-1.5 h-full"
          >
            <div className="flex-1 w-full flex items-end justify-center">
              <div
                className={`w-full max-w-[16px] rounded-t-md transition-all duration-300 hover:bg-logo-primary ${
                  isToday ? "bg-logo-primary" : "bg-logo-primary/55"
                }`}
                style={{ height: `${Math.max(3, pct)}%` }}
                title={`${label} · ${t("home.wordsShort", { n: count })}`}
              />
            </div>
            <span
              className={`text-[10px] ${isToday ? "text-logo-primary font-semibold" : "text-mid-gray"}`}
            >
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
};

const StatCard: React.FC<{
  icon: React.ReactNode;
  value: string;
  unit?: string;
  label: string;
}> = ({ icon, value, unit, label }) => (
  <div className="rounded-2xl border border-mid-gray/15 bg-background p-5 flex flex-col gap-2 shadow-sm">
    <div className="text-logo-primary">{icon}</div>
    <div className="flex items-baseline gap-1">
      <span className="text-2xl font-semibold text-text">{value}</span>
      {unit && <span className="text-sm text-mid-gray">{unit}</span>}
    </div>
    <div className="text-sm text-mid-gray">{label}</div>
  </div>
);

interface HomePageProps {
  onNavigate?: (page: AppPage) => void;
}

export const HomePage: React.FC<HomePageProps> = ({ onNavigate }) => {
  const { t } = useTranslation();
  const { getSetting, updateSetting, isUpdating } = useSettings();
  const osType = useOsType();
  const stats = useUsageStats();
  const transcribeBinding =
    getSetting("bindings")?.transcribe?.current_binding || "ctrl+space";

  const totalTime = fmtDuration(stats.speakSec, t);
  const savedTime = fmtDuration(stats.savedSec, t);

  return (
    <div className="max-w-4xl w-full mx-auto p-8 space-y-7">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text">{t("home.heroTitle")}</h1>
          <p className="text-sm text-mid-gray mt-2">
            {t("home.heroHintPre")}{" "}
            <span className="px-1.5 py-0.5 rounded bg-mid-gray/10 text-text font-medium">
              {formatKeyCombination(transcribeBinding, osType)}
            </span>{" "}
            {t("home.heroHintPost")}
          </p>
        </div>
        <ModelQuickSwitch />
      </div>

      <div className="flex flex-col md:flex-row gap-4">
        {/* 左：最近七日口述字数 */}
        <div className="md:w-[38%] rounded-2xl border border-mid-gray/15 bg-background p-6 flex flex-col justify-between shadow-sm">
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-mid-gray text-sm">
                <BarChart3 size={15} />
                <span>{t("home.weeklyTitle")}</span>
              </div>
              <span className="text-xs text-mid-gray">
                {t("home.weeklyTotal", { n: stats.weekWords })}
              </span>
            </div>
            <WeeklyBars data={stats.daily} />
          </div>
          <div className="flex items-center gap-1.5 text-xs text-mid-gray mt-4">
            <Lock size={13} />
            <span>{t("home.privacy")}</span>
          </div>
        </div>

        {/* 右：2×2 数据卡 */}
        <div className="flex-1 grid grid-cols-2 gap-4">
          <StatCard
            icon={<Clock size={20} />}
            value={totalTime.value}
            unit={totalTime.unit}
            label={t("home.stat.totalTime")}
          />
          <StatCard
            icon={<Type size={20} />}
            value={
              stats.totalWords >= 1000
                ? (stats.totalWords / 1000).toFixed(1) + "K"
                : String(stats.totalWords)
            }
            unit={t("home.stat.wordsUnit")}
            label={t("home.stat.words")}
          />
          <StatCard
            icon={<Timer size={20} />}
            value={savedTime.value}
            unit={savedTime.unit}
            label={t("home.stat.saved")}
          />
          <StatCard
            icon={<Gauge size={20} />}
            value={String(stats.wpm)}
            unit={t("home.stat.speedUnit")}
            label={t("home.stat.speed")}
          />
        </div>
      </div>

      {/* 快速开关 */}
      <div className="rounded-2xl border border-mid-gray/15 bg-background p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-text mb-1">
          {t("home.quickToggles")}
        </h2>
        <div className="divide-y divide-mid-gray/10">
          <QuickToggle
            label={t("home.aiPolishLabel")}
            hint={t("home.aiPolishHint")}
            icon={<Sparkle size={16} />}
            checked={Boolean(getSetting("post_process_enabled"))}
            updating={isUpdating("post_process_enabled")}
            onToggle={(v) => void updateSetting("post_process_enabled", v)}
          />
          <QuickToggle
            label={t("home.pttLabel")}
            hint={t("home.pttHint")}
            icon={<Hand size={16} />}
            checked={Boolean(getSetting("push_to_talk"))}
            updating={isUpdating("push_to_talk")}
            onToggle={(v) => void updateSetting("push_to_talk", v)}
          />
        </div>
      </div>

      {/* 最后的转录 */}
      <div>
        <h2 className="text-sm font-semibold text-text mb-2">
          {t("home.lastTranscription")}
        </h2>
        <button
          onClick={() => onNavigate?.("history")}
          className="w-full text-left rounded-2xl border border-mid-gray/15 bg-background p-4 shadow-sm hover:bg-mid-gray/[0.03] transition-colors cursor-pointer"
        >
          {stats.lastText ? (
            <div className="flex items-start gap-3">
              <Mic size={16} className="text-logo-primary mt-0.5 shrink-0" />
              <p className="text-sm text-text/90 line-clamp-3 whitespace-pre-wrap break-words">
                {stats.lastText}
              </p>
            </div>
          ) : (
            <p className="text-sm text-mid-gray">
              {t("home.emptyTranscription")}
            </p>
          )}
        </button>
      </div>
    </div>
  );
};
