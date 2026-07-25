/**
 * P0-0 storage 层（重构）
 *
 * spec: notes/daily-book/p0-0-storage-migration-spec.md
 *
 * API surface（id-based）：
 *   - 已读：markAsRead / isRead / unmarkAsRead / getReads
 *   - 收藏：isFavorited / toggleFavorite / getFavorites
 *   - 想读：isWanted / toggleWant / getWants
 *
 * 事件：
 *   - `daily-book:storage:changed` (CustomEvent<StorageChangedDetail>)
 *   - action: 'add' | 'remove' | 'migrate' | 'clear' | 'sync'
 *     - 'sync' 由 initStorageBroadcast() 转发 native storage 事件专用，
 *       消费方应全量 refetch，不与本 tab 的 add/remove 混淆（spec §4.1 / M1 修补）。
 *
 * 跨 tab 同步：initStorageBroadcast() 监听 native `storage` 事件 → 转发为
 * `daily-book:storage:changed`（key 前缀匹配 `daily-book:`，emit `action: 'sync'`）。
 */

import { books } from "../data/books";
import { runStorageMigrationIfNeeded } from "./storage-migration";

// ==================== 单点常量（spec §4.2 / M7 建议）====================
// 未来加 daily-book:notes / daily-book:highlights 时只改这一处。
// type union / broadcast 白名单 / 消费方 filter 全 derive 自此。
export const KNOWN_STORAGE_KEYS = ["reads", "favorites", "wants", "quotes", "read-at"] as const;
export type StorageKey = (typeof KNOWN_STORAGE_KEYS)[number];

export type StorageAction = "add" | "remove" | "migrate" | "clear" | "sync";

export interface StorageChangedDetail {
  key: StorageKey;
  action: StorageAction;
  bookId?: string;
  quoteId?: string;
}

// ==================== Key 常量 ====================

const KEY_PREFIX = "daily-book:";
const READS_KEY = `${KEY_PREFIX}reads`;
const FAVORITES_KEY = `${KEY_PREFIX}favorites`;
const WANTS_KEY = `${KEY_PREFIX}wants`;
const QUOTES_KEY = `${KEY_PREFIX}quotes`;
const READ_AT_KEY = `${KEY_PREFIX}read-at`;

// ==================== 金句 snapshot 类型（P0-3）====================
// spec: notes/daily-book/p0-3-my-quotes-spec.md v1.1 §3.4
// snapshot 5 字段：即使 YAML 后续删除该书或改金句，金句本仍能显示原文（robustness）。
export interface QuoteEntry {
  quoteId: string;       // "${bookId}:${quoteIndex}"（0-based）
  quoteText: string;     // snapshot 收藏时的金句原文
  bookId: string;
  bookTitle: string;     // snapshot
  bookAuthor: string;    // snapshot
  publishedDate: string; // snapshot 用于计算期号 + 显示日期
}

// ==================== 内部 helper ====================

function safeReadArray(key: string): string[] {
  if (typeof localStorage === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(key) || "[]") as string[];
  } catch {
    return [];
  }
}

function safeWriteArray(key: string, arr: string[]): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(key, JSON.stringify(arr));
}

function safeReadMap(key: string): Record<string, number> {
  if (typeof localStorage === "undefined") return {};
  try {
    const v: unknown = JSON.parse(localStorage.getItem(key) || "{}");
    if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, number>;
    return {};
  } catch {
    return {};
  }
}

function safeWriteMap(key: string, map: Record<string, number>): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(key, JSON.stringify(map));
}

function has(arr: string[], id: string): boolean {
  return arr.includes(id);
}

// ==================== 已读 API ====================
//
// P1 特性 B read-at 双写（spec v1.1 §3.2）：
//   - `daily-book:read-at` = JSON map `{[bookId]: timestamp}`，记录标记已读时刻。
//   - 写/删只挂在 markAsRead / unmarkAsRead **函数内部成功分支**，禁止调用侧散写。
//   - reads 为唯一事实源（印章显隐跟 reads）；read-at 仅展示装饰（印章日期），漂移不影响功能。
//   - 写入顺序：read-at **先于** reads —— 跨 tab 收到 reads sync 事件时 read-at 必然已就位。

