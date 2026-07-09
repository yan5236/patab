/**
 * 固定顶栏：毛玻璃导航条。
 * 保持可读背景，滚动后进一步加深玻璃层。
 */
import { useRef, useState } from "react";
import { Menu, X } from "lucide-react";
import { gsap, ScrollTrigger, useGSAP } from "../../lib/gsap";
import CtaButton from "../common/CtaButton";
import { LINKS } from "../../data/links";

/** GitHub logo（当前 lucide-react 版本已移除品牌图标，使用内联 SVG 代替） */
function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.31.465-2.381 1.235-3.221-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.911 1.23 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.084 8.199-11.386 0-6.627-5.373-12-12-12z" />
    </svg>
  );
}

/** 站内二级页导航项 */
const NAV_ITEMS = [
  { label: "首页", href: "/" },
  { label: "安装教程", href: "/install/" },
  { label: "用户协议", href: "/user-agreement/" },
  { label: "隐私政策", href: "/privacy/" },
  { label: "文档", href: "/docs/" },
  { label: "更新日志", href: "/changelog/" },
  { label: "开源仓库", href: LINKS.repository, icon: GitHubIcon, external: true },
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
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <a
                key={item.href}
                href={item.href}
                target={item.external ? "_blank" : undefined}
                rel={item.external ? "noopener noreferrer" : undefined}
                className="inline-flex items-center gap-1.5 text-sm text-ink-600 transition-colors hover:text-ink-900"
              >
                {Icon && <Icon className="size-4" />}
                {item.label}
              </a>
            );
          })}
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
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <a
                key={item.href}
                href={item.href}
                target={item.external ? "_blank" : undefined}
                rel={item.external ? "noopener noreferrer" : undefined}
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium text-ink-700 hover:bg-white/60 hover:text-ink-900"
              >
                {Icon && <Icon className="size-4" />}
                {item.label}
              </a>
            );
          })}
        </div>
      )}
    </header>
  );
}
