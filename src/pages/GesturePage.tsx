import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Hand,
  Mic,
  Loader2,
  CameraOff,
  ShieldCheck,
  Lightbulb,
} from "lucide-react";
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import { useGestureStore } from "@/stores/gestureStore";

const SENS_MIN = 0.6;
const SENS_MAX = 1.4;
const REC = "#34d399"; // 录音中
const CALM = "#7c93b5"; // 待命

// 自绘「火柴人」：单一颜色、粗圆四肢、圆脑袋、大关节点。
function drawStickFigure(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  lm: NormalizedLandmark[],
  color: string,
) {
  const W = canvas.width;
  const H = canvas.height;
  type Pt = { x: number; y: number; v: number } | null;
  const P = (i: number): Pt =>
    lm[i] ? { x: lm[i].x * W, y: lm[i].y * H, v: lm[i].visibility ?? 0 } : null;
  const vis = (p: Pt): p is { x: number; y: number; v: number } =>
    !!p && p.v > 0.5;
  const mid = (a: Pt, b: Pt): Pt =>
    a && b
      ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, v: Math.min(a.v, b.v) }
      : null;

  const nose = P(0),
    earL = P(7),
    earR = P(8),
    shL = P(11),
    shR = P(12),
    elL = P(13),
    elR = P(14),
    wrL = P(15),
    wrR = P(16),
    hipL = P(23),
    hipR = P(24),
    knL = P(25),
    knR = P(26),
    anL = P(27),
    anR = P(28);
  const shM = mid(shL, shR);
  const hipM = mid(hipL, hipR);

  const thick = Math.max(12, W * 0.026);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = thick;
  ctx.shadowColor = color;
  ctx.shadowBlur = thick * 0.9;

  const seg = (a: Pt, b: Pt) => {
    if (vis(a) && vis(b)) {
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  };
  seg(shL, shR);
  seg(shM, hipM);
  seg(hipL, hipR);
  seg(shM, nose);
  seg(shL, elL);
  seg(elL, wrL);
  seg(shR, elR);
  seg(elR, wrR);
  seg(hipL, knL);
  seg(knL, anL);
  seg(hipR, knR);
  seg(knR, anR);

  const jr = thick * 0.5;
  const joint = (p: Pt) => {
    if (vis(p)) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, jr, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  [shL, shR, elL, elR, wrL, wrR, hipL, hipR, knL, knR, anL, anR].forEach(joint);

  if (vis(nose)) {
    let hr = thick * 1.7;
    let cx = nose.x;
    let cy = nose.y;
    if (vis(earL) && vis(earR)) {
      hr = Math.max(hr, Math.hypot(earL.x - earR.x, earL.y - earR.y) * 0.75);
      cx = (earL.x + earR.x) / 2;
      cy = (earL.y + earR.y) / 2;
    }
    ctx.beginPath();
    ctx.arc(cx, cy, hr, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.shadowBlur = 0;
}

export const GesturePage: React.FC = () => {
  const { t } = useTranslation();
  const enabled = useGestureStore((s) => s.enabled);
  const status = useGestureStore((s) => s.status);
  const error = useGestureStore((s) => s.error);
  const fps = useGestureStore((s) => s.fps);
  const sensitivity = useGestureStore((s) => s.sensitivity);
  const setEnabled = useGestureStore((s) => s.setEnabled);
  const setSensitivity = useGestureStore((s) => s.setSensitivity);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hasPerson, setHasPerson] = useState(false);
  const armed = status === "armed";

  // 只渲染骨架「火柴人」，颜色随录音状态而非手的瞬时位置（录音中常绿）。
  useEffect(() => {
    if (!enabled) {
      setHasPerson(false);
      return;
    }
    let raf = 0;
    let last = false;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const draw = () => {
      raf = requestAnimationFrame(draw);
      const lm = useGestureStore.getState().landmarks;
      const present = !!lm;
      if (present !== last) {
        last = present;
        setHasPerson(present);
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (!lm) return;
      const rec = useGestureStore.getState().status === "armed";
      drawStickFigure(ctx, canvas, lm, rec ? REC : CALM);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [enabled]);

  const chip =
    status === "starting"
      ? { dot: "bg-amber-400", label: t("gesture.status.starting") }
      : armed
        ? { dot: "bg-emerald-400 animate-pulse", label: t("gesture.status.armed") }
        : { dot: "bg-white/40", label: t("gesture.status.idle") };

  const errorMsg =
    error === "camera_denied"
      ? t("gesture.error.denied")
      : error === "camera_missing"
        ? t("gesture.error.missing")
        : error === "camera_busy"
          ? t("gesture.error.busy")
          : error;

  const steps = [
    { icon: <Hand className="w-4 h-4" />, title: t("gesture.howUp.title"), desc: t("gesture.howUp.desc") },
    { icon: <Mic className="w-4 h-4" />, title: t("gesture.howDown.title"), desc: t("gesture.howDown.desc") },
  ];

  return (
    <div className="max-w-3xl w-full mx-auto p-6 space-y-6">
      {/* 标题 + 主开关 */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-2xl grid place-items-center bg-gradient-to-br from-logo-primary/20 to-logo-primary/[0.04] text-logo-primary border border-logo-primary/15 shrink-0">
            <Hand className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-text tracking-tight">
              {t("gesture.title")}
            </h1>
            <p className="text-sm text-mid-gray mt-1 max-w-md leading-relaxed">
              {t("gesture.subtitle")}
            </p>
          </div>
        </div>
        <button
          onClick={() => setEnabled(!enabled)}
          role="switch"
          aria-checked={enabled}
          className={`relative w-[52px] h-7 rounded-full transition-colors shrink-0 cursor-pointer mt-1 ${
            enabled ? "bg-logo-primary" : "bg-mid-gray/25"
          }`}
        >
          <span
            className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow-md transition-all ${
              enabled ? "left-[26px]" : "left-1"
            }`}
          />
        </button>
      </div>

      {/* 预览：骨架火柴人 */}
      <div
        className={`relative rounded-3xl overflow-hidden border transition-all duration-500 ${
          armed
            ? "border-emerald-400/30 shadow-[0_24px_70px_-28px_rgba(52,211,153,0.45)]"
            : "border-white/5 shadow-[0_20px_60px_-30px_rgba(0,0,0,0.6)]"
        }`}
      >
        <div
          className="relative aspect-video"
          style={{
            background:
              "radial-gradient(130% 120% at 50% -10%, #1a2130 0%, #0b0e14 72%)",
          }}
        >
          <canvas
            ref={canvasRef}
            width={640}
            height={480}
            className="absolute inset-0 w-full h-full object-contain"
            style={{ transform: "scaleX(-1)" }}
          />

          {enabled && status !== "error" && (
            <div className="absolute top-4 left-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.07] backdrop-blur-md border border-white/10 text-xs font-medium text-white/90">
              <span className={`w-2 h-2 rounded-full ${chip.dot}`} />
              {chip.label}
              {fps > 0 && (
                <span className="text-white/35 tabular-nums">{fps}fps</span>
              )}
            </div>
          )}

          {armed && (
            <div className="absolute top-4 right-4 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-400/25 text-[11px] font-semibold tracking-widest text-emerald-300">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              REC
            </div>
          )}

          {enabled && status !== "error" && !hasPerson && (
            <div className="absolute inset-0 grid place-items-center pointer-events-none">
              <p className="text-white/35 text-sm">{t("gesture.noPerson")}</p>
            </div>
          )}

          {!enabled && (
            <div className="absolute inset-0 grid place-items-center text-center px-6">
              <div>
                <div className="w-14 h-14 rounded-2xl grid place-items-center bg-white/[0.06] border border-white/10 text-white/70 mx-auto mb-3">
                  <Hand className="w-7 h-7" />
                </div>
                <p className="text-white/70 text-sm max-w-xs mx-auto leading-relaxed">
                  {t("gesture.previewOffHint")}
                </p>
                <button
                  onClick={() => setEnabled(true)}
                  className="mt-4 px-5 py-2 rounded-xl bg-logo-primary text-white text-sm font-semibold hover:brightness-110 transition cursor-pointer"
                >
                  {t("gesture.enable")}
                </button>
              </div>
            </div>
          )}

          {enabled && status === "error" && (
            <div className="absolute inset-0 grid place-items-center text-center px-6 bg-black/55 backdrop-blur-sm">
              <div>
                <CameraOff className="w-8 h-8 text-red-400 mx-auto mb-2" />
                <p className="text-white/90 text-sm max-w-sm mx-auto leading-relaxed">
                  {errorMsg}
                </p>
                <button
                  onClick={() => {
                    setEnabled(false);
                    setTimeout(() => setEnabled(true), 150);
                  }}
                  className="mt-4 px-4 py-2 rounded-xl border border-white/25 text-white text-sm font-medium hover:bg-white/10 transition cursor-pointer"
                >
                  {t("gesture.retry")}
                </button>
              </div>
            </div>
          )}

          {enabled && status === "starting" && (
            <div className="absolute inset-0 grid place-items-center pointer-events-none">
              <Loader2 className="w-6 h-6 text-white/50 animate-spin" />
            </div>
          )}
        </div>
      </div>

      {/* 操作方式（两步） */}
      <div className="grid grid-cols-2 gap-3">
        {steps.map((s, i) => (
          <div
            key={i}
            className="rounded-2xl border border-mid-gray/12 bg-background/40 p-4 flex items-start gap-3"
          >
            <div className="relative shrink-0">
              <div className="w-9 h-9 rounded-xl grid place-items-center bg-logo-primary/10 text-logo-primary">
                {s.icon}
              </div>
              <span className="absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full bg-background border border-mid-gray/20 grid place-items-center text-[10px] font-bold text-text/70">
                {i + 1}
              </span>
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-text">{s.title}</div>
              <div className="text-xs text-mid-gray mt-0.5 leading-snug">
                {s.desc}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 提示 */}
      <div className="flex items-start gap-2.5 px-1">
        <Lightbulb className="w-4 h-4 text-logo-primary mt-0.5 shrink-0" />
        <span className="text-sm text-mid-gray leading-relaxed">
          {t("gesture.tip")}
        </span>
      </div>

      {/* 灵敏度 */}
      <div className="rounded-2xl border border-mid-gray/12 bg-background/40 p-5">
        <div className="flex items-center justify-between gap-4 mb-3">
          <div className="text-sm font-medium text-text">
            {t("gesture.sensitivity")}
          </div>
          <div className="text-xs text-mid-gray tabular-nums px-2 py-0.5 rounded-md bg-mid-gray/8">
            {sensitivity.toFixed(2)}
          </div>
        </div>
        <input
          type="range"
          min={SENS_MIN}
          max={SENS_MAX}
          step={0.05}
          value={sensitivity}
          onChange={(e) => setSensitivity(parseFloat(e.target.value))}
          className="w-full accent-logo-primary cursor-pointer"
        />
        <div className="flex justify-between text-[11px] text-mid-gray/55 mt-1.5">
          <span>{t("gesture.sensLow")}</span>
          <span>{t("gesture.sensHigh")}</span>
        </div>
      </div>

      {/* 隐私 */}
      <div className="flex items-center gap-2 text-xs text-mid-gray/80 px-1">
        <ShieldCheck className="w-4 h-4 text-emerald-500/80 shrink-0" />
        {t("gesture.privacy")}
      </div>
    </div>
  );
};

export default GesturePage;
