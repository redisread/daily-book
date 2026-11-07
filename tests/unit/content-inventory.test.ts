import { mkdtempSync, mkdirSync, symlinkSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createInventory, verifyInventory, canonical, sha256, renderReport, outsideRepository } from "../../scripts/content-inventory";

function source(id = "fixture-book", date: string | null | undefined = "2026-01-01", body = "") {
  return {
    path: `src/data/books/${id}.md`,
    raw: `---\nid: ${id}\ntitle: 测试书\nauthor: 测试作者\ncategory: 测试\nyear: 2026\npages: 200\nrating: 8.5\ndesc: 原始简介\ncoverTitle: "测试\\n书"\ncoverAuthor: 作者简称\n${date === undefined ? "" : `publishedDate: ${date === null ? "null" : `'${date}'`}\n`}quotes:\n  - text: 第一条原文\n    page: 第一章\n  - text: 第二条原文\n    page: 第20页\n---\n${body}`,
  };
}

describe("Read-only content inventory", () => {
  it("preserves all fields, numeric types, cover newlines and quote order", () => {
    const report = createInventory([source()]);
    expect(verifyInventory(report).passed).toBe(true);
    const entry = report.entries[0];
    expect(entry.candidate.book).toMatchObject({ description: "原始简介", year: 2026, pages: 200, rating: 8.5, coverTitle: "测试\n书", coverAuthor: "作者简称" });
    expect(entry.candidate.quotes.map((q) => [q.text, q.sourceLabel, q.position])).toEqual([["第一条原文", "第一章", 0], ["第二条原文", "第20页", 1]]);
    expect(entry.hashes.legacy.desc.sha256).toBe(entry.hashes.book.description.sha256);
    expect(entry.hashes.sourceQuotes[0].page.sha256).toBe(entry.hashes.quotes[0].sourceLabel.sha256);
  });
  it("preserves Markdown whitespace and keeps the old trimmed semantics separately", () => {
    const rawBody = "\n## 正文\r\n\r\n  原文  \r\n";
    const report = createInventory([source("fixture-book", "2026-01-01", rawBody)]);
    expect(report.entries[0].source.rawBody).toBe(rawBody);
    expect(report.entries[0].candidate.issue.body).toBe(rawBody);
    expect(report.entries[0].hashes.rawBodySHA256).toBe(sha256(rawBody));
    expect(verifyInventory(report).passed).toBe(true);
  });
  it("preserves frontmatter body when there is no Markdown body", () => {
    const input = source(); input.raw = input.raw.replace("quotes:\n", "body: frontmatter正文\nquotes:\n");
    const report = createInventory([input]);
    expect(report.entries[0].source.bodyOrigin).toBe("frontmatter");
    expect(report.entries[0].candidate.issue.body).toBe("frontmatter正文");
    expect(verifyInventory(report).passed).toBe(true);
  });
  it("keeps both bodies and flags the old precedence instead of dropping either", () => {
    const input = source("fixture-book", "2026-01-01", "\nMarkdown正文\n");
    input.raw = input.raw.replace("quotes:\n", "body: frontmatter正文\nquotes:\n");
    const report = createInventory([input]);
    expect(report.entries[0].source.frontmatter.body).toBe("frontmatter正文");
    expect(report.entries[0].candidate.issue.body).toBe("\nMarkdown正文\n");
    expect(report.entries[0].deficiencies).toContain("frontmatter-body-shadowed-by-markdown (both retained)");
    expect(verifyInventory(report).passed).toBe(true);
  });
  it("does not invent missing notes and distinguishes missing/null dates", () => {
    const noDate = source("no-date", undefined); // Explicit undefined argument is replaced below to test omission.
    noDate.raw = noDate.raw.replace("publishedDate: '2026-01-01'\n", "");
    const report = createInventory([noDate, source("null-date", null)]);
    expect(report.summary.drafts).toBe(2);
    for (const row of report.entries) {
      expect(row.candidate.issue.issueNumber).toBeNull();
      expect(Object.hasOwn(row.candidate.issue, "editorNote")).toBe(false);
      expect(row.hashes.legacy.editorNote.present).toBe(false);
    }
    expect(report.entries[0].hashes.legacy.publishedDate.sha256).not.toBe(report.entries[1].hashes.legacy.publishedDate.sha256);
    expect(verifyInventory(report).passed).toBe(true);
  });
  it("flags a historical short editorNote but preserves its exact text", () => {
    const input = source(); input.raw = input.raw.replace("quotes:\n", "editorNote: 历史短评不补造\nquotes:\n");
    const report = createInventory([input]);
    expect(report.entries[0].candidate.issue.editorNote).toBe("历史短评不补造");
    expect(report.summary.existingEditorNoteOutsideNewLength).toBe(1);
    expect(verifyInventory(report).passed).toBe(true);
  });
  it("uses the existing chronological numbering without allocating draft numbers", () => {
    const report = createInventory([source("last", "2026-03-01"), source("draft", null), source("first", "2026-01-01")]);
    const ids = Object.fromEntries(report.entries.map((row) => [row.candidate.book.id, row.candidate.issue.issueNumber]));
    expect(ids).toEqual({ draft: null, first: 1, last: 2 });
    expect(report.summary.nextIssueNumber).toBe(3);
    expect(verifyInventory(report).passed).toBe(true);
  });
  it("does not merge same-title or revisit records", () => {
    const report = createInventory([source("base", "2026-01-01"), source("base-revisit", "2026-01-02")]);
    expect(report.summary.candidateBooks).toBe(2);
    expect(report.suspectedReRecommendations).toHaveLength(1);
    expect(report.revisitIdSignals).toEqual([{ id: "base-revisit", baseId: "base", baseExists: true }]);
    expect(report.entries.map((row) => row.candidate.issue.id).sort()).toEqual(["legacy-base", "legacy-base-revisit"]);
  });
  it("reports duplicate dates without changing dates or derived tie-break numbers", () => {
    const report = createInventory([source("z", "2026-01-01"), source("a", "2026-01-01")]);
    expect(report.duplicateDates).toEqual([{ date: "2026-01-01", ids: ["a", "z"] }]);
    expect(report.entries.map((row) => row.candidate.issue.issueNumber)).toEqual([1, 2]);
    expect(verifyInventory(report).errors).toContain("duplicate-publication-dates");
  });
  it("flags invalid calendar dates accepted by the legacy regex", () => {
    const report = createInventory([source("fixture-book", "2026-02-30")]);
    expect(report.invalidDates).toEqual(["2026-02-30"]);
    expect(verifyInventory(report).passed).toBe(false);
  });
  it("retains unknown metadata and raw source instead of losing it to schema stripping", () => {
    const input = source(); input.raw = input.raw.replace("quotes:\n", "customLegacyField: 不应丢失\nquotes:\n");
    const report = createInventory([input]);
    expect(report.entries[0].unmappedFrontmatterKeys).toEqual(["customLegacyField"]);
    expect(report.entries[0].source.frontmatter.customLegacyField).toBe("不应丢失");
    expect(report.entries[0].source.raw).toBe(input.raw);
    expect(verifyInventory(report).passed).toBe(true);
  });
  it("preserves invalid source raw bytes and records an error instead of inventing valid data", () => {
    const input = source(); input.raw = input.raw.replace("    page: 第一章\n", "");
    const report = createInventory([input]);
    expect(report.summary.invalidSources).toBe(1);
    expect(report.invalidSources[0].raw).toBe(input.raw);
    expect(report.entries).toHaveLength(0);
    expect(verifyInventory(report).passed).toBe(false);
  });
  it("detects quote mutation, field type changes and body whitespace loss", () => {
    for (const mutate of [
      (entry: ReturnType<typeof createInventory>["entries"][number]) => { entry.candidate.quotes[0].sourceLabel = "伪造来源"; },
      (entry: ReturnType<typeof createInventory>["entries"][number]) => { Reflect.set(entry.candidate.book, "year", "2026"); },
      (entry: ReturnType<typeof createInventory>["entries"][number]) => { entry.candidate.issue.body = entry.candidate.issue.body.trim(); },
    ]) {
      const report = createInventory([source("fixture-book", "2026-01-01", "\n 正文 \n")]);
      mutate(report.entries[0]); expect(verifyInventory(report).passed).toBe(false);
    }
  });
  it("is deterministic across input order and distinguishes missing, null and empty values", () => {
    expect(canonical({ present: false })).not.toBe(canonical({ present: true, value: null }));
    expect(canonical({ present: true, value: null })).not.toBe(canonical({ present: true, value: "" }));
    const a = source("a", "2026-01-01"); const b = source("b", "2026-01-02");
    expect(canonical(createInventory([a, b]))).toBe(canonical(createInventory([b, a])));
    expect(canonical({ a: 1, b: 2 })).toBe(canonical({ b: 2, a: 1 }));
  });
  it("escapes untrusted source titles in Markdown reports", () => {
    const a = source("a", "2026-01-01"); const b = source("b", "2026-01-02");
    a.raw = a.raw.replace("title: 测试书", "title: '<script>unsafe</script>'");
    b.raw = b.raw.replace("title: 测试书", "title: '<script>unsafe</script>'");
    const report = createInventory([a, b]);
    const text = renderReport(report, "a".repeat(40), verifyInventory(report));
    expect(text).not.toContain("<script>"); expect(text).toContain("&lt;script&gt;");
  });
  it("rejects output inside the source repository even through an outside symlink", () => {
    const owned = mkdtempSync(join(tmpdir(), "daily-book-inventory-"));
    try {
      const repo = join(owned, "repo"); mkdirSync(repo);
      symlinkSync(repo, join(owned, "outside-link"));
      expect(() => outsideRepository(repo, join(repo, "output"))).toThrow("outside");
      expect(() => outsideRepository(repo, join(owned, "outside-link", "output"))).toThrow("outside");
      expect(outsideRepository(repo, join(owned, "safe-output"))).toBe(join(realpathSync(owned), "safe-output"));
    } finally { rmSync(owned, { recursive: true, force: true }); }
  });

  it("detects summary tampering and missing source-file coverage", () => {
    const input = [source("a", "2026-01-01"), source("b", "2026-01-02")];
    const report = createInventory(input);
    expect(verifyInventory(report, input).passed).toBe(true);
    report.summary.quotes++;
    expect(verifyInventory(report, input).errors).toContain("summary:quotes:mismatch");
    const missing = createInventory(input.slice(0, 1));
    expect(verifyInventory(missing, input).errors).toContain("source-file-coverage-mismatch");
  });

});
