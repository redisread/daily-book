# daily-book P0-0：storage 迁移 + 事件基础层 spec v1.1

> **v1.1 变更**（2026-07-21 Martin 二次 CR pass 后修补）：
> - §4.1/4.2 action union 加 `'sync'`：跨 tab 转发用 `'sync'` 而非 `'migrate'`（M1 阻塞修补，避免语义污染）
> - §4.2 加 `KNOWN_STORAGE_KEYS` 单点常量：未来加 `notes` / `highlights` 只改一处（M7 建议）
> - §4.3 补 3 个 list getter (`getReads` / `getFavorites` / `getWants`)：P0-2 消费只依赖 P0-0 API 面，不自建 pure read helper（M2 契约收敛）
> - §4.3 补 4 个 quote API 签名注释（`getFavoriteQuotes` / `removeQuoteFavorite`），P0-3 首次实装

> **触发**：Martin CR P0-2/3 时定位到 storage.ts 现状与 spec 假设偏差严重 → 拆出 P0-0 前置 spec
> **前置**：无（P0-1/2/3/4 均依赖）
> **工作量**：**XS-S 4-8 小时**（纯 client-side，无 UI）
> **状态**：v1.1 待 Martin 三次 CR pass

---

## 0. 目标（一句话）

**把 daily-book 现有 storage 层从「以 title 为 key」重构为「以 id 为 key」，加事件订阅基础层，并写幂等 migration 覆盖存量用户。**

---

## 1. 现状（fact-check）

`src/scripts/storage.ts` 当前状态：

```ts
const READ_KEY = 'dailybook_read';                // 下划线 + 无冒号
const COLLECTIONS_KEY = 'dailybook_collections';  // 命名与语义不符

markAsRead(bookTitle)      // ← 用 title 而非 id
toggleCollection(bookTitle)
isCollected(bookTitle)
```

**问题**：
1. 用 `book.title` 作 key → 重名书（同一 title 不同版本）会串写
2. 命名不统一：`dailybook_*` 下划线 vs 未来 P0-2/3 spec 假设的 `daily-book:*` 冒号
3. 无「想读」pillar
4. 无事件订阅 → 页面间同步只能靠 window 刷新（BookCard 只在 mount 时读一次）
5. QuoteCard ♡ 完全无持久化（memory-only）

---

## 2. 目标 storage schema

### 2.1 新 key 契约

| Key                          | Value 类型                                                                     | 语义                          |
| ---------------------------- | ------------------------------------------------------------------------------ | ----------------------------- |
| `daily-book:reads`           | `string[]` (bookId 数组)                                                       | 已读书 id 列表                |
| `daily-book:favorites`       | `string[]` (bookId 数组)                                                       | 收藏书 id 列表                |
| `daily-book:wants`           | `string[]` (bookId 数组)                                                       | 想读书 id 列表（P0-0 新增）   |
| `daily-book:quotes`          | `Quote[]` snapshot（P0-3 详见其 spec §3.2）                                    | 收藏金句列表                  |
| `daily-book:migrated-v1`     | `'true'`                                                                       | 一次性迁移完成 flag           |

> **命名约定**：全部 `daily-book:` 冒号前缀 + `kebab-case` 后缀，未来加 `daily-book:notes` / `daily-book:highlights` 等一致。

### 2.2 旧 key 保留策略（rollback）

- 迁移**不删**旧 key（`dailybook_read` / `dailybook_collections`），只读一次 → 写新 key
- 保留原因：万一新 key 写坏，删 `daily-book:migrated-v1` flag → 下次启动重跑迁移
- 3 个月后（Victor 决策）起 cleanup PR：写 `daily-book:migrated-v2` flag + 删旧 key + 删迁移逻辑

---

## 3. 迁移逻辑（flag-based, 幂等）

### 3.1 核心函数

`src/scripts/storage-migration.ts`（新文件）：

