import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { RefreshCcw, Sparkles, Check, Cpu, Cloud } from "lucide-react";
import { useSettings } from "../../../../hooks/useSettings";
import { usePostProcessProviderState } from "../../../settings/PostProcessingSettingsApi/usePostProcessProviderState";
import { ProviderSelect } from "../../../settings/PostProcessingSettingsApi/ProviderSelect";
import { BaseUrlField } from "../../../settings/PostProcessingSettingsApi/BaseUrlField";
import { ApiKeyField } from "../../../settings/PostProcessingSettingsApi/ApiKeyField";
import { ModelSelect } from "../../../settings/PostProcessingSettingsApi/ModelSelect";
import { LocalLlmPanel } from "./LocalLlmPanel";
import type { HardwareInfo } from "../hardware";

interface LlmStepProps {
  hardware: HardwareInfo | null;
  onNext: () => void;
  onBack: () => void;
}

export const LlmStep: React.FC<LlmStepProps> = ({
  hardware,
  onNext,
  onBack,
}) => {
  const { t } = useTranslation();
  const { getSetting, updateSetting } = useSettings();
  const state = usePostProcessProviderState();

  const enabled = Boolean(getSetting("post_process_enabled"));
  const [mode, setMode] = useState<"local" | "api">("local");

  const setEnabled = (value: boolean) => {
    void updateSetting("post_process_enabled", value);
  };

  return (
    <div className="mm-step flex flex-col px-8 py-8 min-h-[460px]">
      <div className="text-center mb-5 shrink-0">
        <div className="inline-flex items-center gap-1.5 text-logo-primary text-xs font-semibold mb-2">
          <Sparkles className="w-3.5 h-3.5" />
          {t("wizard.llm.optional")}
        </div>
        <h2 className="text-2xl font-bold text-text">{t("wizard.llm.title")}</h2>
        <p className="text-mid-gray text-sm mt-1.5 max-w-md mx-auto">
          {t("wizard.llm.subtitle")
            .split("\n")
            .map((line, i, arr) => (
              <React.Fragment key={i}>
                {line}
                {i < arr.length - 1 && <br />}
              </React.Fragment>
            ))}
        </p>
      </div>

      {/* 启用 / 不启用 二选一 */}
      <div className="grid grid-cols-2 gap-3 shrink-0">
        <button
          onClick={() => setEnabled(false)}
          className={`rounded-2xl border p-4 text-left transition-all cursor-pointer ${
            !enabled
              ? "border-logo-primary bg-logo-primary/8 ring-1 ring-logo-primary/40"
              : "border-mid-gray/20 hover:border-mid-gray/40"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-text">
              {t("wizard.llm.skipOption")}
            </span>
            {!enabled && <Check className="w-4 h-4 text-logo-primary" />}
          </div>
          <p className="text-xs text-mid-gray mt-1">
            {t("wizard.llm.skipOptionHint")}
          </p>
        </button>
        <button
          onClick={() => setEnabled(true)}
          className={`rounded-2xl border p-4 text-left transition-all cursor-pointer ${
            enabled
              ? "border-logo-primary bg-logo-primary/8 ring-1 ring-logo-primary/40"
              : "border-mid-gray/20 hover:border-mid-gray/40"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-text">
              {t("wizard.llm.enableOption")}
            </span>
            {enabled && <Check className="w-4 h-4 text-logo-primary" />}
          </div>
          <p className="text-xs text-mid-gray mt-1">
            {t("wizard.llm.enableOptionHint")}
          </p>
        </button>
      </div>

      {/* 配置区 */}
      <div className="flex-1 overflow-y-auto mt-4 -mx-2 px-2">
        {enabled && (
          <div className="mm-rise">
            {/* 本地 / 云端 子切换 */}
            <div className="grid grid-cols-2 gap-2 mb-4">
              <TabButton
                active={mode === "local"}
                onClick={() => setMode("local")}
                icon={<Cpu className="w-4 h-4" />}
                title={t("wizard.llm.tabLocal")}
                sub={t("wizard.llm.tabLocalSub")}
              />
              <TabButton
                active={mode === "api"}
                onClick={() => setMode("api")}
                icon={<Cloud className="w-4 h-4" />}
                title={t("wizard.llm.tabApi")}
                sub={t("wizard.llm.tabApiSub")}
              />
            </div>

            {mode === "local" ? (
              <LocalLlmPanel hardware={hardware} />
            ) : (
              <div className="rounded-2xl border border-mid-gray/15 bg-background/60 p-4 space-y-3.5">
                <Field label={t("wizard.llm.fieldProvider")}>
                  <ProviderSelect
                    options={state.providerOptions}
                    value={state.selectedProviderId}
                    onChange={state.handleProviderSelect}
                  />
                </Field>

                {state.selectedProvider?.id === "custom" && (
                  <Field
                    label={t("wizard.llm.fieldBaseUrl")}
                    hint={t("wizard.llm.fieldBaseUrlHint")}
                  >
                    <BaseUrlField
                      value={state.baseUrl}
                      onBlur={state.handleBaseUrlChange}
                      placeholder="https://api.example.com/v1"
                      disabled={state.isBaseUrlUpdating}
                      className="w-full"
                    />
                  </Field>
                )}

                {!state.isAppleProvider && (
                  <Field label="API Key">
                    <ApiKeyField
                      value={state.apiKey}
                      onBlur={state.handleApiKeyChange}
                      placeholder="sk-..."
                      disabled={state.isApiKeyUpdating}
                      className="w-full"
                    />
                  </Field>
                )}

                {!state.isAppleProvider && (
                  <Field label={t("wizard.llm.fieldModel")}>
                    <div className="flex items-center gap-2">
                      <ModelSelect
                        value={state.model}
                        options={state.modelOptions}
                        disabled={state.isModelUpdating}
                        isLoading={state.isFetchingModels}
                        placeholder={
                          state.modelOptions.length > 0
                            ? t("wizard.llm.modelPlaceholderWithOptions")
                            : t("wizard.llm.modelPlaceholderNoOptions")
                        }
                        onSelect={state.handleModelSelect}
                        onCreate={state.handleModelCreate}
                        onBlur={() => {}}
                        className="flex-1"
                      />
                      <button
                        onClick={state.handleRefreshModels}
                        disabled={state.isFetchingModels}
                        title={t("wizard.llm.refreshModels")}
                        className="h-10 w-10 grid place-items-center rounded-md border border-mid-gray/30 text-text/70 hover:bg-mid-gray/10 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <RefreshCcw
                          className={`h-4 w-4 ${state.isFetchingModels ? "animate-spin" : ""}`}
                        />
                      </button>
                    </div>
                  </Field>
                )}

                {state.appleIntelligenceUnavailable && (
                  <p className="text-xs text-amber-500">
                    {t(
                      "settings.postProcessing.api.appleIntelligence.unavailable",
                    )}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 mt-5 pt-4 border-t border-mid-gray/10 shrink-0">
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
  );
};

const TabButton: React.FC<{
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  sub: string;
}> = ({ active, onClick, icon, title, sub }) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-all cursor-pointer ${
      active
        ? "border-logo-primary bg-logo-primary/8 ring-1 ring-logo-primary/30"
        : "border-mid-gray/20 hover:border-mid-gray/40"
    }`}
  >
    <div
      className={`w-8 h-8 rounded-lg grid place-items-center shrink-0 ${
        active ? "bg-logo-primary text-white" : "bg-mid-gray/15 text-mid-gray"
      }`}
    >
      {icon}
    </div>
    <div className="min-w-0">
      <div className="text-sm font-semibold text-text">{title}</div>
      <div className="text-[11px] text-mid-gray">{sub}</div>
    </div>
  </button>
);

const Field: React.FC<{
  label: string;
  hint?: string;
  children: React.ReactNode;
}> = ({ label, hint, children }) => (
  <div className="space-y-1.5">
    <label className="text-xs font-semibold text-text/80">{label}</label>
    {children}
    {hint && <p className="text-[11px] text-mid-gray/70">{hint}</p>}
  </div>
);

export default LlmStep;
