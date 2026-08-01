/**
 * 开放源代码许可页面：展示介绍站与网页端的生产依赖及许可证正文。
 */
import { useEffect, useState } from "react";
import { Boxes, ExternalLink, FileText } from "lucide-react";
import GlassCard from "../common/GlassCard";

interface LicensePackage {
  name: string;
  version: string;
  licenses: string;
  repository?: string;
  licenseText?: string;
}

interface LicenseProject {
  id: string;
  name: string;
  packages: LicensePackage[];
}

interface LicenseDocument {
  projects: LicenseProject[];
}

type LoadState =
  | { status: "loading" }
  | { status: "ready"; data: LicenseDocument }
  | { status: "error"; message: string };

/** 拉取生成后的许可证 JSON，失败时保留明确提示。 */
async function loadLicenses() {
  const response = await fetch("/open-source-licenses.json", {
    cache: "no-cache",
  });
  if (!response.ok) {
    throw new Error("开放源代码许可暂时无法读取，请稍后再试。");
  }
  return (await response.json()) as LicenseDocument;
}

/** 从自定义许可证描述中提取官方许可地址。 */
function findLicenseUrl(licenses: string) {
  return licenses.match(/https?:\/\/[^\s]+/)?.[0]?.replace(/[.)]+$/, "");
}

/** 展示单个依赖的版本、来源与可折叠许可证正文。 */
function LicenseItem({ dependency }: { dependency: LicensePackage }) {
  const licenseUrl = findLicenseUrl(dependency.licenses);

  return (
    <article className="rounded-2xl border border-ink-900/10 bg-white/45 px-4 py-4 sm:px-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="break-all font-mono text-sm font-semibold text-ink-900 sm:text-base">
            {dependency.name}
          </h3>
          <p className="mt-1 font-mono text-xs text-ink-600">
            v{dependency.version}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-lake-300/35 px-3 py-1 text-xs font-semibold text-ink-900">
            {dependency.licenses}
          </span>
          {dependency.repository && (
            <a
              href={dependency.repository}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-lake-500 transition-colors hover:bg-white/70 hover:text-ink-900"
            >
              源代码
              <ExternalLink className="size-3.5" />
            </a>
          )}
          {licenseUrl && (
            <a
              href={licenseUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-lake-500 transition-colors hover:bg-white/70 hover:text-ink-900"
            >
              许可页面
              <ExternalLink className="size-3.5" />
            </a>
          )}
        </div>
      </div>

      {dependency.licenseText && (
        <details className="mt-4 border-t border-ink-900/10 pt-3">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-ink-600 transition-colors hover:text-ink-900">
            <FileText className="size-4" />
            查看许可证正文
          </summary>
          <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-ink-900 px-4 py-4 font-mono text-xs leading-relaxed text-white/80">
            {dependency.licenseText}
          </pre>
        </details>
      )}
    </article>
  );
}

/** 根据加载状态展示提示或两个项目的依赖清单。 */
function LicenseContent({ state }: { state: LoadState }) {
  if (state.status === "loading") {
    return <GlassCard className="p-6 text-sm text-ink-600">正在读取许可清单...</GlassCard>;
  }
  if (state.status === "error") {
    return <GlassCard className="p-6 text-sm text-ink-600">{state.message}</GlassCard>;
  }

  return (
    <div className="space-y-8">
      {state.data.projects.map((project) => (
        <GlassCard key={project.id} className="overflow-hidden p-5 sm:p-7">
          <div className="flex items-center justify-between gap-4 border-b border-ink-900/10 pb-5">
            <div>
              <p className="flex items-center gap-2 text-sm font-medium text-lake-500">
                <Boxes className="size-4" />
                生产依赖
              </p>
              <h2 className="mt-2 text-2xl font-bold text-ink-900">
                {project.name}
              </h2>
            </div>
            <span className="shrink-0 rounded-full bg-dawn-300/35 px-3 py-1 text-sm font-semibold text-ink-900">
              {project.packages.length} 项
            </span>
          </div>

          <div className="mt-5 space-y-3">
            {project.packages.map((dependency) => (
              <LicenseItem
                key={`${dependency.name}@${dependency.version}`}
                dependency={dependency}
              />
            ))}
          </div>
        </GlassCard>
      ))}
    </div>
  );
}

/** 开放源代码许可二级页。 */
export default function OpenSourceLicensesPage() {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let active = true;
    loadLicenses()
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
              : "开放源代码许可暂时无法读取，请稍后再试。",
        });
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="min-h-screen bg-gradient-to-b from-lake-300/35 via-dawn-300/20 to-transparent px-4 pb-20 pt-28 md:px-8 md:pt-36">
      <div className="mx-auto max-w-5xl">
        <p className="text-sm font-medium text-lake-500">PaTab</p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight text-ink-900 md:text-6xl">
          开放源代码许可
        </h1>
        <p className="mt-5 max-w-3xl text-base leading-relaxed text-ink-600 md:text-lg">
          感谢这些开源项目与软件组件为 PaTab 提供可靠基础。以下清单由工具从介绍网站和网页端的生产依赖自动生成。
        </p>

        <div className="mt-10">
          <LicenseContent state={state} />
        </div>
      </div>
    </main>
  );
}
