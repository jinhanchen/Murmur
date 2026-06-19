import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { listen } from "@tauri-apps/api/event";
import { Mic, Check, Quote, RotateCcw } from "lucide-react";
import { useSettings } from "../../../../hooks/useSettings";
import { useOsType } from "../../../../hooks/useOsType";
import { formatKeyCombination } from "../../../../lib/utils/keyboard";

interface TutorialStepProps {
  onFinish: () => void;
  onBack?: () => void;
}

type Phase = "idle" | "listening" | "processing" | "done";

const BAR_COUNT = 15;

// 键盘按下状态
interface KbState {
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  alt: boolean;
  codes: Set<string>;
}
const EMPTY_KB: KbState = {
  ctrl: false,
  meta: false,
  shift: false,
  alt: false,
  codes: new Set(),
};

const MOD_BASE: Record<string, string> = {
  ctrl: "Control",
  control: "Control",
  shift: "Shift",
  alt: "Alt",
  option: "Alt",
  super: "Meta",
  meta: "Meta",
  win: "Meta",
  cmd: "Meta",
  command: "Meta",
  windows: "Meta",
};

// 某个快捷键片段当前是否被按住（精确到左右键）。
const isPartHeld = (rawPart: string, kb: KbState): boolean => {
  let side = "";
  let norm = rawPart.toLowerCase().trim();
  if (norm.endsWith("_left")) {
    side = "Left";
    norm = norm.slice(0, -5);
  } else if (norm.endsWith("_right")) {
    side = "Right";
    norm = norm.slice(0, -6);
  }

  const base = MOD_BASE[norm];
  if (base) {
    if (side) return kb.codes.has(base + side);
    if (kb.codes.has(base + "Left") || kb.codes.has(base + "Right")) return true;
    if (base === "Control") return kb.ctrl;
    if (base === "Meta") return kb.meta;
    if (base === "Shift") return kb.shift;
    if (base === "Alt") return kb.alt;
    return false;
  }
  if (norm === "space") return kb.codes.has("Space");
  if (/^[a-z]$/.test(norm)) return kb.codes.has("Key" + norm.toUpperCase());
  if (/^[0-9]$/.test(norm)) return kb.codes.has("Digit" + norm);
  return kb.codes.has(rawPart);
};