export function markAsRead(bookId: string): boolean {
  const arr = safeReadArray(READS_KEY);
  if (has(arr, bookId)) return false;
  const readAt = safeReadMap(READ_AT_KEY);
  readAt[bookId] = Date.now();
  safeWriteMap(READ_AT_KEY, readAt);
  arr.push(bookId);
  safeWriteArray(READS_KEY, arr);
  emitStorageChange({ key: "reads", action: "add", bookId });
  return true;
}

export function isRead(bookId: string): boolean {
  return has(safeReadArray(READS_KEY), bookId);
}

export function unmarkAsRead(bookId: string): boolean {
  const arr = safeReadArray(READS_KEY);
  const idx = arr.indexOf(bookId);
  if (idx === -1) return false;
  arr.splice(idx, 1);
  const readAt = safeReadMap(READ_AT_KEY);
  if (bookId in readAt) {
    delete readAt[bookId];
    safeWriteMap(READ_AT_KEY, readAt);
  }
  safeWriteArray(READS_KEY, arr);
  emitStorageChange({ key: "reads", action: "remove", bookId });
  return true;
}

export function getReads(): string[] {
  return safeReadArray(READS_KEY);
}

/** 读取标记已读时刻；缺失（老数据 / 双写漂移）返回 null —— 印章降级只显示「已阅」无日期 */
export function getReadAt(bookId: string): number | null {
  const ts = safeReadMap(READ_AT_KEY)[bookId];
  return typeof ts === "number" && Number.isFinite(ts) ? ts : null;
}

// ==================== 收藏 API ====================

export function isFavorited(bookId: string): boolean {
  return has(safeReadArray(FAVORITES_KEY), bookId);
}

export function toggleFavorite(bookId: string): boolean {
  const arr = safeReadArray(FAVORITES_KEY);
  const idx = arr.indexOf(bookId);
  if (idx > -1) {
    arr.splice(idx, 1);
    safeWriteArray(FAVORITES_KEY, arr);
    emitStorageChange({ key: "favorites", action: "remove", bookId });
    return false;
  }
  arr.push(bookId);
  safeWriteArray(FAVORITES_KEY, arr);
  emitStorageChange({ key: "favorites", action: "add", bookId });
  return true;
}

export function getFavorites(): string[] {
  return safeReadArray(FAVORITES_KEY);
}

// ==================== 想读 API ====================

export function isWanted(bookId: string): boolean {
  return has(safeReadArray(WANTS_KEY), bookId);
}

export function toggleWant(bookId: string): boolean {
  const arr = safeReadArray(WANTS_KEY);
  const idx = arr.indexOf(bookId);
  if (idx > -1) {
    arr.splice(idx, 1);
    safeWriteArray(WANTS_KEY, arr);
    emitStorageChange({ key: "wants", action: "remove", bookId });
    return false;
  }
  arr.push(bookId);
  safeWriteArray(WANTS_KEY, arr);
  emitStorageChange({ key: "wants", action: "add", bookId });
  return true;
}

export function getWants(): string[] {
  return safeReadArray(WANTS_KEY);
}

// ==================== 金句（契约占位，P0-3 实装）====================
// spec §5：P0-0 只声明签名，真实装由 P0-3 我的金句本 spec 落地。
// Quote 类型 / quoteId 派生规则详见 P0-3 spec §3.2。
//
// export function isQuoteFavorited(quoteId: string): boolean { ... }
// export function toggleQuoteFavorite(quote: QuoteSnapshot): boolean { ... }
// export function getFavoriteQuotes(): QuoteEntry[] { ... }
// export function removeQuoteFavorite(quoteId: string): void { ... }

// ==================== 金句 API（P0-3 实装）====================
// 存储：daily-book:quotes → JSON QuoteEntry[]
// 顺序：最新收藏在前（unshift）
// snapshot 策略：quoteText / bookTitle / bookAuthor / publishedDate 全部落地 localStorage，
// 避免 YAML 后续编辑导致金句本显示错误或丢失原文。

