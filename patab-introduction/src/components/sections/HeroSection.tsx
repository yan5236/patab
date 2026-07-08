/**
 * 首屏 Hero：晨光渐变背景 + 大标题 + 三个 CTA 占位入口 +
 * 浏览器 Mockup 内嵌 PC 截图，四周悬浮玻璃磁贴。
 */
import { useRef } from "react";
import {
  Globe,
  Puzzle,
  Download,
  ChevronDown,
  Clock,
  Search,
  ListTodo,
  FolderOpen,
} from "lucide-react";
import { gsap, useGSAP } from "../../lib/gsap";
import BrowserMockup from "../common/BrowserMockup";
import CtaButton from "../common/CtaButton";
import { LINKS } from "../../data/links";

/** 悬浮装饰磁贴（仅桌面端渲染动画） */
const FLOAT_TILES = [
  { icon: Clock, className: "left-[2%] top-[6%] text-dawn-500" },
  { icon: Search, className: "right-[3%] top-[12%] text-lake-500" },
  { icon: ListTodo, className: "left-[5%] bottom-[18%] text-pine-500" },
  { icon: FolderOpen, className: "right-[6%] bottom-[10%] text-dawn-500" },
];

export default function HeroSection() {
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

          // —— 入场时间线：badge → 标题逐行 → 副标题 → CTA → mockup → 磁贴 ——
          const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
          tl.from("[data-hero-badge]", { y: 24, autoAlpha: 0, duration: 0.6 })
            .from(
              "[data-hero-title] > span",
              { y: 40, autoAlpha: 0, duration: 0.8, stagger: 0.12 },
              "-=0.3",
            )
            .from("[data-hero-subtitle]", { y: 24, autoAlpha: 0, duration: 0.6 }, "-=0.4")
            .from(
              "[data-hero-cta] > *",
              { y: 20, autoAlpha: 0, duration: 0.5, stagger: 0.08 },
              "-=0.3",
            )
            .from(
              "[data-hero-mockup]",
              {
                y: desktop ? 80 : 40,
                scale: desktop ? 0.94 : 1,
                autoAlpha: 0,
                duration: 1,
                ease: "expo.out",
              },
              "-=0.2",
            );

          if (desktop) {
            // 磁贴弹入 + 持续浮动
            tl.from(
              "[data-hero-tile]",
              {
                scale: 0,
                autoAlpha: 0,
                duration: 0.8,
                stagger: 0.1,
                ease: "elastic.out(1, 0.6)",
              },
              "-=0.5",
            );
            gsap.utils.toArray<HTMLElement>("[data-hero-tile]").forEach((tile, i) => {
              gsap.to(tile, {
                y: "+=12",
                repeat: -1,
                yoyo: true,
                ease: "sine.inOut",
                duration: 3 + i * 0.5,
                delay: 1.6,
              });
            });

            // 滚出首屏时的轻视差：mockup 上移、色斑反向
            gsap.to("[data-hero-mockup]", {
              y: -60,
              ease: "none",
              scrollTrigger: {
                trigger: sectionRef.current,
                start: "top top",
                end: "bottom top",
                scrub: true,
              },
            });
            gsap.to("[data-hero-blob]", {
              y: 100,
              ease: "none",
              scrollTrigger: {
                trigger: sectionRef.current,
                start: "top top",
                end: "bottom top",
                scrub: true,
              },
            });
          }

          // 向下滚动提示呼吸动画
          gsap.to("[data-hero-scroll-hint]", {
            y: 8,
            repeat: -1,
            yoyo: true,
            ease: "sine.inOut",
            duration: 1.2,
          });
        },
      );
    },
    { scope: sectionRef },
  );

  return (
    <section
      ref={sectionRef}
      className="relative overflow-hidden pb-16 pt-28 md:pb-24 md:pt-36"
    >
      {/* 晨光渐变背景 + 模糊色斑景深 */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-lake-300/40 via-dawn-300/25 to-transparent" />
      <div
        data-hero-blob
        className="absolute -left-24 top-16 -z-10 size-96 rounded-full bg-dawn-300/40 blur-3xl"
      />
      <div
        data-hero-blob
        className="absolute -right-32 top-48 -z-10 size-[28rem] rounded-full bg-lake-300/50 blur-3xl"
      />

      <div className="mx-auto max-w-6xl px-4 text-center md:px-8">
        {/* 玻璃胶囊 badge */}
        <span
          data-hero-badge
          className="inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-medium text-ink-600 glass md:text-sm"
        >
          ✦ 全新的浏览器新标签页
        </span>

        {/* 两行主标题（各占一个 span 供逐行动画） */}
        <h1
          data-hero-title
          className="mt-6 text-4xl font-bold leading-tight tracking-tight text-ink-900 md:text-6xl"
        >
          <span className="block">像手机桌面一样的</span>
          <span className="block bg-gradient-to-r from-dawn-500 to-lake-500 bg-clip-text text-transparent">
            浏览器新标签页
          </span>
        </h1>

        <p
          data-hero-subtitle
          className="mx-auto mt-6 max-w-xl text-base text-ink-600 md:text-lg"
        >
          网格磁贴 · 一站式搜索 · 待办管理 · 毛玻璃美学
          <br className="md:hidden" />
          <span className="hidden md:inline"> — </span>
          数据纯本地存储，隐私无忧
        </p>

        {/* 三个占位 CTA：网页版 / 插件商店 / 离线下载 */}
        <div
          data-hero-cta
          className="mt-8 flex flex-col items-center justify-center gap-3 md:flex-row md:gap-4"
        >
          <CtaButton href={LINKS.webApp} className="w-full max-w-xs md:w-auto">
            <Globe className="size-4" />
            打开网页版
          </CtaButton>
          <CtaButton
            href={LINKS.chromeStore}
            variant="glass"
            className="w-full max-w-xs md:w-auto"
          >
            <Puzzle className="size-4" />
            添加到 Chrome / Edge
          </CtaButton>
          <CtaButton href={LINKS.offlineZip} variant="ghost">
            <Download className="size-4" />
            离线插件下载
          </CtaButton>
        </div>

        {/* 浏览器 Mockup + 悬浮磁贴 */}
        <div className="relative mx-auto mt-12 max-w-5xl md:mt-16">
          {FLOAT_TILES.map(({ icon: Icon, className }, i) => (
            <div
              key={i}
              data-hero-tile
              className={`absolute z-10 hidden size-14 items-center justify-center rounded-2xl shadow-glass glass md:flex ${className}`}
            >
              <Icon className="size-6" />
            </div>
          ))}
          <div data-hero-mockup>
            <BrowserMockup>
              <img
                src="/pc-version-introduction-image.png"
                alt="PaTab 桌面端界面：大字时钟、搜索框、快捷方式网格、待办挂件与 Dock 栏"
                className="aspect-[1680/957] w-full object-cover"
                fetchPriority="high"
                decoding="async"
              />
            </BrowserMockup>
          </div>
        </div>

        {/* 向下滚动提示 */}
        <div
          data-hero-scroll-hint
          className="mt-10 flex justify-center text-ink-600/60"
        >
          <ChevronDown className="size-6" />
        </div>
      </div>
    </section>
  );
}
