import {
  FilesetResolver,
  PoseLandmarker,
  type NormalizedLandmark,
} from "@mediapipe/tasks-vision";
import { commands } from "@/bindings";
import { gestureActions, useGestureStore } from "@/stores/gestureStore";
import { getModelBuffer } from "./model";

// wasm 运行时本地打包；模型按需下载后缓存（实验性功能开启时）。推理全在本机。
const WASM_PATH = "/mediapipe/wasm";

// 人体骨架关键点索引（MediaPipe Pose）。
const NOSE = 0;
const SH_L = 11;
const SH_R = 12;
const WRIST_L = 15;
const WRIST_R = 16;

const DETECT_INTERVAL_MS = 55; // ~18fps，够灵敏又省 CPU
const ENTER_FRAMES = 3; // 连续命中才算「举手」（防抖）
const EXIT_FRAMES = 4; // 连续未命中才算「放下」（防抖）
const TRANSCRIBE_BINDING = "transcribe"; // 复用主转录绑定的整条管线

const visible = (p?: NormalizedLandmark): p is NormalizedLandmark =>
  !!p && (p.visibility ?? 0) > 0.5;

/**
 * 手势引擎（单例）：摄像头取流 → 人体骨架检测 → 「手在头边」判定 →
 * 驱动既有的按住说话/松手转录命令。开启后常驻运行，可在任意应用里隔空口述。
 */
class GestureEngine {
  private landmarker: PoseLandmarker | null = null;
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private raf = 0;
  private running = false;
  private lastDetect = 0;
  private pressed = false; // 当前是否处于「举手=按下」
  private enterCount = 0;
  private exitCount = 0;
  private recording = false; // 是否已发出 start 命令
  private fpsAnchor = 0;
  private fpsFrames = 0;

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    gestureActions.setStatus("starting");
    gestureActions.setError(null);
    try {
      await this.ensureLandmarker();
      await this.ensureCamera();
      gestureActions.setStatus("idle");
      this.raf = requestAnimationFrame(this.loop);
    } catch (e) {
      this.running = false;
      gestureActions.setStatus("error");
      gestureActions.setError(describeError(e));
      this.teardownCamera();
    }
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    // 安全收尾：若停在录音中，补一个松手，避免卡在录音态。
    if (this.recording) {
      commands.stopMurmurKeysRecording().catch(() => {});
    }
    this.pressed = false;
    this.recording = false;
    this.enterCount = 0;
    this.exitCount = 0;
    this.teardownCamera();
    gestureActions.setStatus("off");
    gestureActions.setLandmarks(null);
    gestureActions.setHandNearHead(false);
  }

  /** 供预览组件挂载画面。 */
  getStream(): MediaStream | null {
    return this.stream;
  }

  private async ensureLandmarker(): Promise<void> {
    if (this.landmarker) return;
    const fileset = await FilesetResolver.forVisionTasks(WASM_PATH);
    const modelAssetBuffer = await getModelBuffer();
    const opts = (delegate: "GPU" | "CPU") => ({
      baseOptions: { modelAssetBuffer, delegate },
      runningMode: "VIDEO" as const,
      numPoses: 1,
    });
    try {
      this.landmarker = await PoseLandmarker.createFromOptions(
        fileset,
        opts("GPU"),
      );
    } catch {
      // WebView 没有可用 GPU delegate 时回退 CPU。
      this.landmarker = await PoseLandmarker.createFromOptions(
        fileset,
        opts("CPU"),
      );
    }
  }

  private async ensureCamera(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
      audio: false,
    });
    const v = document.createElement("video");
    v.srcObject = this.stream;
    v.muted = true;
    v.playsInline = true;
    await v.play();
    this.video = v;
    gestureActions.bumpStream();
  }

  private teardownCamera(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (this.video) {
      this.video.srcObject = null;
      this.video = null;
    }
    gestureActions.bumpStream();
  }

  private loop = (): void => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.loop);

    const now = performance.now();
    if (now - this.lastDetect < DETECT_INTERVAL_MS) return;
    this.lastDetect = now;

    const v = this.video;
    if (!this.landmarker || !v || v.readyState < 2) return;

    let result;
    try {
      result = this.landmarker.detectForVideo(v, now);
    } catch {
      return;
    }

    this.fpsFrames++;
    if (now - this.fpsAnchor > 1000) {
      gestureActions.setFps(this.fpsFrames);
      this.fpsFrames = 0;
      this.fpsAnchor = now;
    }

    const lm = result?.landmarks?.[0] ?? null;
    gestureActions.setLandmarks(lm);
    this.update(lm ? this.computeNearHead(lm) : false);
  };

  /** 手腕到鼻子的距离（按肩宽归一，远近不影响）小于阈值 → 手在头边。 */
  private computeNearHead(lm: NormalizedLandmark[]): boolean {
    const nose = lm[NOSE];
    const shL = lm[SH_L];
    const shR = lm[SH_R];
    if (!visible(nose) || !visible(shL) || !visible(shR)) return false;

    const shoulderW = Math.hypot(shL.x - shR.x, shL.y - shR.y) || 1e-4;
    const threshold = useGestureStore.getState().sensitivity;
    const distOf = (w?: NormalizedLandmark) =>
      visible(w) ? Math.hypot(w.x - nose.x, w.y - nose.y) / shoulderW : Infinity;

    return Math.min(distOf(lm[WRIST_L]), distOf(lm[WRIST_R])) < threshold;
  }

  private update(near: boolean): void {
    gestureActions.setHandNearHead(near);
    if (near) {
      this.enterCount++;
      this.exitCount = 0;
    } else {
      this.exitCount++;
      this.enterCount = 0;
    }

    if (!this.pressed && this.enterCount >= ENTER_FRAMES) {
      this.pressed = true;
      void this.onPress();
    } else if (this.pressed && this.exitCount >= EXIT_FRAMES) {
      this.pressed = false;
      void this.onRelease();
    }
  }

  private async onPress(): Promise<void> {
    gestureActions.setStatus("armed");
    if (this.recording) return;
    this.recording = true;
    try {
      await commands.startMurmurKeysRecording(TRANSCRIBE_BINDING);
    } catch (e) {
      this.recording = false;
      gestureActions.setError(describeError(e));
    }
  }

  private async onRelease(): Promise<void> {
    gestureActions.setStatus(this.running ? "idle" : "off");
    if (!this.recording) return;
    this.recording = false;
    try {
      await commands.stopMurmurKeysRecording();
    } catch (e) {
      gestureActions.setError(describeError(e));
    }
  }
}

function describeError(e: unknown): string {
  if (e instanceof Error) {
    // 摄像头被拒/被占用的常见情形给更友好的提示。
    if (e.name === "NotAllowedError" || e.name === "PermissionDeniedError")
      return "camera_denied";
    if (e.name === "NotFoundError" || e.name === "DevicesNotFoundError")
      return "camera_missing";
    if (e.name === "NotReadableError" || e.name === "TrackStartError")
      return "camera_busy";
    return e.message;
  }
  return String(e);
}

export const gestureEngine = new GestureEngine();
