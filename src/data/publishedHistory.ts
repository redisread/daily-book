// 发布历史：手动维护的"每日一书"发布记录
// 发布新书时，往数组顶部 prepend 一条新记录，然后 push 代码触发部署
// 注意：bookId 必须对应 books.ts 中的有效 id

export interface PublishedEntry {
  date: string; // YYYY-MM-DD
  bookId: string; // 对应 books 数组中的 id
}

export const publishedHistory: PublishedEntry[] = [
  // 最新发布在最前
  { date: "2026-06-18", bookId: "sapiens" },
  { date: "2026-06-17", bookId: "hundred-years-of-solitude" },
  { date: "2026-06-16", bookId: "the-little-prince" },
  { date: "2026-06-15", bookId: "to-live" },
  { date: "2026-06-14", bookId: "the-moon-and-sixpence" },
  { date: "2026-06-13", bookId: "norwegian-wood" },
  { date: "2026-06-12", bookId: "the-stranger" },
];