```ts
import { books } from '../data/books';

const MIGRATION_FLAG = 'daily-book:migrated-v1';
const OLD_READ_KEY = 'dailybook_read';
const OLD_COLL_KEY = 'dailybook_collections';
const NEW_READS_KEY = 'daily-book:reads';
const NEW_FAVS_KEY = 'daily-book:favorites';
const NEW_WANTS_KEY = 'daily-book:wants';

export function runStorageMigrationIfNeeded(): void {
  if (typeof localStorage === 'undefined') return;
  if (localStorage.getItem(MIGRATION_FLAG) === 'true') return;

  try {
    // 读旧数据
    const oldReads = JSON.parse(localStorage.getItem(OLD_READ_KEY) || '[]') as string[];
    const oldColls = JSON.parse(localStorage.getItem(OLD_COLL_KEY) || '[]') as string[];

    // title → id 反查
    const titleToId = new Map(books.map(b => [b.title, b.id]));
    const readsIds = oldReads.map(t => titleToId.get(t)).filter(Boolean) as string[];
    const favsIds = oldColls.map(t => titleToId.get(t)).filter(Boolean) as string[];

    // 写新 key（如果新 key 已存在且非空，merge 去重）
    const existingReads = safeReadArray(NEW_READS_KEY);
    const existingFavs = safeReadArray(NEW_FAVS_KEY);
    localStorage.setItem(NEW_READS_KEY, JSON.stringify(unique([...existingReads, ...readsIds])));
    localStorage.setItem(NEW_FAVS_KEY, JSON.stringify(unique([...existingFavs, ...favsIds])));

    // wants 空初始化（如果不存在）
    if (!localStorage.getItem(NEW_WANTS_KEY)) {
      localStorage.setItem(NEW_WANTS_KEY, '[]');
    }

    // 标记完成
    localStorage.setItem(MIGRATION_FLAG, 'true');

    // 报告事件（不阻塞）
    emitStorageChange({ key: 'reads', action: 'migrate' });
    emitStorageChange({ key: 'favorites', action: 'migrate' });
  } catch (err) {
    // 迁移失败不阻塞用户使用，log 到 console 便于排查
    console.error('[daily-book] storage migration failed:', err);
    // 不写 flag → 下次启动重跑
  }
}

function safeReadArray(key: string): string[] {
  try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; }
}
function unique<T>(arr: T[]): T[] { return Array.from(new Set(arr)); }
```

### 3.2 触发点

- **`src/layouts/BaseLayout.astro`（或全站根 script）** `DOMContentLoaded` 首次触发：
  ```ts
  import { runStorageMigrationIfNeeded } from '../scripts/storage-migration';
  document.addEventListener('DOMContentLoaded', () => {
    runStorageMigrationIfNeeded();
    // 后续初始化 ...
  });
  ```

### 3.3 幂等保证

- flag 存在 → 直接 return，无副作用
- flag 不存在 → 重跑（读旧 key + merge 到新 key + 写 flag）
- 重跑安全：unique 去重 + title→id 反查 + 旧 key 不删
- **rollback 步骤**（人工）：浏览器 DevTools 删 `daily-book:migrated-v1` → 刷新页面 → migration 重跑

---

## 4. 事件订阅基础层

### 4.1 事件契约

**唯一事件**：`daily-book:storage:changed`

**Payload**（`CustomEvent.detail`）：
```ts
type StorageChangedDetail = {
  key: 'reads' | 'favorites' | 'wants' | 'quotes';
  action: 'add' | 'remove' | 'migrate' | 'clear' | 'sync';
  bookId?: string;    // action='add'|'remove' 时提供
  quoteId?: string;   // key='quotes' 时提供（P0-3）
};
```

**action 语义**：
- `add` / `remove`：单条改动（本 tab 触发的 mutator）
- `clear`：整表清空
- `migrate`：**一次性**存量迁移完成（`runStorageMigrationIfNeeded` 内部 emit）
- `sync`：**跨 tab 外部变化**（`initStorageBroadcast` 转发 native `storage` 事件专用；消费方拿到 `sync` 表示「其他 tab 改了同一个 key」，全量 refetch 即可）