function safeReadQuotes(): QuoteEntry[] {
  if (typeof localStorage === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(QUOTES_KEY) || "[]") as QuoteEntry[];
  } catch {
    return [];
  }
}

function safeWriteQuotes(arr: QuoteEntry[]): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(QUOTES_KEY, JSON.stringify(arr));
}

export function isQuoteFavorited(quoteId: string): boolean {
  return safeReadQuotes().some((q) => q.quoteId === quoteId);
}

export function toggleQuoteFavorite(entry: QuoteEntry): boolean {
  const arr = safeReadQuotes();
  const idx = arr.findIndex((q) => q.quoteId === entry.quoteId);
  if (idx > -1) {
    arr.splice(idx, 1);
    safeWriteQuotes(arr);
    emitStorageChange({ key: "quotes", action: "remove", quoteId: entry.quoteId });
    return false;
  }
  arr.unshift(entry); // 最新收藏在前
  safeWriteQuotes(arr);
  emitStorageChange({ key: "quotes", action: "add", quoteId: entry.quoteId });
  return true;
}

export function getFavoriteQuotes(): QuoteEntry[] {
  return safeReadQuotes();
}

export function removeQuoteFavorite(quoteId: string): void {
  const arr = safeReadQuotes();
  const idx = arr.findIndex((q) => q.quoteId === quoteId);
  if (idx === -1) return;
  arr.splice(idx, 1);
  safeWriteQuotes(arr);
  emitStorageChange({ key: "quotes", action: "remove", quoteId });
}

// ==================== 事件订阅（spec §4.1 / §4.2）====================

export const STORAGE_CHANGED_EVENT = "daily-book:storage:changed";

export function emitStorageChange(detail: StorageChangedDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(STORAGE_CHANGED_EVENT, { detail }));
}

export function onStorageChange(
  handler: (detail: StorageChangedDetail) => void
): () => void {
  if (typeof window === "undefined") return () => {};
  const listener = (e: Event) => handler((e as CustomEvent<StorageChangedDetail>).detail);
  window.addEventListener(STORAGE_CHANGED_EVENT, listener);
  return () => window.removeEventListener(STORAGE_CHANGED_EVENT, listener);
}

// 跨 tab 转发：监听 native storage 事件 → emit `action: 'sync'` 事件。
// 消费方拿到 `sync` 应全量 refetch，不与本 tab 的 add/remove/migrate 混淆。
export function initStorageBroadcast(): void {
  if (typeof window === "undefined") return;
  window.addEventListener("storage", (e) => {
    if (!e.key || !e.key.startsWith(KEY_PREFIX)) return;
    const keyName = e.key.slice(KEY_PREFIX.length) as StorageKey;
    if (!KNOWN_STORAGE_KEYS.includes(keyName)) return;
    emitStorageChange({ key: keyName, action: "sync" });
  });
}

// ==================== 已读印章（P1 特性 B，spec v1.1 §3.2）====================
// 显隐：isRead(bookId) + 订阅 storage:changed（key=reads）跨 tab 同步。
// 动效：仅当次标记时播 180ms 盖印（stampReadSeal）；刷新恢复 / 跨 tab 同步**不播**。
// 日期：read-at[bookId] → MM/DD；缺失降级只显示「已阅」。

