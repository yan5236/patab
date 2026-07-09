import assert from "node:assert/strict";
import test from "node:test";
import { parseChangelogMarkdown } from "../src/lib/changelog.ts";

test("解析更新日志标题、版本、分类和条目", () => {
  const result = parseChangelogMarkdown(`# PaTab 更新日志

## v0.1.0 - 2026-07-09

### 新增
- 支持更新日志页面。

### 优化
- 维护记录时只需要修改 Markdown 文件。
`);

  assert.equal(result.title, "PaTab 更新日志");
  assert.deepEqual(result.entries, [
    {
      version: "v0.1.0",
      date: "2026-07-09",
      categories: [
        { title: "新增", items: ["支持更新日志页面。"] },
        { title: "优化", items: ["维护记录时只需要修改 Markdown 文件。"] },
      ],
    },
  ]);
});

test("忽略版本段落外的列表项", () => {
  const result = parseChangelogMarkdown(`# PaTab 更新日志

- 不属于任何版本

## v0.1.0

- 默认归入更新分类。
`);

  assert.deepEqual(result.entries, [
    {
      version: "v0.1.0",
      categories: [{ title: "更新", items: ["默认归入更新分类。"] }],
    },
  ]);
});
