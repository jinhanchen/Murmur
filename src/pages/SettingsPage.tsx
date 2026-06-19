import React from "react";
import { useTranslation } from "react-i18next";
import {
  GeneralSettings,
  ModelsSettings,
  PostProcessingSettings,
  AdvancedSettings,
  AboutSettings,
} from "../components/settings";

const Section: React.FC<{ title: string; subtitle?: string; children: React.ReactNode }> = ({
  title,
  subtitle,
  children,
}) => (
  <section className="space-y-3">
    <div>
      <h2 className="text-lg font-semibold text-text">{title}</h2>
      {subtitle && <p className="text-sm text-mid-gray">{subtitle}</p>}
    </div>
    {children}
  </section>
);

export const SettingsPage: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div className="max-w-3xl w-full mx-auto p-6 space-y-10">
      <h1 className="text-2xl font-bold text-text">{t("settingsPage.title")}</h1>

      <Section
        title={t("settingsPage.general")}
        subtitle={t("settingsPage.generalSubtitle")}
      >
        <GeneralSettings />
      </Section>

      <Section
        title={t("settingsPage.speechModel")}
        subtitle={t("settingsPage.speechModelSubtitle")}
      >
        <ModelsSettings />
      </Section>

      <Section
        title={t("settingsPage.aiCleanup")}
        subtitle={t("settingsPage.aiCleanupSubtitle")}
      >
        <PostProcessingSettings />
      </Section>

      <Section title={t("settingsPage.advanced")}>
        <AdvancedSettings />
      </Section>

      <Section title={t("settingsPage.about")}>
        <AboutSettings />
      </Section>
    </div>
  );
};
