/**
 * P0-0 一次性 storage 迁移（spec §3）
 *
 * 把存量 localStorage 数据从「以 title 为 key」迁移到「以 id 为 key」的
 * 新 schema（`daily-book:reads` / `daily-book:favorites` / `daily-book:wants`）。
 *
 * 幂等保证（flag-based）：
 *   - 读 `daily-book:migrated-v1` flag，存在则直接 return
 *   - 不存在 → 读旧 key（`dailybook_read` / `dailybook_collections`）+ title→id 反查
 *     + 合并到新 key + 写 flag
 *   - 重跑安全：unique 去重 + title→id 反查 + 旧 key 不删（rollback 友好）
 *
 * 失败处理：catch + console.error，**不写 flag** → 下次启动重跑。
 *
 * 触发点：src/layouts/Layout.astro `DOMContentLoaded`。
 */

import { books } from "../data/books";
import { emitStorageChange } from "./storage";

const MIGRATION_FLAG = "daily-book:migrated-v1";
const OLD_READ_KEY = "dailybook_read";
const OLD_COLL_KEY = "dailybook_collections";

const NEW_READS_KEY = "daily-book:reads";
const NEW_FAVS_KEY = "daily-book:favorites";
const NEW_WANTS_KEY = "daily-book:wants";

function safeReadArray(key: string): string[] {
  try {
    return JSON.parse(localStorage.getItem(key) || "[]") as string[];
  } catch {
    return [];
  }
}

function unique<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

function mergeIntoNew(newKey: string, idsToAdd: string[]): void {
  const existing = safeReadArray(newKey);
  const merged = unique([...existing, ...idsToAdd]);
  localStorage.setItem(newKey, JSON.stringify(merged));
}

export function runStorageMigrationIfNeeded(): void {
  if (typeof localStorage === "undefined") return;
  if (localStorage.getItem(MIGRATION_FLAG) === "true") return;

  try {
    const oldReads = safeReadArray(OLD_READ_KEY);
    const oldColls = safeReadArray(OLD_COLL_KEY);

    // title → id 反查（仅命中 books 表的书）
    const titleToId = new Map(books.map((b) => [b.title, b.id]));
    const readsIds = oldReads.map((t) => titleToId.get(t)).filter((x): x is string => Boolean(x));
    const favsIds = oldColls.map((t) => titleToId.get(t)).filter((x): x is string => Boolean(x));

    // 仅当有真实迁移数据时才写 reads/favorites 新 key（避免在干净环境写入 `[]` 副作用）
    if (readsIds.length > 0) mergeIntoNew(NEW_READS_KEY, readsIds);
    if (favsIds.length > 0) mergeIntoNew(NEW_FAVS_KEY, favsIds);

    // wants：仅在新 key 完全不存在时初始化 `[]`（Martin msg=f8eb0854 N2：与 reads/favorites 的
    // `if > 0` 判定不一致是刻意 defensive —— wants 无旧 key 数据源，UI 侧消费默认存在 [] 简化
    // 状态处理；reads/favorites 有旧 key 迁移语义，空写入是无意义副作用）
    if (localStorage.getItem(NEW_WANTS_KEY) === null) {
      localStorage.setItem(NEW_WANTS_KEY, "[]");
    }

    // 标记完成
    localStorage.setItem(MIGRATION_FLAG, "true");

    // 报告事件（action: 'migrate'，spec §4.1：本 tab 一次性迁移完成）
    // Martin msg=f8eb0854 N1：只在实际有数据被迁移时 emit——语义 = 「这条 key 真有存量数据被搬进来」
    if (readsIds.length > 0) emitStorageChange({ key: "reads", action: "migrate" });
    if (favsIds.length > 0) emitStorageChange({ key: "favorites", action: "migrate" });
  } catch (err) {
    console.error("[daily-book] storage migration failed:", err);
    // 不写 flag → 下次启动重跑
  }
}