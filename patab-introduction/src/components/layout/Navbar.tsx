/**
 * 固定顶栏：毛玻璃导航条。
 * 保持可读背景，滚动后进一步加深玻璃层。
 */
import { useRef, useState } from "react";
import { Menu, X } from "lucide-react";
import { gsap, ScrollTrigger, useGSAP } from "../../lib/gsap";
import CtaButton from "../common/CtaButton";
import { LINKS } from "../../data/links";

/** 站内二级页导航项 */
const NAV_ITEMS = [
  { label: "首页", href: "/" },
  { label: "安装教程", href: "/install/" },
  { label: "用户协议", href: "/user-agreement/" },
  { label: "隐私政策", href: "/privacy/" },
  { label: "文档", href: "/docs/" },
  { label: "更新日志", href: "/changelog/" },
];

export default function Navbar() {
  const navRef = useRef<HTMLElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

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
      <div className="absolute inset-0 opacity-95 transition-opacity duration-300 glass group-[.nav-scrolled]:opacity-100" />
      <nav className="relative mx-auto flex h-16 max-w-6xl items-center justify-between px-4 md:px-8">
        {/* Logo 字标 */}
        <a href="/" className="flex items-center gap-2">
          <img src="/logo.png" alt="" className="size-7" />
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

        <button
          type="button"
          aria-label={menuOpen ? "关闭导航菜单" : "打开导航菜单"}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
          className="inline-flex size-10 items-center justify-center rounded-full text-ink-900 transition-colors hover:bg-white/60 md:hidden"
        >
          {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </nav>

      {menuOpen && (
        <div className="relative mx-4 mb-3 rounded-2xl p-2 shadow-glass glass md:hidden">
          {NAV_ITEMS.map((item) => (
            <a
              key={item.href}
              href={item.href}
              onClick={() => setMenuOpen(false)}
              className="block rounded-xl px-4 py-3 text-sm font-medium text-ink-700 hover:bg-white/60 hover:text-ink-900"
            >
              {item.label}
            </a>
          ))}
        </div>
      )}
    </header>
  );
}
