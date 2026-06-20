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

// 自绘「火柴人」：单一颜色、粗圆四肢、圆脑袋、大关节点。比 MediaPipe 细线骨架更有趣。
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
    a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, v: Math.min(a.v, b.v) } : null;

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

  const seg = (a: Pt, b: Pt) => {
    if (vis(a) && vis(b)) {
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  };
  // 躯干
  seg(shL, shR);
  seg(shM, hipM);
  seg(hipL, hipR);
  // 颈
  seg(shM, nose);
  // 手臂
  seg(shL, elL);
  seg(elL, wrL);
  seg(shR, elR);
  seg(elR, wrR);
  // 腿
  seg(hipL, knL);
  seg(knL, anL);
  seg(hipR, knR);
  seg(knR, anR);

  // 关节大圆点（填补转角，更圆润）
  const jr = thick * 0.5;
  const joint = (p: Pt) => {
    if (vis(p)) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, jr, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  [shL, shR, elL, elR, wrL, wrR, hipL, hipR, knL, knR, anL, anR].forEach(joint);

  // 圆脑袋
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

  // 只渲染骨架「火柴人」，不显示摄像头画面（无环境、更隐私）。
  // 镜像由 canvas 自身的 scaleX(-1) 处理 = 自拍视角。
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
      const near = useGestureStore.getState().handNearHead;
      drawStickFigure(ctx, canvas, lm, near ? "#22c55e" : "#5b8def");
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [enabled]);

  const statusChip = () => {
    if (!enabled)
      return { label: t("gesture.status.off"), cls: "bg-mid-gray/15 text-mid-gray", icon: <Hand className="w-4 h-4" /> };
    if (status === "error")
      return { label: t("gesture.status.error"), cls: "bg-red-500/15 text-red-500", icon: <CameraOff className="w-4 h-4" /> };
    if (status === "starting")
      return { label: t("gesture.status.starting"), cls: "bg-amber-400/15 text-amber-500", icon: <Loader2 className="w-4 h-4 animate-spin" /> };
    if (status === "armed")
      return { label: t("gesture.status.armed"), cls: "bg-red-500/15 text-red-500", icon: <Mic className="w-4 h-4" /> };
    return { label: t("gesture.status.idle"), cls: "bg-emerald-400/15 text-emerald-500", icon: <Hand className="w-4 h-4" /> };
  };
  const chip = statusChip();

  const errorMsg =
    error === "camera_denied"
      ? t("gesture.error.denied")
      : error === "camera_missing"
        ? t("gesture.error.missing")
        : error === "camera_busy"
          ? t("gesture.error.busy")
          : error;

  return (
    <div className="max-w-3xl w-full mx-auto p-6 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text flex items-center gap-2">
            <Hand className="w-6 h-6 text-logo-primary" />
            {t("gesture.title")}
          </h1>
          <p className="text-sm text-mid-gray mt-2 max-w-xl leading-relaxed">
            {t("gesture.subtitle")}
          </p>
        </div>
        {/* 主开关 */}
        <button
          onClick={() => setEnabled(!enabled)}
          role="switch"
          aria-checked={enabled}
          className={`relative w-14 h-8 rounded-full transition-colors shrink-0 cursor-pointer ${
            enabled ? "bg-logo-primary" : "bg-mid-gray/30"
          }`}
        >
          <span
            className={`absolute top-1 w-6 h-6 rounded-full bg-white shadow transition-all ${
              enabled ? "left-7" : "left-1"
            }`}
          />
        </button>
      </div>

      {/* 教程提示 */}
      <div className="rounded-xl border border-logo-primary/20 bg-logo-primary/5 px-4 py-3 flex items-start gap-2.5">
        <Lightbulb className="w-4 h-4 text-logo-primary mt-0.5 shrink-0" />
        <span className="text-sm text-text/80 leading-relaxed">
          {t("gesture.tip")}
        </span>
      </div>

      {/* 预览区 */}
      <div className="rounded-2xl border border-mid-gray/15 bg-background overflow-hidden">
        <div className="relative aspect-video bg-[#0d1015]">
          {/* 只画骨架火柴人，不显示摄像头画面。镜像 = 自拍视角 */}
          <canvas
            ref={canvasRef}
            width={640}
            height={480}
            className="absolute inset-0 w-full h-full object-contain"
            style={{ transform: "scaleX(-1)" }}
          />

          {/* 检测不到人 */}
          {enabled && status !== "error" && !hasPerson && (
            <div className="absolute inset-0 grid place-items-center pointer-events-none">
              <p className="text-white/40 text-sm">{t("gesture.noPerson")}</p>
            </div>
          )}

          {/* 未开启遮罩 */}
          {!enabled && (
            <div className="absolute inset-0 grid place-items-center text-center px-6">
              <div>
                <div className="w-14 h-14 rounded-2xl grid place-items-center bg-white/10 text-white/80 mx-auto mb-3">
                  <Hand className="w-7 h-7" />
                </div>
                <p className="text-white/80 text-sm max-w-xs mx-auto leading-relaxed">
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

          {/* 错误遮罩 */}
          {enabled && status === "error" && (
            <div className="absolute inset-0 grid place-items-center text-center px-6 bg-black/60">
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
                  className="mt-4 px-4 py-2 rounded-xl border border-white/30 text-white text-sm font-medium hover:bg-white/10 transition cursor-pointer"
                >
                  {t("gesture.retry")}
                </button>
              </div>
            </div>
          )}

          {/* 状态角标 */}
          {enabled && status !== "error" && (
            <div
              className={`absolute top-3 left-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold backdrop-blur ${chip.cls}`}
            >
              {chip.icon}
              {chip.label}
              {fps > 0 && <span className="opacity-60 tabular-nums">· {fps}fps</span>}
            </div>
          )}
        </div>

        {/* 操作说明 */}
        <div className="grid grid-cols-2 divide-x divide-mid-gray/10 border-t border-mid-gray/10">
          <div className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl grid place-items-center bg-emerald-400/15 text-emerald-500 shrink-0">
              <Hand className="w-5 h-5" />
            </div>
            <div className="text-xs text-mid-gray leading-snug">
              <div className="text-sm font-semibold text-text">
                {t("gesture.howUp.title")}
              </div>
              {t("gesture.howUp.desc")}
            </div>
          </div>
          <div className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl grid place-items-center bg-logo-primary/15 text-logo-primary shrink-0">
              <Mic className="w-5 h-5" />
            </div>
            <div className="text-xs text-mid-gray leading-snug">
              <div className="text-sm font-semibold text-text">
                {t("gesture.howDown.title")}
              </div>
              {t("gesture.howDown.desc")}
            </div>
          </div>
        </div>
      </div>

      {/* 灵敏度 */}
      <div className="rounded-2xl border border-mid-gray/15 bg-background p-4">
        <div className="flex items-center justify-between gap-4 mb-2">
          <div className="text-sm font-medium text-text">
            {t("gesture.sensitivity")}
          </div>
          <div className="text-xs text-mid-gray tabular-nums">
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
        <div className="flex justify-between text-[11px] text-mid-gray/60 mt-1">
          <span>{t("gesture.sensLow")}</span>
          <span>{t("gesture.sensHigh")}</span>
        </div>
      </div>

      {/* 隐私 */}
      <div className="flex items-center gap-2 text-xs text-mid-gray">
        <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
        {t("gesture.privacy")}
      </div>
    </div>
  );
};

export default GesturePage;
