import { listen } from "@tauri-apps/api/event";
import React, { useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import "./RecordingOverlay.css";
import { commands } from "@/bindings";
import { invoke } from "@tauri-apps/api/core";
import i18n, { syncLanguageFromSettings } from "@/i18n";
import { getLanguageDirection } from "@/lib/utils/rtl";

type OverlayState =
  | "recording"
  | "transcribing"
  | "processing"
  | "cancelling"
  | "cancelled";

const BAR_COUNT = 11;

const RecordingOverlay: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [state, setState] = useState<OverlayState>("recording");
  const [levels, setLevels] = useState<number[]>(Array(BAR_COUNT).fill(0));
  const smoothedLevelsRef = useRef<number[]>(Array(16).fill(0));
  // Mirror of isVisible readable inside the (once-registered) event listeners.
  const visibleRef = useRef(false);
  const direction = getLanguageDirection(i18n.language);

  useEffect(() => {
    visibleRef.current = isVisible;
  }, [isVisible]);

  // Cancel feedback auto-fades: "转录已取消" lingers briefly then hides; "正在取消…"
  // has a longer safety net in case the backend confirmation never arrives.
  useEffect(() => {
    if (state === "cancelled") {
      const t = setTimeout(() => setIsVisible(false), 1200);
      return () => clearTimeout(t);
    }
    if (state === "cancelling") {
      const t = setTimeout(() => setIsVisible(false), 2500);
      return () => clearTimeout(t);
    }
  }, [state]);

  useEffect(() => {
    const setupEventListeners = async () => {
      // Single source of truth for visibility: these events drive the frontend
      // opacity. The native window stays mapped (never natively hidden), so there's
      // no native show/hide race; real start/stop events are seconds apart, so no
      // ordering race either. Hence: no seq, no generation guards — just reflect it.
      const unlistenShow = await listen("show-overlay", (event) => {
        const payload = event.payload as OverlayState;
        void invoke("overlay_ack", { label: `show:${payload}` });
        // "cancelled" is a confirmation, not a fresh activation: only honor it when
        // the capsule was actually showing something. Idle? Ignore — stay hidden.
        if (payload === "cancelled" && !visibleRef.current) return;
        setState(payload);
        setIsVisible(true);
        void syncLanguageFromSettings();
      });

      const unlistenHide = await listen("hide-overlay", () => {
        void invoke("overlay_ack", { label: "hide" });
        setIsVisible(false);
      });

      const unlistenLevel = await listen<number[]>("mic-level", (event) => {
        const newLevels = event.payload as number[];
        const smoothed = smoothedLevelsRef.current.map((prev, i) => {
          const target = newLevels[i] || 0;
          return prev * 0.7 + target * 0.3;
        });
        smoothedLevelsRef.current = smoothed;
        setLevels(smoothed.slice(0, BAR_COUNT));
      });

      // Heartbeat: if these stop appearing in the log after a paste, the whole
      // overlay webview/component has died (not just the listeners). vis= reveals
      // WebView2 occlusion: if it flips to "hidden" after a paste, the compositor
      // suspended rendering (capsule can't paint even though JS runs).
      const heartbeat = setInterval(() => {
        void invoke("overlay_ack", {
          label: `heartbeat vis=${document.visibilityState}`,
        });
      }, 3000);

      // Fires the instant WebView2 marks the page occluded/visible — the decisive
      // signal for "capsule won't reappear after paste".
      const onVisibility = () => {
        void invoke("overlay_ack", {
          label: `visibilitychange → ${document.visibilityState}`,
        });
      };
      document.addEventListener("visibilitychange", onVisibility);

      return () => {
        unlistenShow();
        unlistenHide();
        unlistenLevel();
        clearInterval(heartbeat);
        document.removeEventListener("visibilitychange", onVisibility);
      };
    };

    setupEventListeners();
  }, []);

  const isRecording = state === "recording";
  const isCancelState = state === "cancelling" || state === "cancelled";

  return (
    <div
      dir={direction}
      className={`recording-overlay ${isVisible ? "fade-in" : ""}`}
    >
      {isRecording ? (
        <>
          {/* 左：取消 → 立即关闭、不做任何处理 */}
          <button
            className="cap-btn cancel"
            title={i18n.t("capsule.cancel")}
            onClick={() => {
              setState("cancelling");
              void commands.cancelOperation();
            }}
          >
            <X size={15} strokeWidth={3} />
          </button>

          {/* 中：声波 */}
          <div className="overlay-middle">
            <div className="bars-container">
              {levels.map((v, i) => (
                <div
                  key={i}
                  className="bar"
                  style={{
                    height: `${Math.min(24, 3 + Math.pow(v, 0.7) * 21)}px`,
                    opacity: Math.max(0.35, Math.min(1, v * 1.8)),
                  }}
                />
              ))}
            </div>
          </div>

          {/* 右：确认 → 停止录音并转录 */}
          <button
            className="cap-btn confirm"
            title={i18n.t("capsule.confirmTranscribe")}
            onClick={() => commands.stopMurmurKeysRecording()}
          >
            <Check size={15} strokeWidth={3} />
          </button>
        </>
      ) : isCancelState ? (
        /* 取消反馈：先“正在取消…”，后端确认真正取消后变“转录已取消” */
        <div className="overlay-status">
          {state === "cancelling"
            ? i18n.t("capsule.cancelling")
            : i18n.t("capsule.cancelled")}
        </div>
      ) : (
        /* 转录中：从左到右的进度条 */
        <div className="overlay-progress">
          <div className="progress-track">
            <div className="progress-fill" />
          </div>
        </div>
      )}
    </div>
  );
};

export default RecordingOverlay;
