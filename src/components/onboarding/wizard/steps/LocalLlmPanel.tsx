import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { toast } from "sonner";
import {
  Loader2,
  Download,
  Check,
  RefreshCcw,
  Server,
  ExternalLink,
} from "lucide-react";
import { commands } from "@/bindings";
import { useSettings } from "../../../../hooks/useSettings";
import type { HardwareInfo, PerfTier } from "../hardware";

const OLLAMA_OPENAI_URL = "http://localhost:11434/v1";
const OLLAMA_DOWNLOAD = "https://ollama.com/download";

interface LocalModel {
  id: string;
  label: string;
  size: string;
  blurbKey: string;
  tier: PerfTier;
}

// 精选 Qwen2.5（中文表现好、体积友好），按档位各一个。blurbKey 存 i18n key，渲染时 t() 翻译。
const LOCAL_MODELS: LocalModel[] = [
  {
    id: "qwen2.5:1.5b",
    label: "Qwen2.5 1.5B",
    size: "~1 GB",
    blurbKey: "wizard.local.models.qwen15b.blurb",
    tier: "basic",
  },
  {
    id: "qwen2.5:3b",
    label: "Qwen2.5 3B",
    size: "~1.9 GB",
    blurbKey: "wizard.local.models.qwen3b.blurb",
    tier: "balanced",
  },
  {
    id: "qwen2.5:7b",
    label: "Qwen2.5 7B",
    size: "~4.7 GB",
    blurbKey: "wizard.local.models.qwen7b.blurb",
    tier: "high",
  },
];

interface PullProgress {
  model: string;
  status: string;
  completed: number;
  total: number;
  percentage: number;
  done: boolean;
  error: string | null;
}

type TFunc = (key: string, opts?: Record<string, unknown>) => string;

// 把 Ollama 原始状态映射到 i18n key。
const STATUS_KEY: Record<string, string> = {
  "pulling manifest": "wizard.local.status.pullingManifest",
  "verifying sha256 digest": "wizard.local.status.verifying",
  "writing manifest": "wizard.local.status.writingManifest",
  success: "wizard.local.status.success",
};
const friendlyStatus = (s: string, t: TFunc): string => {
  if (s.startsWith("downloading") || s.startsWith("pulling"))
    return t("wizard.local.status.downloading");
  const key = STATUS_KEY[s];
  return key ? t(key) : s;
};

interface LocalLlmPanelProps {
  hardware: HardwareInfo | null;
}

