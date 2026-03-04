import rss from "@astrojs/rss";
import type { APIContext } from "astro";
import { getRecentBooks, formatDateISO } from "../data/books";

export function GET(context: APIContext) {
  const recent = getRecentBooks(30);

  return rss({
    title: "每日一书 · Daily Book",
    description: "每天推荐一本好书，附带精选金句，让阅读成为习惯。",
    site: context.site!.toString(),
    items: recent.map(({ date, book }) => ({
      title: `📖 ${book.title} —— ${book.author}`,
      pubDate: date,
      link: `/book/${formatDateISO(date)}`,
      description: `
        <h2>📖 ${book.title}</h2>
        <p><strong>作者：</strong>${book.author} | <strong>分类：</strong>${book.category} | <strong>评分：</strong>${book.rating}</p>
        <p>${book.desc}</p>
        <hr>
        <h3>📝 今日金句</h3>
        <blockquote><p>${book.quotes[0].text}</p><footer>——${book.author}《${book.title}》${book.quotes[0].page}</footer></blockquote>
        ${book.quotes.length > 1 ? `
        <h3>更多金句</h3>
        <ul>${book.quotes.slice(1, 4).map((q) => `<li>${q.text} <em>(${q.page})</em></li>`).join("")}</ul>
        ` : ""}
      `.trim(),
      categories: [book.category],
    })),
    customData: `<language>zh-cn</language>`,
  });
}
