import rss from "@astrojs/rss";
import type { APIContext } from "astro";
import { getRecentBooks, formatDateISO } from "../data/books";

export function GET(context: APIContext) {
  const recent = getRecentBooks(30);
  const buildTime = new Date();
  const buildTimeStr = buildTime.toUTCString();

  return rss({
    title: "每日一书 · Daily Book",
    description: "每天推荐一本好书，附带精选金句，让阅读成为习惯。",
    site: context.site!.toString(),
    items: recent.map(({ date, book }) => ({
      title: `📖 ${book.title} —— ${book.author}`,
      pubDate: date,
      link: `/book/${formatDateISO(date)}`,
      // 纯文本摘要：书名 + 作者 + 分类 + 1 条精选金句，控制在 300 字以内
      description: `${book.author}《${book.title}》（${book.category}）\n\n今日精选金句：${book.quotes[0].text}`,
      categories: [book.category],
    })),
    customData: `<language>zh-cn</language><lastBuildDate>${buildTimeStr}</lastBuildDate><ttl>1440</ttl>`,
  });
}
