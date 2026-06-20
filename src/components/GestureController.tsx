import { useEffect } from "react";
import { useGestureStore } from "@/stores/gestureStore";
import { gestureEngine } from "@/lib/gesture/engine";

/**
 * 常驻挂载于 App：实验性功能已解锁且检测开启时，让引擎持续运行（即便窗口
 * 最小化到托盘、用户在别的应用里），否则停掉摄像头。UI 页面只是它的可视化。
 */
export const GestureController: React.FC = () => {
  const unlocked = useGestureStore((s) => s.unlocked);
  const enabled = useGestureStore((s) => s.enabled);

  useEffect(() => {
    if (unlocked && enabled) void gestureEngine.start();
    else gestureEngine.stop();
  }, [unlocked, enabled]);

  return null;
};

export default GestureController;