**订阅数**：1 根（全站单事件），消费方在 handler 内按 `detail.key` filter。

**跨 tab 同步**：监听原生 `storage` 事件 → 转发为 `daily-book:storage:changed`（key 前缀匹配 `daily-book:`，emit `action: 'sync'`）。

### 4.2 helper API

`src/scripts/storage.ts` 重构后新增：

```ts
export type StorageKey = 'reads' | 'favorites' | 'wants' | 'quotes';
export type StorageAction = 'add' | 'remove' | 'migrate' | 'clear' | 'sync';
export type StorageChangedDetail = { key: StorageKey; action: StorageAction; bookId?: string; quoteId?: string };

// 单点导出的已知 key 白名单（未来加 notes/highlights 时只改这一处，type union + broadcast filter + 消费方 filter 全 derive）
export const KNOWN_STORAGE_KEYS: readonly StorageKey[] = ['reads', 'favorites', 'wants', 'quotes'] as const;

export function emitStorageChange(detail: StorageChangedDetail): void {
  window.dispatchEvent(new CustomEvent('daily-book:storage:changed', { detail }));
}

export function onStorageChange(handler: (detail: StorageChangedDetail) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<StorageChangedDetail>).detail);
  window.addEventListener('daily-book:storage:changed', listener);
  return () => window.removeEventListener('daily-book:storage:changed', listener);
}

// 跨 tab 转发（用 'sync' action 与本 tab 的 add/remove/migrate 区分）
export function initStorageBroadcast(): void {
  window.addEventListener('storage', (e) => {
    if (!e.key || !e.key.startsWith('daily-book:')) return;
    const keyName = e.key.replace('daily-book:', '') as StorageKey;
    if (!KNOWN_STORAGE_KEYS.includes(keyName)) return;
    emitStorageChange({ key: keyName, action: 'sync' }); // 跨 tab 外部变化，消费方全量 refetch
  });
}
```

### 4.3 storage.ts 重构后签名（保 API 稳定，param 从 title → id）

```ts
// 已读
export function markAsRead(bookId: string): boolean;
export function isRead(bookId: string): boolean;
export function unmarkAsRead(bookId: string): boolean;
export function getReads(): string[];         // list getter（P0-2 消费）

// 收藏
export function isFavorited(bookId: string): boolean;
export function toggleFavorite(bookId: string): boolean;
export function getFavorites(): string[];     // list getter（P0-2 消费）

// 想读（P0-0 新增）
export function isWanted(bookId: string): boolean;
export function toggleWant(bookId: string): boolean;
export function getWants(): string[];         // list getter（P0-2 消费）

// 金句（P0-3 消费, P0-0 只声明契约）
// export function isQuoteFavorited(quoteId: string): boolean;
// export function toggleQuoteFavorite(quote: QuoteSnapshot): boolean;
// export function getFavoriteQuotes(): QuoteEntry[];
// export function removeQuoteFavorite(quoteId: string): void;

// 内部：写操作时自动 emitStorageChange
```

**契约面**：消费方（P0-2 / P0-3）**只依赖 P0-0 的 API**，不自建 pure read helper（避免重复 helper 层）。P0-2 §3.2 3 个自建纯读函数在 v1.2 撤销。

**BookCard.astro 消费方**：`initBookActions(bookId)`（参数从 `bookTitle` → `bookId`），data attribute `data-title` → `data-book-id`。

---

## 5. QuoteCard ♡ memory-only → 持久化（P0-0 只声明契约）

P0-0 **不**实装金句 ♡ 持久化，只在 storage.ts 里预留 `isQuoteFavorited`/`toggleQuoteFavorite` 签名注释。真实装由 **P0-3 我的金句本** spec 落地。

**理由**：金句 ♡ 涉及 `quoteId = ${bookId}:${index}` 派生 + snapshot 存储 5 字段（P0-3 §3.2），逻辑独立，不塞进 P0-0 基础层。P0-0 只管书级别 storage + 事件契约。

