import React from "react";
import { useTranslation } from "react-i18next";
import { ThemeSelector } from "./ThemeSelector";

export const AppearanceSettings: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div className="max-w-3xl w-full mx-auto space-y-6">
      <div>
        <h3 className="text-base font-semibold text-text mb-1">
          {t("appearance.themeTitle")}
        </h3>
        <p className="text-sm text-mid-gray mb-3">
          {t("appearance.themeDescription")}
        </p>
        <ThemeSelector />
      </div>
    </div>
  );
};
