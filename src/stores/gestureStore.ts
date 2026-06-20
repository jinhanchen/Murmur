import { create } from "zustand";
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

// 手势模式（摄像头 + 人体骨架）的 UI 状态 + 偏好。
// 偏好存 localStorage（纯前端，无需改 Rust settings）。
export type GestureStatus = "off" | "starting" | "idle" | "armed" | "error";
export type ModelStatus = "absent" | "downloading" | "ready" | "error";

const LS_UNLOCKED = "murmur_gesture_unlocked";
const LS_ENABLED = "murmur_gesture_enabled";
const LS_SENS = "murmur_gesture_sensitivity";

const readBool = (k: string): boolean => {
  try {
    return localStorage.getItem(k) === "1";
  } catch {
    return false;
  }
};
const readSens = (): number => {
  try {
    const v = parseFloat(localStorage.getItem(LS_SENS) || "");
    return Number.isFinite(v) ? v : 0.9;
  } catch {
    return 0.9;
  }
};

interface GestureState {
  /** 实验性功能是否已解锁（模型已下载）。控制侧栏标签是否出现。 */
  unlocked: boolean;
  /** 模型下载状态。 */
  modelStatus: ModelStatus;
  modelProgress: number;
  modelError: string | null;

  /** 摄像头检测是否运行（解锁后才有意义；常驻，即使切到别的应用）。 */
  enabled: boolean;
  status: GestureStatus;
  error: string | null;
  /** 当前帧：手是否在头边（原始判定，未经迟滞）。 */
  handNearHead: boolean;
  /** 当前帧的归一化骨架点（用于预览叠加）。 */
  landmarks: NormalizedLandmark[] | null;
  fps: number;
  /** 触发阈值：手腕到鼻子的距离 / 肩宽，越大越灵敏。 */
  sensitivity: number;
  /** 摄像头流变化计数，预览组件据此重新挂载。 */
  streamTick: number;

  setUnlocked: (v: boolean) => void;
  setEnabled: (v: boolean) => void;
  setSensitivity: (v: number) => void;
}

export const useGestureStore = create<GestureState>((set) => ({
  unlocked: readBool(LS_UNLOCKED),
  modelStatus: readBool(LS_UNLOCKED) ? "ready" : "absent",
  modelProgress: 0,
  modelError: null,

  enabled: readBool(LS_ENABLED),
  status: "off",
  error: null,
  handNearHead: false,
  landmarks: null,
  fps: 0,
  sensitivity: readSens(),
  streamTick: 0,

  setUnlocked: (v) => {
    try {
      localStorage.setItem(LS_UNLOCKED, v ? "1" : "0");
    } catch {
      /* ignore */
    }
    set({ unlocked: v });
  },
  setEnabled: (v) => {
    try {
      localStorage.setItem(LS_ENABLED, v ? "1" : "0");
    } catch {
      /* ignore */
    }
    set({ enabled: v });
  },
  setSensitivity: (v) => {
    try {
      localStorage.setItem(LS_SENS, String(v));
    } catch {
      /* ignore */
    }
    set({ sensitivity: v });
  },
}));

// 引擎/下载器侧写入用的薄封装，避免直接耦合 React。
export const gestureActions = {
  setStatus: (status: GestureStatus) => useGestureStore.setState({ status }),
  setError: (error: string | null) => useGestureStore.setState({ error }),
  setHandNearHead: (handNearHead: boolean) =>
    useGestureStore.setState({ handNearHead }),
  setLandmarks: (landmarks: NormalizedLandmark[] | null) =>
    useGestureStore.setState({ landmarks }),
  setFps: (fps: number) => useGestureStore.setState({ fps }),
  bumpStream: () =>
    useGestureStore.setState((s) => ({ streamTick: s.streamTick + 1 })),
  setModel: (modelStatus: ModelStatus, modelProgress = 0, modelError: string | null = null) =>
    useGestureStore.setState({ modelStatus, modelProgress, modelError }),
};