export const TutorialStep: React.FC<TutorialStepProps> = ({
  onFinish,
  onBack,
}) => {
  const { t } = useTranslation();
  const { getSetting } = useSettings();
  const osType = useOsType();

  const pushToTalk = Boolean(getSetting("push_to_talk"));
  const binding =
    getSetting("bindings")?.transcribe?.current_binding || "ctrl+space";
  const keyParts = useMemo(() => {
    const raw = binding.split("+");
    const labels = formatKeyCombination(binding, osType).split(" + ");
    return raw.map((rawPart, i) => ({
      raw: rawPart,
      label: labels[i] ?? rawPart,
    }));
  }, [binding, osType]);

  const [phase, setPhase] = useState<Phase>("idle");
  const [value, setValue] = useState("");
  const [levels, setLevels] = useState<number[]>(Array(BAR_COUNT).fill(0));
  const [kb, setKb] = useState<KbState>(EMPTY_KB);
  const completed = value.trim().length > 0;

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const endTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 光标放进输入框：真实转写文字才会粘到这里。
  useEffect(() => {
    const id = setTimeout(() => textareaRef.current?.focus(), 200);
    return () => clearTimeout(id);
  }, []);

  // 追踪键盘按下状态 → 驱动快捷键高亮。
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      setKb((prev) => {
        const codes = new Set(prev.codes);
        codes.add(e.code);
        return {
          ctrl: e.ctrlKey,
          meta: e.metaKey,
          shift: e.shiftKey,
          alt: e.altKey,
          codes,
        };
      });
    };
    const up = (e: KeyboardEvent) => {
      setKb((prev) => {
        const codes = new Set(prev.codes);
        codes.delete(e.code);
        return {
          ctrl: e.ctrlKey,
          meta: e.metaKey,
          shift: e.shiftKey,
          alt: e.altKey,
          codes,
        };
      });
    };
    // 失焦时清空，避免漏掉 keyup（如 Win 键唤起开始菜单）导致一直亮着。
    const clear = () => setKb({ ...EMPTY_KB, codes: new Set() });
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", clear);
    };
  }, []);

  // 监听真实麦克风电平：用户一开口，声波就是他自己的声音。
  useEffect(() => {
    const un = listen<number[]>("mic-level", (e) => {
      const payload = (e.payload as number[]) || [];
      setLevels(
        Array(BAR_COUNT)
          .fill(0)
          .map((_, i) =>
            payload.length ? (payload[i % payload.length] ?? 0) : 0,
          ),
      );
      setPhase((p) => (p === "done" ? p : "listening"));
      if (endTimer.current) clearTimeout(endTimer.current);
      endTimer.current = setTimeout(() => {
        setLevels(Array(BAR_COUNT).fill(0));
        setPhase((p) =>
          p === "listening"
            ? textareaRef.current?.value.trim()
              ? "done"
              : "processing"
            : p,
        );
      }, 600);
    });
    return () => {
      un.then((f) => f());
      if (endTimer.current) clearTimeout(endTimer.current);
    };
  }, []);

  useEffect(() => {
    if (completed) setPhase("done");
  }, [completed]);

  const reset = () => {
    setValue("");
    setPhase("idle");
    setLevels(Array(BAR_COUNT).fill(0));
    textareaRef.current?.focus();
  };

  const listening = phase === "listening";
  const statusText = listening
    ? t("wizard.tutorial.status.listening")
    : phase === "processing"
      ? t("wizard.tutorial.status.processing")
      : completed
        ? t("wizard.tutorial.status.done")
        : t("wizard.tutorial.status.idle");

  return (
    <div className="mm-step flex flex-col px-8 py-6 min-h-[460px]">
      <div className="text-center mb-3 shrink-0">
        <h2 className="text-2xl font-bold text-text">
          {t("wizard.tutorial.title")}
        </h2>
        <p className="text-mid-gray text-sm mt-1">
          {t("wizard.tutorial.subtitle")}
        </p>
      </div>

      {/* 朗读任务 */}
      <div className="shrink-0 rounded-2xl border border-logo-primary/25 bg-logo-primary/5 px-4 py-3 flex gap-3">
        <Quote className="w-4 h-4 text-logo-primary shrink-0 mt-0.5" />
        <div>
          <div className="text-[11px] font-semibold text-logo-primary mb-0.5">
            {t("wizard.tutorial.readTaskLabel")}
          </div>
          <p className="text-[15px] text-text leading-relaxed font-medium">
            {t("wizard.tutorial.readTask")}
          </p>
        </div>
      </div>

      {/* 互动舞台 */}
      <div className="relative rounded-2xl border border-mid-gray/15 bg-background/70 overflow-hidden shrink-0 mt-3">
        <div className="mm-grid opacity-50" />
        <div className="relative px-6 py-4 flex flex-col items-center gap-3.5">
          {/* 快捷键：按住即亮蓝 */}
          <div className="flex items-center gap-2">
            {keyParts.map((k, i) => {
              // 主判据 = 真实键盘状态；按住说话录音中（PTT）必然按着，作兜底。
              const held = isPartHeld(k.raw, kb) || (listening && pushToTalk);
              return (
                <React.Fragment key={i}>
                  {i > 0 && (
                    <span className="text-mid-gray text-sm font-medium">+</span>
                  )}
                  <span className="relative">
                    {held && (
                      <span className="absolute -inset-1 rounded-xl bg-logo-primary/30 blur-md" />
                    )}
                    <kbd
                      className={`relative block px-4 py-2 rounded-xl text-sm font-bold border transition-all duration-100 ${
                        held
                          ? "bg-gradient-to-b from-logo-primary to-logo-primary/80 text-white border-logo-primary translate-y-0.5 shadow-[0_0_20px_-2px] shadow-logo-primary/60 scale-105"
                          : "bg-mid-gray/8 text-text/70 border-mid-gray/25"
                      }`}
                    >
                      {k.label}
                    </kbd>
                  </span>
                </React.Fragment>
              );
            })}
            <span className="text-xs text-mid-gray ml-1.5">
              {t("wizard.tutorial.holdToTalk")}
            </span>
          </div>

          {/* 麦克风 + 实时声波 */}
          <div className="flex items-center gap-3">
            <div
              className={`relative w-10 h-10 rounded-full grid place-items-center transition-all duration-300 ${
                listening
                  ? "bg-logo-primary text-white shadow-lg shadow-logo-primary/40 scale-110"
                  : completed
                    ? "bg-emerald-500 text-white"
                    : "bg-mid-gray/15 text-mid-gray"
              }`}
            >
              {listening && (
                <span className="mm-ping absolute inset-0 rounded-full border border-logo-primary/40" />
              )}
              {completed ? (
                <Check className="w-5 h-5" />
              ) : (
                <Mic className="w-4.5 h-4.5" />
              )}
            </div>
            <div className="flex items-end gap-1 h-7">
              {levels.map((lv, i) => (
                <span
                  key={i}
                  className={`w-1 rounded-full transition-[height] duration-100 ${
                    listening ? "bg-logo-primary" : "bg-mid-gray/25"
                  }`}
                  style={{ height: `${Math.max(4, Math.min(28, lv * 28))}px` }}
                />
              ))}
            </div>
          </div>

          <div
            className={`text-sm font-medium ${
              listening
                ? "text-logo-primary"
                : completed
                  ? "text-emerald-500"
                  : "text-mid-gray"
            }`}
          >
            {statusText}
          </div>

          {/* 真实输入框：转写文字会粘进来 */}
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={t("wizard.tutorial.placeholder")}
            rows={2}
            className="w-full max-w-md rounded-xl border border-mid-gray/20 bg-background px-3.5 py-2.5 text-sm text-text resize-none outline-none focus:border-logo-primary/60 focus:ring-2 focus:ring-logo-primary/20 transition cursor-text"
          />
        </div>
      </div>

      {/* 成功反馈 / 提示 */}
      {completed ? (
        <div className="mm-rise mt-3 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-2.5 flex items-center gap-3 shrink-0">
          <div className="w-8 h-8 rounded-full grid place-items-center bg-emerald-400/20 text-emerald-500 shrink-0">
            <Check className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-text">
              {t("wizard.tutorial.successTitle")}
            </div>
            <div className="text-xs text-mid-gray">
              {t("wizard.tutorial.successHint")}
            </div>
          </div>
          <button
            onClick={reset}
            className="inline-flex items-center gap-1 text-xs text-mid-gray hover:text-text transition cursor-pointer shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            {t("wizard.tutorial.tryAgain")}
          </button>
        </div>
      ) : (
        <div className="mt-3 text-center text-[11px] text-mid-gray shrink-0">
          {t("wizard.tutorial.noSoundHint")}
        </div>
      )}

      {/* 底部 */}
      <div className="flex items-center justify-between gap-3 mt-auto pt-3 shrink-0">
        {onBack ? (
          <button
            onClick={onBack}
            className="px-5 py-2.5 rounded-xl border border-mid-gray/25 text-text/80 font-medium hover:bg-mid-gray/10 transition-colors cursor-pointer"
          >
            {t("wizard.back")}
          </button>
        ) : (
          <span />
        )}
        <button
          onClick={onFinish}
          className={`px-8 py-2.5 rounded-xl font-semibold shadow-lg transition-all cursor-pointer ${
            completed
              ? "bg-emerald-500 text-white shadow-emerald-500/30 hover:brightness-110 hover:scale-[1.02]"
              : "bg-logo-primary text-white shadow-logo-primary/30 hover:brightness-110"
          }`}
        >
          {completed
            ? t("wizard.tutorial.finishDone")
            : t("wizard.tutorial.finish")}
        </button>
      </div>
    </div>
  );
};

export default TutorialStep;
