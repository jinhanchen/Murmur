import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { commands, type HistoryEntry } from "@/bindings";

// 估算常量（仅用于没有真实时长的旧记录兜底）。
const SPEAK_CPM = 240; // 说话约 240 字/分
const TYPE_CPM = 40; // 打字约 40 字/分

export interface DayBar {
  dow: number; // 0=周日 … 6=周六
  count: number; // 当天口述字数
}

export interface UsageStats {
  loading: boolean;
  totalWords: number; // 累计口述字数
  totalCount: number; // 转录条数
  speakSec: number; // 总口述时长（秒）—— 有真实时长的用真实，旧记录用估算
  savedSec: number; // 节省时间（秒）—— 打字估算 − 口述时长
  wpm: number; // 平均口述速度（字/分）—— 有真实时长则真实测量，否则估算常量
  hasRealTime: boolean; // 是否有任意真实时长记录（决定速度是否真实）
  allRealTime: boolean; // 是否全部记录都有真实时长（决定总时长是否还带"估算"）
  daily: DayBar[]; // 最近 7 天每天字数
  last30: { count: number; isToday: boolean }[]; // 最近 30 天每天字数（趋势）
  weekWords: number; // 最近 7 天字数合计
  todayWords: number; // 今日字数
  activeDays: number; // 最近 7 天里有活动的天数
  streak: number; // 截至今天的连续活跃天数
  lastText: string; // 最近一条转录文本
}

const EMPTY: UsageStats = {
  loading: true,
  totalWords: 0,
  totalCount: 0,
  speakSec: 0,
  savedSec: 0,
  wpm: SPEAK_CPM,
  hasRealTime: false,
  allRealTime: false,
  daily: [],
  last30: [],
  weekWords: 0,
  todayWords: 0,
  activeDays: 0,
  streak: 0,
  lastText: "",
};

const charsOf = (e: HistoryEntry): number =>
  [...(e.post_processed_text || e.transcription_text || "")].filter((c) =>
    c.trim(),
  ).length;

const dayKey = (d: Date): string =>
  `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

const tsToDate = (timestamp: number): Date =>
  new Date(timestamp < 1e12 ? timestamp * 1000 : timestamp);

const fetchAllEntries = async (): Promise<HistoryEntry[]> => {
  const all: HistoryEntry[] = [];
  let cursor: number | null = null;
  let more = true;
  let guard = 0;
  while (more && guard < 80) {
    const r = await commands.getHistoryEntries(cursor, 100);
    if (r.status !== "ok") break;
    all.push(...r.data.entries);
    more = r.data.has_more;
    cursor = all.length ? all[all.length - 1].id : null;
    guard++;
  }
  return all;
};

const compute = (entries: HistoryEntry[]): UsageStats => {
  const now = new Date();
  const days: { key: string; dow: number; count: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    days.push({ key: dayKey(d), dow: d.getDay(), count: 0 });
  }
  const days30: { key: string; count: number; isToday: boolean }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    days30.push({ key: dayKey(d), count: 0, isToday: i === 0 });
  }
  const todayK = dayKey(now);

  let totalWords = 0;
  let speakSec = 0;
  let realChars = 0;
  let realSec = 0;
  let realCount = 0;
  const activeKeys = new Set<string>();

  for (const e of entries) {
    const c = charsOf(e);
    totalWords += c;
    if (e.duration_ms != null) {
      const sec = e.duration_ms / 1000;
      speakSec += sec;
      realChars += c;
      realSec += sec;
      realCount += 1;
    } else {
      speakSec += (c / SPEAK_CPM) * 60; // 旧记录无真实时长 → 估算
    }
    const key = dayKey(tsToDate(e.timestamp));
    const bucket = days.find((x) => x.key === key);
    if (bucket) bucket.count += c;
    const bucket30 = days30.find((x) => x.key === key);
    if (bucket30) bucket30.count += c;
    if (c > 0) activeKeys.add(key);
  }

  const hasRealTime = realCount > 0;
  const allRealTime = entries.length > 0 && realCount === entries.length;
  // 平均口述速度：有真实时长就用真实测量（真字数 ÷ 真分钟），否则估算常量。
  const wpm =
    hasRealTime && realSec > 0
      ? Math.round(realChars / (realSec / 60))
      : SPEAK_CPM;
  const savedSec = Math.max(0, (totalWords / TYPE_CPM) * 60 - speakSec);

  const weekWords = days.reduce((s, d) => s + d.count, 0);
  const todayWords = days.find((d) => d.key === todayK)?.count ?? 0;

  // 连续活跃天数：从今天往回数，直到某天没有活动。
  let streak = 0;
  for (let i = 0; i < 365; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    if (activeKeys.has(dayKey(d))) streak += 1;
    else break;
  }

  const latest = entries[0];
  return {
    loading: false,
    totalWords,
    totalCount: entries.length,
    speakSec,
    savedSec,
    wpm,
    hasRealTime,
    allRealTime,
    daily: days.map((d) => ({ dow: d.dow, count: d.count })),
    last30: days30.map((d) => ({ count: d.count, isToday: d.isToday })),
    weekWords,
    todayWords,
    activeDays: days.filter((d) => d.count > 0).length,
    streak,
    lastText: latest?.post_processed_text || latest?.transcription_text || "",
  };
};

// 单例缓存：HomePage 与 Sidebar 同时挂载时只抓一次历史。
let cached: UsageStats | null = null;
let inflight: Promise<UsageStats> | null = null;
const subscribers = new Set<(s: UsageStats) => void>();

const load = async (force = false): Promise<UsageStats> => {
  if (!force && cached) return cached;
  if (!inflight) {
    inflight = fetchAllEntries()
      .then((entries) => {
        cached = compute(entries);
        subscribers.forEach((fn) => fn(cached!));
        return cached;
      })
      .catch((e) => {
        console.error("useUsageStats load failed", e);
        cached = { ...EMPTY, loading: false };
        return cached;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
};

let listening = false;
const ensureLiveRefresh = () => {
  if (listening) return;
  listening = true;
  // 新转录写入历史时刷新（后端 HistoryUpdatePayload 事件）。
  void listen("history-update-payload", () => void load(true));
};

export const useUsageStats = (): UsageStats => {
  const [stats, setStats] = useState<UsageStats>(cached ?? EMPTY);

  useEffect(() => {
    subscribers.add(setStats);
    ensureLiveRefresh();
    void load().then(setStats);
    return () => {
      subscribers.delete(setStats);
    };
  }, []);

  return stats;
};