export const LocalLlmPanel: React.FC<LocalLlmPanelProps> = ({ hardware }) => {
  const { t } = useTranslation();
  const {
    getSetting,
    updateSetting,
    setPostProcessProvider,
    updatePostProcessBaseUrl,
    updatePostProcessModel,
  } = useSettings();

  const [phase, setPhase] = useState<"checking" | "absent" | "ready">(
    "checking",
  );
  const [installed, setInstalled] = useState<string[]>([]);
  const [pulling, setPulling] = useState<
    Record<string, { pct: number; status: string }>
  >({});

  const tier = hardware?.tier ?? "balanced";

  const provider = getSetting("post_process_provider_id");
  const enabled = getSetting("post_process_enabled");
  const ppModels = getSetting("post_process_models") as
    | Record<string, string>
    | undefined;
  const activeModel =
    provider === "custom" && enabled ? (ppModels?.["custom"] ?? null) : null;

  const refresh = useCallback(async () => {
    setPhase("checking");
    try {
      const status = await commands.ollamaStatus();
      if (status.status !== "ok" || !status.data.running) {
        setPhase("absent");
        return;
      }
      const list = await commands.ollamaListModels();
      setInstalled(list.status === "ok" ? list.data : []);
      setPhase("ready");
    } catch (e) {
      console.warn("ollama check failed", e);
      setPhase("absent");
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // 流式拉取进度
  useEffect(() => {
    const un = listen<PullProgress>("ollama-pull-progress", (e) => {
      const p = e.payload;
      setPulling((prev) => {
        if (!(p.model in prev)) return prev;
        return {
          ...prev,
          [p.model]: { pct: p.percentage, status: friendlyStatus(p.status, t) },
        };
      });
    });
    return () => {
      un.then((f) => f());
    };
  }, []);

  const configureLocal = useCallback(
    async (model: string) => {
      // 顺序要紧：先 provider、再 base_url（会清空旧 model）、最后写 model。
      await setPostProcessProvider("custom");
      await updatePostProcessBaseUrl("custom", OLLAMA_OPENAI_URL);
      await updatePostProcessModel("custom", model);
      await updateSetting("post_process_enabled", true);
    },
    [
      setPostProcessProvider,
      updatePostProcessBaseUrl,
      updatePostProcessModel,
      updateSetting,
    ],
  );

  const handleUse = async (model: string) => {
    await configureLocal(model);
    toast.success(t("wizard.local.enabled", { model }));
  };

  const handlePull = async (model: string) => {
    setPulling((p) => ({
      ...p,
      [model]: { pct: 0, status: t("wizard.local.status.preparing") },
    }));
    try {
      const res = await commands.ollamaPullModel(model);
      if (res.status !== "ok") {
        toast.error(t("wizard.local.downloadFailed", { error: res.error }));
        return;
      }
      setInstalled((prev) => (prev.includes(model) ? prev : [...prev, model]));
      await configureLocal(model);
      toast.success(t("wizard.local.installedEnabled", { model }));
    } catch (e) {
      toast.error(t("wizard.local.downloadFailed", { error: e }));
    } finally {
      setPulling((p) => {
        const n = { ...p };
        delete n[model];
        return n;
      });
    }
  };

  if (phase === "checking") {
    return (
      <div className="flex items-center justify-center gap-2 text-mid-gray text-sm py-10">
        <Loader2 className="w-4 h-4 animate-spin" />
        {t("wizard.local.checking")}
      </div>
    );
  }

  if (phase === "absent") {
    return (
      <div className="mm-rise rounded-2xl border border-mid-gray/15 bg-background/60 p-5 text-center">
        <div className="w-12 h-12 rounded-2xl grid place-items-center bg-mid-gray/10 text-mid-gray mx-auto mb-3">
          <Server className="w-6 h-6" />
        </div>
        <h3 className="text-sm font-semibold text-text">
          {t("wizard.local.absentTitle")}
        </h3>
        <p className="text-xs text-mid-gray mt-1.5 max-w-xs mx-auto leading-relaxed">
          {t("wizard.local.absentHint")}
        </p>
        <div className="flex items-center justify-center gap-2 mt-4">
          <button
            onClick={() => void openUrl(OLLAMA_DOWNLOAD)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-logo-primary text-white text-sm font-semibold hover:brightness-110 transition cursor-pointer"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            {t("wizard.local.download")}
          </button>
          <button
            onClick={refresh}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-mid-gray/25 text-text/80 text-sm font-medium hover:bg-mid-gray/10 transition cursor-pointer"
          >
            <RefreshCcw className="w-3.5 h-3.5" />
            {t("wizard.local.recheck")}
          </button>
        </div>
        <p className="text-[11px] text-mid-gray/60 mt-3">
          {t("wizard.local.absentFallback")}
        </p>
      </div>
    );
  }

  // ready
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
          <Check className="w-3.5 h-3.5" />
          {t("wizard.local.connected")}
        </div>
        <button
          onClick={refresh}
          title={t("wizard.local.refreshInstalled")}
          className="text-mid-gray hover:text-text transition cursor-pointer"
        >
          <RefreshCcw className="w-3.5 h-3.5" />
        </button>
      </div>

      {LOCAL_MODELS.map((m) => {
        const isInstalled = installed.includes(m.id);
        const isActive = activeModel === m.id;
        const prog = pulling[m.id];
        const isRec = m.tier === tier;
        return (
          <div
            key={m.id}
            className={`rounded-xl border p-3 transition-all ${
              isActive
                ? "border-logo-primary/50 bg-logo-primary/8"
                : "border-mid-gray/15 bg-background/50"
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-text">
                    {m.label}
                  </span>
                  {isRec && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-logo-primary text-white">
                      {t("wizard.local.recommended")}
                    </span>
                  )}
                  <span className="text-[11px] text-mid-gray">{m.size}</span>
                </div>
                <div className="text-[11px] text-mid-gray mt-0.5">
                  {t(m.blurbKey)}
                </div>
              </div>

              <div className="shrink-0">
                {isActive ? (
                  <span className="inline-flex items-center gap-1 text-xs text-logo-primary font-semibold">
                    <Check className="w-3.5 h-3.5" />
                    {t("wizard.local.inUse")}
                  </span>
                ) : prog ? (
                  <span className="text-xs text-mid-gray tabular-nums">
                    {Math.round(prog.pct)}%
                  </span>
                ) : isInstalled ? (
                  <button
                    onClick={() => void handleUse(m.id)}
                    className="px-3.5 py-1.5 rounded-lg bg-logo-primary text-white text-xs font-semibold hover:brightness-110 transition cursor-pointer"
                  >
                    {t("wizard.local.use")}
                  </button>
                ) : (
                  <button
                    onClick={() => void handlePull(m.id)}
                    className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-lg border border-logo-primary/40 text-logo-primary text-xs font-semibold hover:bg-logo-primary/10 transition cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    {t("wizard.local.download2")}
                  </button>
                )}
              </div>
            </div>

            {prog && (
              <div className="mt-2.5">
                <div className="w-full h-1.5 bg-mid-gray/20 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-logo-primary rounded-full mm-bar-flow transition-all duration-300"
                    style={{ width: `${Math.max(3, prog.pct)}%` }}
                  />
                </div>
                <div className="text-[10px] text-mid-gray mt-1">
                  {prog.status}
                </div>
              </div>
            )}
          </div>
        );
      })}

      <p className="text-[11px] text-mid-gray/60 pt-1">
        {t("wizard.local.manualHint")}
      </p>
    </div>
  );
};

export default LocalLlmPanel;
