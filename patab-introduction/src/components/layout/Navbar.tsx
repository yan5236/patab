/**
 * 固定顶栏：毛玻璃导航条。
 * 初始透明，滚动越过首屏顶部后通过 ScrollTrigger toggleClass 加深背景。
 */
import { useRef } from "react";
import { gsap, ScrollTrigger, useGSAP } from "../../lib/gsap";
import CtaButton from "../common/CtaButton";
import { LINKS } from "../../data/links";

/** 锚点导航项 */
const NAV_ITEMS = [
  { label: "特性", href: "#features" },
  { label: "界面", href: "#showcase" },
  { label: "移动端", href: "#mobile" },
  { label: "技术", href: "#tech" },
  { label: "下载", href: "#download" },
];

export default function Navbar() {
  const navRef = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      // 滚动变色不含位移，reduced-motion 下也保留（保证可读性）
      ScrollTrigger.create({
        start: "80px top",
        toggleClass: { targets: navRef.current, className: "nav-scrolled" },
      });

      // 入场下滑动画仅在允许动效时执行
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.from(navRef.current, {
          yPercent: -100,
          duration: 0.8,
          ease: "power3.out",
        });
      });
    },
    { scope: navRef },
  );

  return (
    <header
      ref={navRef}
      className="group fixed inset-x-0 top-0 z-50 transition-colors duration-300"
    >
      {/* nav-scrolled 时显示的玻璃背景层 */}
      <div className="absolute inset-0 opacity-0 transition-opacity duration-300 glass group-[.nav-scrolled]:opacity-100" />
      <nav className="relative mx-auto flex h-16 max-w-6xl items-center justify-between px-4 md:px-8">
        {/* Logo 字标 */}
        <a href="#" className="flex items-center gap-2">
          <img src="/favicon.svg" alt="" className="size-7" />
          <span className="text-lg font-bold tracking-tight text-ink-900">
            PaTab
          </span>
        </a>

        {/* 中间锚点导航（移动端隐藏） */}
        <div className="hidden items-center gap-8 md:flex">
          {NAV_ITEMS.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="text-sm text-ink-600 transition-colors hover:text-ink-900"
            >
              {item.label}
            </a>
          ))}
        </div>

        <CtaButton href={LINKS.webApp} className="px-5! py-2! text-sm!">
          立即体验
        </CtaButton>
      </nav>
    </header>
  );
}
