import React from "react";
import { useTranslation } from "react-i18next";
import {
  Type,
  Clock,
  Gauge,
  Flame,
  Mic,
  Timer,
  CalendarDays,
  BarChart3,
} from "lucide-react";
import { useUsageStats } from "../hooks/useUsageStats";

type TFunc = (key: string, opts?: Record<string, unknown>) => string;

const fmtNum = (n: number): string =>
  n >= 1000 ? (n / 1000).toFixed(1) + "K" : String(n);

const fmtDur = (sec: number, t: TFunc): { value: string; unit: string } => {
  const m = Math.round(sec / 60);
  if (m < 60) return { value: String(m), unit: t("home.unitMin") };
  return {
    value: String(Math.floor(m / 60)),
    unit: t("home.unitHrMin", { min: m % 60 }),
  };
};

const StatTile: React.FC<{
  icon: React.ReactNode;
  value: string;
  unit?: string;
  label: string;
}> = ({ icon, value, unit, label }) => (
  <div className="rounded-2xl border border-mid-gray/15 bg-background p-5 flex flex-col gap-2 shadow-sm">
    <div className="text-logo-primary">{icon}</div>
    <div className="flex items-baseline gap-1">
      <span className="text-2xl font-bold text-text">{value}</span>
      {unit && <span className="text-sm text-mid-gray">{unit}</span>}
    </div>
    <div className="text-sm text-mid-gray">{label}</div>
  </div>
);

const TrendChart: React.FC<{ data: { count: number; isToday: boolean }[] }> = ({
  data,
}) => {
  const { t } = useTranslation();
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div className="flex items-end gap-[3px] h-40">
      {data.map((d, i) => (
        <div
          key={i}
          className="flex-1 flex items-end h-full"
          title={t("home.wordsShort", { n: d.count })}
        >
          <div
            className={`w-full rounded-t-sm transition-all duration-300 ${
              d.isToday
                ? "bg-logo-primary"
                : "bg-logo-primary/45 hover:bg-logo-primary/80"
            }`}
            style={{ height: `${Math.max(2, (d.count / max) * 100)}%` }}
          />
        </div>
      ))}
    </div>
  );
};

const WeekChart: React.FC<{ data: { dow: number; count: number }[] }> = ({
  data,
}) => {
  const { t } = useTranslation();
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div className="flex items-end justify-between gap-2 h-32">
      {data.map((d, i) => {
        const isToday = i === data.length - 1;
        const label = t(`home.weekday.${d.dow}`);
        return (
          <div
            key={i}
            className="flex-1 flex flex-col items-center gap-1.5 h-full"
          >
            <div className="flex-1 w-full flex items-end justify-center">
              <div
                className={`w-full max-w-[22px] rounded-t-md transition-all duration-300 ${
                  isToday ? "bg-logo-primary" : "bg-logo-primary/50"
                }`}
                style={{ height: `${Math.max(3, (d.count / max) * 100)}%` }}
                title={t("home.wordsShort", { n: d.count })}
              />
            </div>
            <span
              className={`text-[11px] ${isToday ? "text-logo-primary font-semibold" : "text-mid-gray"}`}
            >
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
};

export const UsagePage: React.FC = () => {
  const { t } = useTranslation();
  const s = useUsageStats();
  const totalTime = fmtDur(s.speakSec, t);
  const savedTime = fmtDur(s.savedSec, t);
  const isEmpty = s.totalCount === 0;

  return (
    <div className="max-w-5xl w-full mx-auto p-8 space-y-7">
      <div>
        <h1 className="text-2xl font-bold text-text">{t("usagePage.title")}</h1>
        <p className="text-sm text-mid-gray mt-1.5">
          {t("usagePage.subtitle")}
        </p>
      </div>

      {isEmpty ? (
        <div className="rounded-2xl border border-mid-gray/15 bg-background p-16 text-center text-mid-gray shadow-sm">
          {t("usagePage.empty")}
        </div>
      ) : (
        <>
          {/* 关键指标 */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <StatTile
              icon={<Type size={20} />}
              value={fmtNum(s.totalWords)}
              unit={t("home.stat.wordsUnit")}
              label={t("usagePage.totalWords")}
            />
            <StatTile
              icon={<Clock size={20} />}
              value={totalTime.value}
              unit={totalTime.unit}
              label={t("usagePage.totalTime")}
            />
            <StatTile
              icon={<Gauge size={20} />}
              value={String(s.wpm)}
              unit={t("usagePage.speedUnit")}
              label={t("usagePage.avgSpeed")}
            />
            <StatTile
              icon={<Flame size={20} />}
              value={t("usage.daysVal", { n: s.streak })}
              label={t("usagePage.streak")}
            />
            <StatTile
              icon={<Mic size={20} />}
              value={String(s.totalCount)}
              label={t("usagePage.count")}
            />
          </div>

          {/* 近 30 日趋势 */}
          <div className="rounded-2xl border border-mid-gray/15 bg-background p-6 shadow-sm">
            <div className="flex items-center gap-1.5 text-sm text-mid-gray mb-4">
              <BarChart3 size={16} />
              {t("usagePage.last30")}
            </div>
            <TrendChart data={s.last30} />
          </div>

          {/* 近 7 日 + 次要指标 */}
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="lg:flex-1 rounded-2xl border border-mid-gray/15 bg-background p-6 shadow-sm">
              <div className="flex items-center gap-1.5 text-sm text-mid-gray mb-3">
                <CalendarDays size={16} />
                {t("usagePage.last7")}
              </div>
              <WeekChart data={s.daily} />
            </div>
            <div className="lg:w-[34%] grid grid-cols-2 gap-4">
              <StatTile
                icon={<CalendarDays size={20} />}
                value={t("usage.daysVal", { n: s.activeDays })}
                label={t("usagePage.activeDays")}
              />
              <StatTile
                icon={<Timer size={20} />}
                value={savedTime.value}
                unit={savedTime.unit}
                label={t("usagePage.saved")}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
};
