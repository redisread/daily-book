/**
 * P0-0 storage 迁移 + API 单元测试
 *
 * spec: notes/daily-book/p0-0-storage-migration-spec.md §8 验收清单
 *
 * 覆盖：
 *   1. 首次启动：无旧数据 → migration 无副作用，flag 写入
 *   2. 存量迁移：旧 key 命中 → 新 key 正确写出 id
 *   3. 重复启动幂等：flag 存在 → return，无副作用
 *   4. 未知 title：旧 key 里有「不存在的书」→ filter 后空数组，无 crash
 *   5. 事件监听：markAsRead → onStorageChange 收到 `{ key: 'reads', action: 'add', bookId }`
 *   6. 跨 tab：native storage 事件 → emit `action: 'sync'`
 *   7. 旧 key 不删：migration 后 `dailybook_read` 仍存在
 *   8. API：markAsRead / toggleFavorite / toggleWant / unmarkAsRead / getReads / getFavorites / getWants 全部 id-based
 *
 * 测试策略：不依赖 happy-dom —— 用 vi.stubGlobal 注入 fake localStorage + fake window，
 * 让 storage.ts / storage-migration.ts 在 pure node 环境跑通。
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { books } from "../../src/data/books";

// ==================== Fake environment ====================

function makeFakeStorage() {
  const store = new Map<string, string>();
  return {
    getItem(k: string) { return store.has(k) ? store.get(k)! : null; },
    setItem(k: string, v: string) { store.set(k, String(v)); },
    removeItem(k: string) { store.delete(k); },
    clear() { store.clear(); },
    key(i: number) { return Array.from(store.keys())[i] ?? null; },
    get length() { return store.size; },
    _store: store,
  };
}

function makeFakeWindow() {
  const listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
  return {
    addEventListener(type: string, handler: EventListenerOrEventListenerObject) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(handler);
    },
    removeEventListener(type: string, handler: EventListenerOrEventListenerObject) {
      listeners.get(type)?.delete(handler);
    },
    dispatchEvent(event: Event): boolean {
      const set = listeners.get(event.type);
      if (!set) return true;
      for (const h of set) {
        if (typeof h === "function") h(event);
        else h.handleEvent(event);
      }
      return true;
    },
    showToast: undefined as ((msg: string) => void) | undefined,
    _listeners: listeners,
  };
}

let fakeStorage: ReturnType<typeof makeFakeStorage>;
let fakeWindow: ReturnType<typeof makeFakeWindow>;

beforeEach(() => {
  fakeStorage = makeFakeStorage();
  fakeWindow = makeFakeWindow();
  vi.stubGlobal("localStorage", fakeStorage);
  vi.stubGlobal("window", fakeWindow);
});

// ==================== Tests ====================

describe("P0-0 storage 迁移", () => {
  it("Case 1 — 首次启动无旧数据：migration 无副作用 + flag 写入", async () => {
    const { runStorageMigrationIfNeeded } = await import("../../src/scripts/storage-migration");
    runStorageMigrationIfNeeded();
    expect(fakeStorage.getItem("daily-book:migrated-v1")).toBe("true");
    expect(fakeStorage.getItem("daily-book:reads")).toBeNull();
    expect(fakeStorage.getItem("daily-book:favorites")).toBeNull();
    // wants 空初始化
    expect(fakeStorage.getItem("daily-book:wants")).toBe("[]");
  });

  it("Case 2 — 存量迁移：旧 key 命中 → 新 key 正确写出 id", async () => {
    const sample = books.slice(0, 3);
    const titles = sample.map((b) => b.title);
    fakeStorage.setItem("dailybook_read", JSON.stringify(titles));

    const { runStorageMigrationIfNeeded } = await import("../../src/scripts/storage-migration");
    runStorageMigrationIfNeeded();

    const reads = JSON.parse(fakeStorage.getItem("daily-book:reads") || "[]");
    expect(reads).toEqual(sample.map((b) => b.id));
    expect(fakeStorage.getItem("daily-book:migrated-v1")).toBe("true");
  });

  it("Case 2b — 旧 collections key 也正确迁移到 favorites", async () => {
    const sample = books.slice(0, 2);
    fakeStorage.setItem("dailybook_collections", JSON.stringify(sample.map((b) => b.title)));

    const { runStorageMigrationIfNeeded } = await import("../../src/scripts/storage-migration");
    runStorageMigrationIfNeeded();

    const favs = JSON.parse(fakeStorage.getItem("daily-book:favorites") || "[]");
    expect(favs).toEqual(sample.map((b) => b.id));
  });

  it("Case 3 — 重复启动幂等：flag 存在 → 无副作用", async () => {
    const { runStorageMigrationIfNeeded } = await import("../../src/scripts/storage-migration");
    runStorageMigrationIfNeeded();

    // flag 已在 → 改写旧 key 也不应重跑
    fakeStorage.setItem("dailybook_read", JSON.stringify(["应该被忽略"]));
    runStorageMigrationIfNeeded();

    const reads = JSON.parse(fakeStorage.getItem("daily-book:reads") || "[]");
    expect(reads).toEqual([]);
  });

  it("Case 4 — 未知 title：旧 key 里有「不存在的书」 → filter 后空，无 crash", async () => {
    fakeStorage.setItem("dailybook_read", JSON.stringify(["不存在的书", books[0].title]));

    const { runStorageMigrationIfNeeded } = await import("../../src/scripts/storage-migration");
    expect(() => runStorageMigrationIfNeeded()).not.toThrow();

    const reads = JSON.parse(fakeStorage.getItem("daily-book:reads") || "[]");
    expect(reads).toEqual([books[0].id]);
  });

  it("Case 7 — 旧 key 不删：migration 后旧 key 仍存在", async () => {
    fakeStorage.setItem("dailybook_read", JSON.stringify([books[0].title]));
    fakeStorage.setItem("dailybook_collections", JSON.stringify([]));

    const { runStorageMigrationIfNeeded } = await import("../../src/scripts/storage-migration");
    runStorageMigrationIfNeeded();

    expect(fakeStorage.getItem("dailybook_read")).not.toBeNull();
    expect(fakeStorage.getItem("dailybook_collections")).not.toBeNull();
  });

  it("Case 8 — migration 失败：不写 flag，下次重跑", async () => {
    // 让 migration flag 写入抛错（模拟 storage quota exceeded），
    // safeReadArray 自身 catch 不抛，所以从 setItem 路径注入。
    const origSetItem = fakeStorage.setItem;
    fakeStorage.setItem = (k: string, v: string) => {
      if (k === "daily-book:migrated-v1") throw new Error("quota exceeded");
      origSetItem.call(fakeStorage, k, v);
    };

    const { runStorageMigrationIfNeeded } = await import("../../src/scripts/storage-migration");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    runStorageMigrationIfNeeded();

    // flag 未写
    expect(fakeStorage.getItem("daily-book:migrated-v1")).toBeNull();
    errorSpy.mockRestore();
  });
});

describe("P0-0 storage API (id-based)", () => {
  it("markAsRead / isRead / unmarkAsRead / getReads 全部按 id 操作", async () => {
    const { markAsRead, isRead, unmarkAsRead, getReads } = await import("../../src/scripts/storage");
    const id = books[0].id;
    expect(isRead(id)).toBe(false);
    expect(markAsRead(id)).toBe(true);
    expect(isRead(id)).toBe(true);
    expect(markAsRead(id)).toBe(false); // 重复
    expect(getReads()).toContain(id);
    expect(unmarkAsRead(id)).toBe(true);
    expect(isRead(id)).toBe(false);
  });

  it("toggleFavorite / isFavorited / getFavorites 按 id 操作", async () => {
    const { toggleFavorite, isFavorited, getFavorites } = await import("../../src/scripts/storage");
    const id = books[1].id;
    expect(toggleFavorite(id)).toBe(true);
    expect(isFavorited(id)).toBe(true);
    expect(toggleFavorite(id)).toBe(false);
    expect(isFavorited(id)).toBe(false);
    expect(getFavorites()).not.toContain(id);
  });

  it("toggleWant / isWanted / getWants 按 id 操作", async () => {
    const { toggleWant, isWanted, getWants } = await import("../../src/scripts/storage");
    const id = books[2].id;
    expect(isWanted(id)).toBe(false);
    expect(toggleWant(id)).toBe(true);
    expect(isWanted(id)).toBe(true);
    expect(getWants()).toEqual([id]);
    expect(toggleWant(id)).toBe(false);
    expect(getWants()).toEqual([]);
  });
});

describe("P0-0 事件订阅", () => {
  it("Case 5 — markAsRead → onStorageChange 收到 { key: 'reads', action: 'add', bookId }", async () => {
    const { markAsRead, onStorageChange } = await import("../../src/scripts/storage");
    const id = books[0].id;
    const received: Array<unknown> = [];
    const unsub = onStorageChange((d) => received.push(d));
    markAsRead(id);
    expect(received).toEqual([{ key: "reads", action: "add", bookId: id }]);
    unsub();
  });

  it("toggleFavorite add/remove 都 emit 对应 action", async () => {
    const { toggleFavorite, onStorageChange } = await import("../../src/scripts/storage");
    const id = books[1].id;
    const events: Array<unknown> = [];
    const unsub = onStorageChange((d) => events.push(d));
    toggleFavorite(id);
    toggleFavorite(id);
    expect(events).toEqual([
      { key: "favorites", action: "add", bookId: id },
      { key: "favorites", action: "remove", bookId: id },
    ]);
    unsub();
  });

  it("Case 6 — native storage 事件 → emit action: 'sync'", async () => {
    const { initStorageBroadcast, onStorageChange } = await import("../../src/scripts/storage");
    const events: Array<unknown> = [];
    const unsub = onStorageChange((d) => events.push(d));
    initStorageBroadcast();

    // 模拟 Tab A 改 favorites 触发 Tab B 收到 native storage 事件
    const nativeEvent = {
      type: "storage",
      key: "daily-book:favorites",
      newValue: '["some-id"]',
      oldValue: "[]",
      storageArea: fakeStorage,
    } as unknown as Event;
    fakeWindow.dispatchEvent(nativeEvent);

    expect(events).toEqual([{ key: "favorites", action: "sync" }]);
    unsub();
  });

  it("跨 tab：非 daily-book: 前缀的 native storage 事件被忽略", async () => {
    const { initStorageBroadcast, onStorageChange } = await import("../../src/scripts/storage");
    const events: Array<unknown> = [];
    const unsub = onStorageChange((d) => events.push(d));
    initStorageBroadcast();

    fakeWindow.dispatchEvent({
      type: "storage", key: "other-app:key", newValue: "x",
    } as unknown as Event);
    expect(events).toEqual([]);
    unsub();
  });

  it("KNOWN_STORAGE_KEYS 白名单外的 daily-book: key 被忽略", async () => {
    const { initStorageBroadcast, onStorageChange } = await import("../../src/scripts/storage");
    const events: Array<unknown> = [];
    const unsub = onStorageChange((d) => events.push(d));
    initStorageBroadcast();

    fakeWindow.dispatchEvent({
      type: "storage", key: "daily-book:highlights", newValue: "[]",
    } as unknown as Event);
    expect(events).toEqual([]);
    unsub();
  });
});

describe("P0-0 KNOWN_STORAGE_KEYS 单点常量", () => {
  it("导出 4 个已知 key", async () => {
    const { KNOWN_STORAGE_KEYS } = await import("../../src/scripts/storage");
    expect(KNOWN_STORAGE_KEYS).toEqual(["reads", "favorites", "wants", "quotes"]);
  });
});