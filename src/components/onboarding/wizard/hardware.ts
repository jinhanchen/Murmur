import { commands, type ModelInfo } from "@/bindings";

// 性能档位：决定推荐哪一档语音模型。
export type PerfTier = "high" | "balanced" | "basic";

export interface GpuInfo {
  id: number;
  name: string;
  vramMb: number;
}

export interface HardwareInfo {
  cpuCores: number | null;
  // 浏览器 deviceMemory 给的是约数（上限 8GB），ramApprox 标记其不精确。
  ramGb: number | null;
  ramApprox: boolean;
  gpus: GpuInfo[];
  bestVramMb: number;
  hasGpu: boolean;
  tier: PerfTier;
}

const computeTier = (bestVramMb: number, cpuCores: number | null): PerfTier => {
  if (bestVramMb >= 6000) return "high";
  if (bestVramMb >= 2000 || (cpuCores ?? 0) >= 8) return "balanced";
  return "basic";
};

// 纯前端硬件探测：复用后端已有的 GPU/VRAM 探测，CPU/RAM 走 WebView 自带 API。
export const detectHardware = async (): Promise<HardwareInfo> => {
  const cpuCores =
    typeof navigator !== "undefined" && navigator.hardwareConcurrency
      ? navigator.hardwareConcurrency
      : null;

  const deviceMemory = (navigator as unknown as { deviceMemory?: number })
    .deviceMemory;
  const ramGb = typeof deviceMemory === "number" ? deviceMemory : null;

  let gpus: GpuInfo[] = [];
  try {
    const accel = await commands.getAvailableAccelerators();
    gpus = (accel.gpu_devices ?? []).map((d) => ({
      id: d.id,
      name: d.name,
      vramMb: d.total_vram_mb,
    }));
  } catch (e) {
    console.warn("detectHardware: getAvailableAccelerators failed", e);
  }

  const bestVramMb = gpus.reduce((max, g) => Math.max(max, g.vramMb), 0);
  const hasGpu = gpus.length > 0;
  const tier = computeTier(bestVramMb, cpuCores);

  return {
    cpuCores,
    ramGb,
    ramApprox: ramGb !== null,
    gpus,
    bestVramMb,
    hasGpu,
    tier,
  };
};

export type RecommendReason = "current" | "tiered" | "fallback";

export interface Recommendation {
  model?: ModelInfo;
  reason: RecommendReason;
}

// 取语言基码：zh-Hans / zh_CN / zh → "zh"。
const baseLang = (code?: string | null): string | null => {
  if (!code) return null;
  const b = code.toLowerCase().split(/[-_]/)[0];
  return b || null;
};

// 解析用户的目标语言：转写语言优先，其次 UI 语言，最后浏览器语言。
export const resolveUserLang = (opts: {
  selectedLanguage?: string | null;
  appLanguage?: string | null;
}): string | null => {
  const { selectedLanguage, appLanguage } = opts;
  if (selectedLanguage && selectedLanguage !== "auto") {
    return baseLang(selectedLanguage);
  }
  if (appLanguage) return baseLang(appLanguage);
  if (typeof navigator !== "undefined" && navigator.language) {
    return baseLang(navigator.language);
  }
  return null;
};

const langMatches = (supported: string[], userBase: string): boolean =>
  supported.some((s) => baseLang(s) === userBase);

// 每档的「速度下限」：编码「硬件允许的范围」。
// 配置越弱 → 下限越高 → 逼出更快/更小的模型；配置越强 → 下限 0 → 让最精确的胜出。
const SPEED_FLOOR: Record<PerfTier, number> = {
  high: 0,
  balanced: 0.4,
  basic: 0.8,
};

// 推荐逻辑（分类讨论）：
// 1) 用户已有当前模型 → 推荐继续使用（最贴合 Franklin「推荐我目前用的」）。
// 2) 否则在「能转写用户语言」的模型里，按硬件档位挑——
//    在该档速度下限之上，取准确度最高的；同分再比速度。
//    即：在硬件允许的前提下，给最精确、最快的模型；绝不把纯英文模型推给中文用户。
export const recommendModel = (
  models: ModelInfo[],
  tier: PerfTier,
  opts: { currentModelId?: string | null; userLang?: string | null } = {},
): Recommendation => {
  const { currentModelId, userLang } = opts;

  // 1. 当前模型优先
  if (currentModelId) {
    const cur = models.find((m) => m.id === currentModelId);
    if (cur && cur.is_downloaded) return { model: cur, reason: "current" };
  }

  const pool = models.filter((m) => !m.is_custom);
  if (pool.length === 0) return { reason: "fallback" };

  // 2. 语言适配池（硬过滤）
  let langPool = userLang
    ? pool.filter((m) => langMatches(m.supported_languages, userLang))
    : // 语言未知：退而求其次，用覆盖最广的多语言模型（Whisper 系 99 语）。
      pool.filter((m) => m.supported_languages.length >= 10);
  if (langPool.length === 0) langPool = pool;

  // 3. 档位内：速度达标者中取最准；不足则放开下限兜底。
  const floor = SPEED_FLOOR[tier];
  let candidates = langPool.filter((m) => m.speed_score >= floor);
  if (candidates.length === 0) candidates = langPool;

  const best = [...candidates].sort(
    (a, b) =>
      b.accuracy_score - a.accuracy_score || b.speed_score - a.speed_score,
  )[0];

  return { model: best, reason: "tiered" };
};

// 语言适配判断（供 UI 排序「其他模型」用）。
export const isLangAppropriate = (
  model: ModelInfo,
  userLang: string | null,
): boolean => {
  if (!userLang) return model.supported_languages.length >= 10;
  return langMatches(model.supported_languages, userLang);
};

// 档位标签与文案改由消费组件用 t(`wizard.tier.${tier}`) / t(`wizard.tierBlurb.${tier}`) 翻译。

export const formatVram = (vramMb: number): string =>
  vramMb >= 1024 ? `${(vramMb / 1024).toFixed(1)} GB` : `${vramMb} MB`;

export const formatRam = (info: HardwareInfo): string | null => {
  if (info.ramGb === null) return null;
  // deviceMemory 上限 8GB，命中上限时用「≥」更诚实。
  return info.ramGb >= 8 ? "≥ 8 GB" : `${info.ramGb} GB`;
};
