/**
 * 更新日志页面：运行时读取 public/changelog.md 并展示版本记录。
 */
import { useEffect, useState } from "react";
import { CalendarDays, ListChecks } from "lucide-react";
import GlassCard from "../common/GlassCard";
import {
  parseChangelogMarkdown,
  type ChangelogDocument,
} from "../../lib/changelog";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; data: ChangelogDocument }
  | { status: "error"; message: string };

/** 拉取并解析公开 Markdown 文件，失败时给页面保留可读提示。 */
async function loadChangelog() {
  const response = await fetch("/changelog.md", { cache: "no-cache" });
  if (!response.ok) {
    throw new Error("更新日志暂时无法读取，请稍后再试。");
  }
  return parseChangelogMarkdown(await response.text());
}

/** 根据加载状态渲染正文区域，避免主组件堆积条件分支。 */
function renderContent(state: LoadState) {
  if (state.status === "loading") {
    return (
      <GlassCard className="p-6 text-sm text-ink-600">
        正在读取更新日志...
      </GlassCard>
    );
  }

  if (state.status === "error") {
    return (
      <GlassCard className="p-6 text-sm text-ink-600">
        {state.message}
      </GlassCard>
    );
  }

  if (state.data.entries.length === 0) {
    return (
      <GlassCard className="p-6 text-sm text-ink-600">
        暂时还没有更新记录。
      </GlassCard>
    );
  }

  return (
    <div className="space-y-5">
      {state.data.entries.map((entry) => (
        <GlassCard key={`${entry.version}-${entry.date ?? ""}`} className="p-6">
          <div className="flex flex-col gap-3 border-b border-ink-900/10 pb-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="flex items-center gap-2 text-sm font-medium text-lake-500">
                <ListChecks className="size-4" />
                版本更新
              </p>
              <h2 className="mt-2 text-2xl font-bold text-ink-900">
                {entry.version}
              </h2>
            </div>
            {entry.date && (
              <p className="flex items-center gap-2 text-sm text-ink-600">
                <CalendarDays className="size-4" />
                {entry.date}
              </p>
            )}
          </div>

          <div className="mt-5 grid gap-5 md:grid-cols-2">
            {entry.categories.map((category) => (
              <section key={category.title}>
                <h3 className="text-base font-semibold text-ink-900">
                  {category.title}
                </h3>
                <ul className="mt-3 space-y-2 text-sm leading-relaxed text-ink-600">
                  {category.items.map((item) => (
                    <li key={item} className="flex gap-3">
                      <span className="mt-2 size-1.5 shrink-0 rounded-full bg-dawn-500" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </GlassCard>
      ))}
    </div>
  );
}

export default function ChangelogPage() {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let active = true;

    loadChangelog()
      .then((data) => {
        if (active) setState({ status: "ready", data });
      })
      .catch((error: unknown) => {
        if (!active) return;
        setState({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "更新日志暂时无法读取，请稍后再试。",
        });
      });

    return () => {
      active = false;
    };
  }, []);

  const title = state.status === "ready" ? state.data.title : "PaTab 更新日志";

  return (
    <main className="min-h-screen bg-gradient-to-b from-lake-300/35 via-dawn-300/20 to-transparent px-4 pb-20 pt-28 md:px-8 md:pt-36">
      <div className="mx-auto max-w-4xl">
        <p className="text-sm font-medium text-lake-500">PaTab</p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight text-ink-900 md:text-6xl">
          {title}
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-ink-600 md:text-lg">
          查看 PaTab 最近带来的新功能、体验优化和问题修复。
        </p>

        <div className="mt-10">{renderContent(state)}</div>
      </div>
    </main>
  );
}
