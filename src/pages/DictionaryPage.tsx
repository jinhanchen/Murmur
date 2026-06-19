import React from "react";
import { useTranslation } from "react-i18next";
import { CustomWords } from "../components/settings/CustomWords";

export const DictionaryPage: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div className="max-w-3xl w-full mx-auto p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-text">{t("dictionary.title")}</h1>
        <p className="text-sm text-mid-gray mt-2">
          {t("dictionary.description")}
        </p>
      </div>
      <div className="rounded-2xl border border-mid-gray/15 bg-background p-4 shadow-sm">
        <CustomWords descriptionMode="inline" />
      </div>
    </div>
  );
};
