/**
 * 浏览器窗口 Mockup：macOS 三色圆点 + 假地址栏，
 * 用来框住 PC 版产品截图，营造真实使用场景。
 */
import type { ReactNode } from "react";

interface BrowserMockupProps {
  /** 假地址栏显示的地址 */
  url?: string;
  className?: string;
  children: ReactNode;
}

export default function BrowserMockup({
  url = "patab.newtab",
  className = "",
  children,
}: BrowserMockupProps) {
  return (
    <div
      className={`overflow-hidden rounded-2xl border border-white/60 bg-white/70 shadow-2xl shadow-ink-900/20 backdrop-blur-xl ${className}`}
    >
      {/* 窗口标题栏 */}
      <div className="flex items-center gap-2 px-4 py-3">
        <span className="size-3 rounded-full bg-[#ff5f57]" />
        <span className="size-3 rounded-full bg-[#febc2e]" />
        <span className="size-3 rounded-full bg-[#28c840]" />
        {/* 假地址栏 */}
        <div className="ml-3 flex h-7 flex-1 items-center justify-center rounded-lg bg-ink-900/5 text-xs text-ink-600">
          {url}
        </div>
      </div>
      {children}
    </div>
  );
}