function formatSealDate(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

function renderSeal(seal: HTMLElement, bookId: string): void {
  const dateEl = seal.querySelector<HTMLElement>(".read-seal-date");
  if (dateEl) {
    const ts = getReadAt(bookId);
    if (ts !== null) {
      dateEl.textContent = formatSealDate(ts);
      dateEl.hidden = false;
    } else {
      dateEl.hidden = true; // 降级规则（§3.2）：只显示「已阅」无日期
    }
  }
  seal.hidden = false;
}

/** 初始化印章显隐 + 跨 tab 同步（不播动效）。由 initBookActions 接线。 */
export function initReadSeal(bookId: string): void {
  const seal = document.querySelector<HTMLElement>("#readSeal");
  if (!seal) return;
  const sync = () => {
    if (isRead(bookId)) {
      renderSeal(seal, bookId);
    } else {
      seal.hidden = true;
    }
  };
  sync();
  onStorageChange((detail) => {
    if (detail.key === "reads") sync();
  });
}

/** 当次标记的盖印动效：渲染 + 播 180ms stamp。由 markRead 点击成功分支调用。 */
export function stampReadSeal(bookId: string): void {
  const seal = document.querySelector<HTMLElement>("#readSeal");
  if (!seal) return;
  renderSeal(seal, bookId);
  seal.classList.remove("seal-stamp");
  void seal.offsetWidth; // 强制 reflow，允许连续盖印重播
  seal.classList.add("seal-stamp");
}

// ==================== BookCard init（id-based 重构）====================

export function initBookActions(bookId: string, bookTitle: string) {
  // B1 fix (Martin msg=f8eb0854 F1)：Astro `<script>` = deferred module scripts，
  // Layout.astro 的 DOMContentLoaded 只**注册** listener，migration 尚未跑；
  // BookCard `<script>` 立即调用 initBookActions → isRead() 读到空的新 key → 按钮初始状态错。
  // 修复：首行 defensive 触发一次 migration —— flag-based 幂等，多次调用零副作用。
  runStorageMigrationIfNeeded();

  // P1 特性 B：印章显隐初始化 + onStorageChange 订阅（刷新恢复不播动效）
  initReadSeal(bookId);

  // 用 data-book-id 找按钮（id-based 唯一，避免重名书串写）
  const markReadBtn = document.querySelector<HTMLButtonElement>(
    `[data-action="markRead"][data-book-id="${CSS.escape(bookId)}"]`
  );
  const favoriteBtn = document.querySelector<HTMLButtonElement>(
    `[data-action="favorite"][data-book-id="${CSS.escape(bookId)}"]`
  );
  const wantBtn = document.querySelector<HTMLButtonElement>(
    `[data-action="want"][data-book-id="${CSS.escape(bookId)}"]`
  );

  if (markReadBtn) {
    if (isRead(bookId)) {
      markReadBtn.textContent = "已读";
      markReadBtn.disabled = true;
    }
    markReadBtn.addEventListener("click", () => {
      if (markAsRead(bookId)) {
        window.showToast?.(`《${bookTitle}》已标记为已读`);
        markReadBtn.textContent = "已读";
        markReadBtn.disabled = true;
        stampReadSeal(bookId); // P1 特性 B：当次盖印动效（§3.2，仅当次标记时播）
      } else {
        window.showToast?.("这本书已经标记过了");
      }
    });
  }

  if (favoriteBtn) {
    if (isFavorited(bookId)) {
      favoriteBtn.innerHTML = "♥ 已收藏";
      favoriteBtn.classList.add("is-favorited");
    }
    favoriteBtn.addEventListener("click", () => {
      const favorited = toggleFavorite(bookId);
      if (favorited) {
        favoriteBtn.innerHTML = "♥ 已收藏";
        favoriteBtn.classList.add("is-favorited");
        window.showToast?.("已加入收藏");
      } else {
        favoriteBtn.innerHTML = "♡ 收藏";
        favoriteBtn.classList.remove("is-favorited");
        window.showToast?.("已取消收藏");
      }
    });
  }

  if (wantBtn) {
    if (isWanted(bookId)) {
      wantBtn.innerHTML = "★ 想读";
      wantBtn.classList.add("is-wanted");
    }
    wantBtn.addEventListener("click", () => {
      const wanted = toggleWant(bookId);
      if (wanted) {
        wantBtn.innerHTML = "★ 想读";
        wantBtn.classList.add("is-wanted");
        window.showToast?.("已加入想读");
      } else {
        wantBtn.innerHTML = "☆ 想读";
        wantBtn.classList.remove("is-wanted");
        window.showToast?.("已从想读移除");
      }
    });
  }
}

// ==================== Test hooks（仅 vitest 消费）====================

export const __test = {
  READS_KEY,
  FAVORITES_KEY,
  WANTS_KEY,
  READ_AT_KEY,
  KEY_PREFIX,
  // 反查 map：tests 不直接 import books.ts，避免循环依赖
  titleToIdMap: (): Map<string, string> => new Map(books.map((b) => [b.title, b.id])),
};