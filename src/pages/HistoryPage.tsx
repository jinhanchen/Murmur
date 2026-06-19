import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Lock } from "lucide-react";
import { HistorySettings } from "../components/settings/history/HistorySettings";
import { RecordingRetentionPeriodSelector } from "../components/settings";

export const HistoryPage: React.FC = () => {
  const { t } = useTranslation();
  const [tab, setTab] = useState<"all" | "dictation">("all");

  return (
    <div className="max-w-3xl w-full mx-auto p-6 space-y-5">
      <h1 className="text-2xl font-bold text-text">{t("history.title")}</h1>

      {/* 保存历史 + 数据私密（复刻 Typeless） */}
      <div className="rounded-2xl border border-mid-gray/15 bg-background p-4 space-y-4 shadow-sm">
        <RecordingRetentionPeriodSelector descriptionMode="inline" />
        <div className="flex items-start gap-2.5 pt-3 border-t border-mid-gray/10">
          <Lock size={15} className="text-text/55 mt-0.5 shrink-0" />
          <div>
            <div className="text-sm font-medium text-text">
              {t("history.privacyTitle")}
            </div>
            <div className="text-sm text-mid-gray mt-0.5">
              {t("history.privacyDescription")}
            </div>
          </div>
        </div>
      </div>

      {/* 标签 */}
      <div className="flex gap-1 p-1 rounded-lg bg-mid-gray/10 w-fit">
        {(
          [
            ["all", "history.tabAll"],
            ["dictation", "history.tabDictation"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-3 py-1 text-sm rounded-md transition-colors cursor-pointer ${
              tab === id
                ? "bg-background text-text shadow-sm"
                : "text-mid-gray hover:text-text"
            }`}
          >
            {t(label)}
          </button>
        ))}
      </div>

      {/* 列表 */}
      <HistorySettings />
    </div>
  );
};
