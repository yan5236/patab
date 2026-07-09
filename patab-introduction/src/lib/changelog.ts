export interface ChangelogCategory {
  title: string;
  items: string[];
}

export interface ChangelogEntry {
  version: string;
  date?: string;
  categories: ChangelogCategory[];
}

export interface ChangelogDocument {
  title: string;
  entries: ChangelogEntry[];
}

/** 拆分二级标题中的版本号和日期，允许只写版本号。 */
function parseEntryHeading(heading: string) {
  const [version, ...dateParts] = heading.split(/\s+-\s+/);
  const date = dateParts.join(" - ").trim();
  return {
    version: version.trim(),
    ...(date ? { date } : {}),
  };
}

/** 确保当前版本段落存在分类，未写三级标题时归入“更新”。 */
function ensureCategory(entry: ChangelogEntry, title = "更新") {
  const existing = entry.categories.at(-1);
  if (existing) return existing;

  const category = { title, items: [] };
  entry.categories.push(category);
  return category;
}

/** 解析更新日志 Markdown，只支持本页约定的标题、版本、分类和列表项。 */
export function parseChangelogMarkdown(markdown: string): ChangelogDocument {
  const document: ChangelogDocument = {
    title: "PaTab 更新日志",
    entries: [],
  };
  let currentEntry: ChangelogEntry | undefined;

  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith("# ")) {
      document.title = line.slice(2).trim() || document.title;
      continue;
    }

    if (line.startsWith("## ")) {
      const entry = {
        ...parseEntryHeading(line.slice(3).trim()),
        categories: [],
      };
      document.entries.push(entry);
      currentEntry = entry;
      continue;
    }

    if (line.startsWith("### ") && currentEntry) {
      currentEntry.categories.push({
        title: line.slice(4).trim() || "更新",
        items: [],
      });
      continue;
    }

    if (line.startsWith("- ") && currentEntry) {
      ensureCategory(currentEntry).items.push(line.slice(2).trim());
    }
  }

  return document;
}
