import rss from "@astrojs/rss";
import type { APIContext } from "astro";
import { getPublishedBooks, formatDateISO, getBookIssueNumber } from "../data/books";
import { formatIssueNumber } from "../utils/issue-number";
import { buildBookRssContent } from "../utils/rss";

export const prerender = true;

export function GET(context: APIContext) {
  const recent = getPublishedBooks(30);
  const buildTime = new Date();
  const buildTimeStr = buildTime.toUTCString();

  return rss({
    title: "每日一书 · 每日刊物",
    description: "每天推荐一本好书，附带精选金句，让阅读成为习惯。",
    site: context.site!.toString(),
    items: recent.map(({ date, book }) => {
      const issue = getBookIssueNumber(book.id);
      const issuePrefix = issue !== null ? `${formatIssueNumber(issue, "long")} · ` : "";
      const link = `/book/${formatDateISO(date)}`;
      return {
        title: `${issuePrefix}${book.title} —— ${book.author}`,
        pubDate: date,
        link,
        // 简短摘要供阅读器列表展示；全文信息放在 content 中
        description: `${book.author}《${book.title}》（${book.category}）\n\n${book.desc}\n\n今日精选金句：${book.quotes[0].text}`,
        categories: [book.category],
        content: buildBookRssContent(book, new URL(`${link}/`, context.site!).toString()),
      };
    }),
    customData: `<language>zh-cn</language><lastBuildDate>${buildTimeStr}</lastBuildDate><ttl>1440</ttl>`,
  });
}
