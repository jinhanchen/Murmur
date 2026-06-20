// 人体骨架模型按需下载 + 缓存（实验性功能开启时触发，不打进安装包）。
// MediaPipe 官方模型托管在 GCS，带 CORS，可直接在 WebView 里 fetch。
// 下完缓存到 Cache Storage，之后离线可用。
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
const CACHE_NAME = "murmur-gesture-models";
const CACHE_KEY = "pose_landmarker_lite_v1";

export async function isModelCached(): Promise<boolean> {
  try {
    const cache = await caches.open(CACHE_NAME);
    return !!(await cache.match(CACHE_KEY));
  } catch {
    return false;
  }
}

/**
 * 取模型字节：命中缓存直接返回；否则带进度下载并写入缓存。
 * onProgress 仅在服务器返回 content-length 时给出 0–100。
 */
export async function getModelBuffer(
  onProgress?: (pct: number) => void,
): Promise<Uint8Array> {
  const cache = await caches.open(CACHE_NAME).catch(() => null);

  if (cache) {
    const hit = await cache.match(CACHE_KEY);
    if (hit) return new Uint8Array(await hit.arrayBuffer());
  }

  const resp = await fetch(MODEL_URL);
  if (!resp.ok || !resp.body) {
    throw new Error(`HTTP ${resp.status}`);
  }

  const total = Number(resp.headers.get("content-length")) || 0;
  const reader = resp.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      received += value.length;
      if (total) onProgress?.(Math.round((received / total) * 100));
    }
  }

  const buf = new Uint8Array(received);
  let offset = 0;
  for (const c of chunks) {
    buf.set(c, offset);
    offset += c.length;
  }
  onProgress?.(100);

  if (cache) {
    try {
      await cache.put(
        CACHE_KEY,
        new Response(buf, {
          headers: { "content-type": "application/octet-stream" },
        }),
      );
    } catch {
      /* 缓存失败不致命，下次再下 */
    }
  }

  return buf;
}
