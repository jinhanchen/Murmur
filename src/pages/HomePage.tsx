import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Clock,
  Type,
  Timer,
  Gauge,
  Sparkles,
  Lock,
  Mic,
  Hand,
  BarChart3,
} from "lucide-react";
import { commands } from "@/bindings";
import { useSettings } from "../hooks/useSettings";
import type { AppPage } from "../components/Sidebar";
import { ModelQuickSwitch } from "../components/ModelQuickSwitch";
import { formatKeyCombination } from "../lib/utils/keyboard";
import { useOsType } from "../hooks/useOsType";
import { QuickToggle } from "../components/QuickToggle";

interface Stats {
  words: number;
  count: number;
  speakSec: number;
  savedSec: number;
  wpm: number;
}

type TFunc = (key: string, opts?: Record<string, unknown>) => string;

// 估算常量：说话约 240 字/分钟，打字约 40 字/分钟。
const SPEAK_CPM = 240;
const TYPE_CPM = 40;

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

interface DayBar {
  dow: number;
  seconds: number;
}

// 把历史记录按「最近七天」分桶，估算每天的口述秒数。
const computeDaily = (
  entries: {
    timestamp: number;
    post_processed_text: string | null;
    transcription_text: string;
  }[],
): DayBar[] => {
  const now = new Date();
  const days: { key: string; dow: number; seconds: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    days.push({
      key: `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`,
      dow: d.getDay(),
      seconds: 0,
    });
  }
  for (const e of entries) {
    // timestamp 可能是秒或毫秒，统一成毫秒。
    const ms = e.timestamp < 1e12 ? e.timestamp * 1000 : e.timestamp;
    const d = new Date(ms);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const bucket = days.find((x) => x.key === key);
    if (!bucket) continue;
    const text = e.post_processed_text || e.transcription_text || "";
    const words = [...text].filter((c) => c.trim()).length;
    bucket.seconds += (words / SPEAK_CPM) * 60;
  }
  return days.map((d) => ({ dow: d.dow, seconds: d.seconds }));
};

const WeeklyBars: React.FC<{ data: DayBar[] }> = ({ data }) => {
  const { t } = useTranslation();
  const max = Math.max(1, ...data.map((d) => d.seconds));
  return (
    <div className="mt-4 flex items-end justify-between gap-1.5 h-28">
      {data.map((d, i) => {
        const min = Math.round(d.seconds / 60);
        const pct = (d.seconds / max) * 100;
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
                title={`${label} · ${t("home.minutesShort", { min })}`}
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
  estimate?: boolean;
}> = ({ icon, value, unit, label, estimate }) => {
  const { t } = useTranslation();
  return (
    <div className="rounded-2xl border border-mid-gray/15 bg-background p-5 flex flex-col gap-2 shadow-sm">
      <div className="text-logo-primary">{icon}</div>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-semibold text-text">{value}</span>
        {unit && <span className="text-sm text-mid-gray">{unit}</span>}
      </div>
      <div className="text-sm text-mid-gray flex items-center gap-1.5">
        <span>{label}</span>
        {estimate && (
          <span className="text-[10px] text-mid-gray/50 border border-mid-gray/20 rounded px-1">
            {t("home.stat.estimate")}
          </span>
        )}
      </div>
    </div>
  );
};

interface HomePageProps {
  onNavigate?: (page: AppPage) => void;
}

export const HomePage: React.FC<HomePageProps> = ({ onNavigate }) => {
  const { t } = useTranslation();
  const { getSetting, updateSetting, isUpdating } = useSettings();
  const osType = useOsType();
  const [stats, setStats] = useState<Stats>({
    words: 0,
    count: 0,
    speakSec: 0,
    savedSec: 0,
    wpm: SPEAK_CPM,
  });
  const [lastText, setLastText] = useState<string>("");
  const [daily, setDaily] = useState<DayBar[]>([]);
  const transcribeBinding =
    getSetting("bindings")?.transcribe?.current_binding || "ctrl+space";

  useEffect(() => {
    (async () => {
      try {
        const all: any[] = [];
        let cursor: number | null = null;
        let more = true;
        let guard = 0;
        while (more && guard < 80) {
          const r = await commands.getHistoryEntries(cursor, 100);
          if (r.status !== "ok") break;
          all.push(...r.data.entries);
          more = r.data.has_more;
          cursor = all.length ? all[all.length - 1].id : null;
          guard++;
        }
        const text = all
          .map((e) => e.post_processed_text || e.transcription_text || "")
          .join("");
        const words = [...text].filter((c) => c.trim()).length;
        const speakSec = (words / SPEAK_CPM) * 60;
        const savedSec = Math.max(0, (words / TYPE_CPM) * 60 - speakSec);
        setStats({ words, count: all.length, speakSec, savedSec, wpm: SPEAK_CPM });
        setDaily(computeDaily(all));
        const latest = all[0];
        setLastText(
          latest?.post_processed_text || latest?.transcription_text || "",
        );
      } catch (e) {
        console.error("dashboard stats load failed", e);
      }
    })();
  }, []);

  const totalTime = fmtDuration(stats.speakSec, t);
  const savedTime = fmtDuration(stats.savedSec, t);
  const weekTotalMin = Math.round(
    daily.reduce((s, d) => s + d.seconds, 0) / 60,
  );

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
        {/* 左：最近七日口述时间 */}
        <div className="md:w-[38%] rounded-2xl border border-mid-gray/15 bg-background p-6 flex flex-col justify-between shadow-sm">
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-mid-gray text-sm">
                <BarChart3 size={15} />
                <span>{t("home.weeklyTitle")}</span>
              </div>
              <span className="text-xs text-mid-gray">
                {t("home.weeklyTotal", { min: weekTotalMin })}
              </span>
            </div>
            <WeeklyBars data={daily} />
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
            estimate
          />
          <StatCard
            icon={<Type size={20} />}
            value={
              stats.words >= 1000
                ? (stats.words / 1000).toFixed(1) + "K"
                : String(stats.words)
            }
            unit={t("home.stat.wordsUnit")}
            label={t("home.stat.words")}
          />
          <StatCard
            icon={<Timer size={20} />}
            value={savedTime.value}
            unit={savedTime.unit}
            label={t("home.stat.saved")}
            estimate
          />
          <StatCard
            icon={<Gauge size={20} />}
            value={String(stats.wpm)}
            unit={t("home.stat.speedUnit")}
            label={t("home.stat.speed")}
            estimate
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
            icon={<Sparkles size={16} />}
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
          {lastText ? (
            <div className="flex items-start gap-3">
              <Mic size={16} className="text-logo-primary mt-0.5 shrink-0" />
              <p className="text-sm text-text/90 line-clamp-3 whitespace-pre-wrap break-words">
                {lastText}
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
