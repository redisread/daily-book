/**
 * P0-1 期号系统 — build-time 派生
 *
 * spec: notes/daily-book/p0-1-issue-number-spec.md v1.1
 *
 * 派生规则：
 *   - 输入：`books.yaml` 所有 `publishedDate` 非 null 的书
 *   - 排序：publishedDate ASC，同天多本按 `book.id` 字典序（幂等 tie-breaker）
 *   - 期号：第 1 本 = 第 1 期，第 2 本 = 第 2 期，以此类推
 *
 * 不做的：
 *   - 不加 books.yaml schema 字段（Victor 红线）
 *   - 不给未发布书（publishedDate=null）分配期号
 *   - 不做手动指定期号
 *   - 不做「跳期号」
 *
 * 幂等保证：
 *   - 同天多本按 book.id 字典序作 tiebreaker（避免 YAML 顺序变化导致期号漂移）
 *   - 新增一本 publishedDate 早于历史 → 其后所有书期号 +1（回填历史书正常操作，CI 漂移检测 P1 backlog）
 *   - 新增一本 publishedDate 最新 → 期号继续递增，无副作用
 */

import type { Book } from "../schemas/book";

export interface IssueNumberIndex {
  /** book.id → issueNumber（第 N 期） */
  bookIdToIssue: Map<string, number>;
  /** issueNumber → book.id */
  issueToBookId: Map<number, string>;
  /** 已发布书总数 */
  totalIssues: number;
}

/**
 * 派生期号索引。所有 publishedDate 非 null 的书按 publishedDate 升序排列，
 * 第一本为「第 1 期」，第二本为「第 2 期」，以此类推。
 * 同一天多本书按 book.id 字典序（保证幂等）。
 */
export function buildIssueNumberIndex(books: Book[]): IssueNumberIndex {
  const published = books
    .filter((b) => b.publishedDate != null)
    .sort((a, b) => {
      const dateCmp = a.publishedDate!.localeCompare(b.publishedDate!);
      return dateCmp !== 0 ? dateCmp : a.id.localeCompare(b.id);
    });

  const bookIdToIssue = new Map<string, number>();
  const issueToBookId = new Map<number, string>();

  published.forEach((book, index) => {
    const issueNumber = index + 1;
    bookIdToIssue.set(book.id, issueNumber);
    issueToBookId.set(issueNumber, book.id);
  });

  return { bookIdToIssue, issueToBookId, totalIssues: published.length };
}

/**
 * 格式化期号。
 * - short: `#105`（首页 date 条 / archive 目录 / HistoryGrid 徽章）
 * - long: `第 105 期`（详情页 / 分享图 / RSS）
 *
 * v1.1 note: 移除 locale 参数（三语基础设施独立 P1 backlog）。
 * 未来 i18n 补齐时 signature 扩展为 `formatIssueNumber(n, form, locale)`，
 * 消费方无破坏（form 默认 long, locale 默认 zh）。
 */
export function formatIssueNumber(n: number, form: "short" | "long" = "long"): string {
  return form === "short" ? `#${n}` : `第 ${n} 期`;
}