/**
 * 小组件区：介绍「组件商店 + 桌面小组件」能力。
 * 左侧 —— 用纯 HTML/CSS 复刻一个「待办事项」小组件，放在毛玻璃桌面舞台上，
 *         直观呈现小组件摆上桌面的样子；
 * 右侧 —— 文案 + 组件商店路线图网格，已上线的高亮、规划中的压暗，并附「更多」占位，
 *         传达「持续上新」。
 * 动画风格与其它分区一致：标题 reveal + 舞台侧向滑入 + 卡片 stagger（桌面端小组件轻微浮动）。
 */
import { useRef } from "react";
import { Maximize2, Plus, Star, Check, Sparkles } from "lucide-react";
import { gsap, useGSAP } from "../../lib/gsap";
import Section from "../common/Section";
import { WIDGETS } from "../../data/widgets";

/** 预览小组件里的示例待办项（仅展示用） */
const PREVIEW_TODOS = [
  { text: "回复产品需求邮件", done: false, important: true },
  { text: "整理本周周报", done: false, important: false },
  { text: "预约周五的会议室", done: false, important: false },
  { text: "提交月度报销", done: true, important: false },
];

export default function WidgetsSection() {
  const sectionRef = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add(
        {
          desktop: "(min-width: 768px) and (prefers-reduced-motion: no-preference)",
          mobile: "(max-width: 767px) and (prefers-reduced-motion: no-preference)",
        },
        (ctx) => {
          const { desktop } = ctx.conditions as { desktop: boolean };

          // 区块标题 reveal
          gsap.from("[data-reveal]", {
            y: 32,
            autoAlpha: 0,
            duration: 0.7,
            ease: "power3.out",
            stagger: 0.1,
            scrollTrigger: {
              trigger: sectionRef.current,
              start: "top 75%",
              once: true,
            },
          });

          // 预览舞台：桌面从左滑入，移动纵向 fade-up
          gsap.from("[data-widget-stage]", {
            x: desktop ? -60 : 0,
            y: desktop ? 0 : 40,
            autoAlpha: 0,
            duration: 0.8,
            ease: "power3.out",
            scrollTrigger: {
              trigger: "[data-widget-stage]",
              start: "top 78%",
              once: true,
            },
          });

          // 组件商店卡片 stagger reveal
          gsap.from("[data-widget-card]", {
            y: 32,
            autoAlpha: 0,
            duration: 0.6,
            ease: "power3.out",
            stagger: 0.08,
            scrollTrigger: {
              trigger: "[data-widget-grid]",
              start: "top 82%",
              once: true,
            },
          });

          // 桌面端：预览小组件轻微浮动，营造「悬浮在桌面上」的生动感
          if (desktop) {
            gsap.to("[data-widget-float]", {
              y: "+=10",
              repeat: -1,
              yoyo: true,
              ease: "sine.inOut",
              duration: 3.2,
              delay: 1,
            });
          }
        },
      );
    },
    { scope: sectionRef },
  );

  return (
    <Section
      ref={sectionRef}
      id="widgets"
      title="不止快捷方式，桌面还能装下小组件"
      subtitle="从 Dock 打开组件商店，把待办这样的小工具直接摆上桌面。更多小组件正在陆续上新。"
    >
      <div className="flex flex-col items-center gap-10 md:flex-row md:gap-14">
        {/* 左：毛玻璃桌面舞台 + 待办事项小组件预览 */}
        <div
          data-widget-stage
          className="relative w-full overflow-hidden rounded-[2rem] border border-white/50 bg-gradient-to-br from-lake-300/40 via-white/20 to-dawn-300/40 p-8 shadow-glass md:w-1/2 md:p-12"
        >
          {/* 背景模糊色斑，制造桌面景深 */}
          <div className="pointer-events-none absolute -right-8 -top-8 size-40 rounded-full bg-dawn-300/40 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-10 -left-6 size-40 rounded-full bg-lake-300/50 blur-2xl" />

          {/* 待办事项小组件卡片（纯展示复刻） */}
          <div
            data-widget-float
            className="relative mx-auto w-full max-w-xs rounded-3xl p-4 shadow-glass glass"
          >
            {/* 标题栏 */}
            <div className="mb-2.5 flex items-center justify-between px-1">
              <span className="text-sm font-semibold text-ink-900">
                待办事项
              </span>
              <Maximize2 className="size-3.5 text-ink-600/60" />
            </div>

            {/* 待办列表 */}
            <ul className="flex flex-col gap-0.5">
              {PREVIEW_TODOS.map((todo) => (
                <li
                  key={todo.text}
                  className="flex items-center gap-2.5 rounded-lg px-1.5 py-1.5"
                >
                  {/* 自绘勾选框，配色贴合站点主题 */}
                  <span
                    className={`flex size-4 shrink-0 items-center justify-center rounded-md border ${
                      todo.done
                        ? "border-lake-500 bg-lake-500 text-white"
                        : "border-ink-600/30"
                    }`}
                  >
                    {todo.done && <Check className="size-3" strokeWidth={3} />}
                  </span>
                  <span
                    className={`flex-1 truncate text-sm ${
                      todo.done
                        ? "text-ink-600/50 line-through"
                        : "text-ink-900"
                    }`}
                  >
                    {todo.text}
                  </span>
                  {todo.important && (
                    <Star className="size-3.5 shrink-0 fill-dawn-500 text-dawn-500" />
                  )}
                </li>
              ))}
            </ul>

            {/* 新增输入框（占位样式） */}
            <div className="mt-2 flex items-center gap-1.5 rounded-xl bg-white/50 px-2.5 py-1.5">
              <span className="flex-1 text-sm text-ink-600/60">添加待办…</span>
              <Plus className="size-4 text-ink-600/60" />
            </div>
          </div>
        </div>

        {/* 右：组件商店路线图 */}
        <div className="w-full md:w-1/2">
          <div className="mb-5 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium text-ink-600 glass">
            <Sparkles className="size-3.5 text-dawn-500" />
            组件商店 · 持续上新
          </div>

          <div data-widget-grid className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {WIDGETS.map((widget) => {
              const live = widget.status === "live";
              return (
                <div
                  key={widget.title}
                  data-widget-card
                  className="flex items-start gap-3 rounded-2xl p-4 shadow-glass glass"
                >
                  <span
                    className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${
                      live
                        ? "bg-pine-500/15 text-pine-500"
                        : "bg-ink-900/5 text-ink-600"
                    }`}
                  >
                    <widget.icon className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate text-sm font-semibold text-ink-900">
                        {widget.title}
                      </h3>
                      <span
                        className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium ${
                          live
                            ? "bg-pine-500/15 text-pine-500"
                            : "bg-ink-900/5 text-ink-600"
                        }`}
                      >
                        {live ? "已上线" : "敬请期待"}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-xs leading-relaxed text-ink-600">
                      {widget.description}
                    </p>
                  </div>
                </div>
              );
            })}

            {/* 「更多」占位卡：虚线描边，暗示路线图仍在延展 */}
            <div
              data-widget-card
              className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-ink-600/25 p-4 text-sm text-ink-600/70"
            >
              <Plus className="size-4" />
              更多小组件开发中
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}
