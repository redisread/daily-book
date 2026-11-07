# 历史内容只读盘点（阶段2B）

本工具只读取指定Git提交的 `src/data/books/*.md`、现行loader/schema及期号规则，不改源内容、schema或任何数据库，也不生成SQL/导入动作。输出是等待审查的Book/Issue/Quote候选，不是自动合书或导入批准。

```sh
npm ci --ignore-scripts
npx --no-install tsx scripts/content-inventory.ts --source-ref origin/main --out ../daily-book-inventory-output
npx --no-install vitest run tests/unit/content-inventory.test.ts
```

先fetch再选择来源；输出记录解析后的精确SHA，复现时改用该SHA。源代码、package/lock与所选来源不一致会停止，避免混用另一套规则。输出必须在仓库外（包括symlink实际目标），拒绝覆盖不同内容的已有文件。

输出：
- `inventory.json`：每文件原始文本、Git blob ID/SHA256，原frontmatter和正文，确定性候选映射、字段presence/hash、缺项及疑似重荐/重复引文线索。
- `verification.json`：按现行loader反向投影逐字段核对、文件覆盖、原始正文及现行期号验证。
- `report.md`：数量、历史缺项和人工复核事项。无动态时间戳；相同来源、工具提交及依赖环境可重复相同字节。

Book保留原数值/文本类型及排版封面；desc→description，quotes.page→sourceLabel。每源记录仍是独立候选Book和Issue，不能按标题/作者直接合书。缺失editorNote保持缺失。正文保留原始换行/空白，另记旧loader.trim语义；若frontmatter与Markdown都提供body，两者均留档，不静默丢弃。

本工具不检查外部引文真实性、书目版权或线上数据库状态，不添加createdAt/updatedAt/version等非源字段，不处理历史已删除文件。新发布门槛与历史内容缺项是两回事；不得为满足新门槛补造历史材料。