---

## 6. HTML/data attribute 契约

**BookCard.astro** 现状（title-based）：
```astro
<button data-action="markRead" data-title={book.title}>...</button>
<button data-action="collect" data-title={book.title}>...</button>
```

**P0-0 后**（id-based）：
```astro
<button data-action="markRead" data-book-id={book.id}>...</button>
<button data-action="favorite" data-book-id={book.id}>...</button>
<button data-action="want" data-book-id={book.id}>...</button>  {/* 新增，P0-2 落 UI */}
```

> `data-action="collect"` → `data-action="favorite"` 命名对齐 `daily-book:favorites` key，避免语义漂移

---

## 7. 交付给 Martin/Jeff 的实施要点

**Jeff PR A 单独提交，先合并**（P0-1/2/3/4 依赖）：

1. **新文件** `src/scripts/storage-migration.ts`
2. **重构** `src/scripts/storage.ts`（新签名 + 事件 emit + broadcast）
3. **改** `src/components/BookCard.astro`（`data-title` → `data-book-id`，新增 want 按钮 hidden 占位或不加待 P0-2 加）
4. **改** `src/layouts/BaseLayout.astro`（DOMContentLoaded → migration + broadcast init）
5. **加** 单测（可选，Jeff 判断）：`storage-migration.test.ts` mock localStorage 验幂等

**建议 P0-0 不改任何 UI**：只做 storage 层 + BookCard data-attribute 一处 rename。UI 逐份 P0-1/2/3/4 落地。

---

## 8. 验收标准

Wen 测试用例（依赖真实浏览器环境）：

1. **首次启动**：无 `dailybook_read` / `dailybook_collections` 时 migration 无副作用，flag 写入
2. **存量迁移**：手动写 `localStorage.setItem('dailybook_read', '["百年孤独","悉达多"]')` + 刷新 → `daily-book:reads` 出现 `["hundred-years-of-solitude", "siddhartha"]`
3. **重复启动幂等**：两次触发 migration，flag 只写一次，数据无重复
4. **未知 title**：旧 key 里有 `["不存在的书"]` → filter 后 `daily-book:reads = []`，无 crash
5. **事件监听**：`onStorageChange` 回调收到 `{ key: 'favorites', action: 'add', bookId: 'x' }`
6. **跨 tab**：Tab A 写 `daily-book:favorites` → Tab B 收到 `daily-book:storage:changed` 事件, `detail.action === 'sync'`（与本 tab 的 `'add'`/`'remove'`/`'migrate'` 区分）
7. **rollback**：删 flag + 刷新 → migration 重跑 + 数据一致
8. **旧 key 不删**：migration 后 `dailybook_read` 仍存在（3 个月 cleanup PR 才清）

---

## 9. 与其他 spec 关系

| 关联                | 关系                                                                            |
| ------------------- | ------------------------------------------------------------------------------- |
| P0-1 期号系统       | 无直接依赖（P0-1 是纯派生 helper）                                              |
| P0-2 我的书架       | **直接依赖**：消费 `daily-book:favorites` / `:reads` / `:wants` + subscribe     |
| P0-3 我的金句本     | **直接依赖**：扩展 `daily-book:quotes` key + 消费 subscribe                     |
| P0-4 分享图水印     | 无直接依赖                                                                      |

---

## 10. 一句话总结

**P0-0 = flag-based 幂等迁移（title→id）+ 统一 `daily-book:*` 命名 + 单事件 `daily-book:storage:changed` 粗粒度订阅 + `daily-book:wants` 新 pillar，4-8h 落地一份 PR，为 P0-2/3 铺路。**

---

_spec v1.1 完成 (2026-07-21 Martin 二次 CR 后修补：action `'sync'` 拆分 / KNOWN_STORAGE_KEYS / 3 list getter)，等 Martin 三次 CR pass 后交 Jeff 起手 PR A._
