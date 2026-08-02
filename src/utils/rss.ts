import type { Book } from "../schemas/book";

export function buildBookRssContent(book: Book, link: string): string {
  const sections: string[] = [
    `<p><strong>${book.author}《${book.title}》</strong></p>`,
    `<p><strong>分类：</strong>${book.category} · <strong>出版：</strong>${book.year} · <strong>页数：</strong>${book.pages} · <strong>评分：</strong>${book.rating}</p>`,
    "<h2>简介</h2>",
    `<p>${book.desc}</p>`,
  ];

  if (book.editorNote) {
    sections.push("<h2>编辑的话</h2>", `<p>${book.editorNote}</p>`);
  }

  if (book.body) {
    sections.push("<h2>推荐语</h2>", markdownToHtml(book.body));
  }

  sections.push(
    "<h2>精选金句</h2>",
    book.quotes
      .map(
        (quote) =>
          `<blockquote><p>${quote.text}</p><footer>—— ${book.author}《${book.title}》${quote.page}</footer></blockquote>`
      )
      .join("\n"),
    `<p><a href="${link}">阅读原文</a></p>`
  );

  return sections.join("\n");
}

export function markdownToHtml(markdown: string): string {
  return markdown
    .trim()
    .split(/\n{2,}/)
    .map((block) => {
      const lines = block.split("\n");
      if (lines.every((line) => line.startsWith("> "))) {
        const paragraph = lines.map((line) => line.replace(/^>\s*/, "")).join(" ");
        return `<blockquote><p>${paragraph}</p></blockquote>`;
      }
      if (lines.every((line) => line.startsWith("- "))) {
        const items = lines.map((line) => `<li>${line.replace(/^-\s+/, "")}</li>`).join("");
        return `<ul>${items}</ul>`;
      }
      if (block.startsWith("## ")) {
        return `<h2>${block.slice(3)}</h2>`;
      }
      return `<p>${lines.join("<br>")}</p>`;
    })
    .join("\n");
}
