/**
 * 二级信息页：复用首页视觉语言，承载安装、隐私与文档等静态内容。
 */
import GlassCard from "../common/GlassCard";
import type { InfoPage as InfoPageData } from "../../data/pages";

interface InfoPageProps {
  page: InfoPageData;
}

export default function InfoPage({ page }: InfoPageProps) {
  return (
    <main className="min-h-screen bg-gradient-to-b from-lake-300/35 via-dawn-300/20 to-transparent px-4 pb-20 pt-28 md:px-8 md:pt-36">
      <div className="mx-auto max-w-4xl">
        <p className="text-sm font-medium text-lake-500">PaTab</p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight text-ink-900 md:text-6xl">
          {page.title}
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-ink-600 md:text-lg">
          {page.subtitle}
        </p>

        <div className="mt-10 grid gap-5 md:grid-cols-2">
          {page.sections.map((section) => (
            <GlassCard key={section.title} className="p-6">
              <h2 className="text-xl font-semibold text-ink-900">
                {section.title}
              </h2>
              <ul className="mt-4 space-y-3 text-sm leading-relaxed text-ink-600 md:text-base">
                {section.items.map((item) => (
                  <li key={item} className="flex gap-3">
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-lake-500" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </GlassCard>
          ))}
        </div>
      </div>
    </main>
  );
}
