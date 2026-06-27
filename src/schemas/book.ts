import { z } from "zod";

export const QuoteSchema = z.object({
  text: z.string().min(1, "金句文本不能为空"),
  page: z.string().min(1, "出处页码不能为空"),
});

export const BookSchema = z.object({
  id: z
    .string()
    .min(1, "书籍 ID 不能为空")
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "书籍 ID 必须是 kebab-case"),
  title: z.string().min(1, "书名不能为空"),
  author: z.string().min(1, "作者不能为空"),
  category: z.string().min(1, "分类不能为空"),
  year: z.number().int("出版年份必须是整数"),
  pages: z.number().int("页数必须是整数").positive("页数必须为正数"),
  rating: z.number().positive("评分必须为正数"),
  desc: z.string().min(1, "简介不能为空"),
  coverBg: z.string().min(1, "封面背景不能为空"),
  coverTitle: z.string().min(1, "封面标题不能为空"),
  coverAuthor: z.string().min(1, "封面作者不能为空"),
  publishedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "发布日期格式必须为 YYYY-MM-DD").nullable().optional(),
  quotes: z.array(QuoteSchema).min(1, "至少一条金句").max(10, "最多 10 条金句"),
});

export type Quote = z.infer<typeof QuoteSchema>;
export type Book = z.infer<typeof BookSchema>;
