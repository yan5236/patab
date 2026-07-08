/**
 * 页脚：logo + slogan + 占位链接 + 版权信息。
 */
import { LINKS } from "../../data/links";

/** 页脚站内链接 */
const FOOTER_LINKS = [
  { label: "首页", href: "/" },
  { label: "安装教程", href: "/install" },
  { label: "隐私政策", href: "/privacy" },
  { label: "文档", href: "/docs" },
  { label: "反馈建议", href: LINKS.feedback },
];

export default function Footer() {
  return (
    <footer className="border-t border-ink-900/10 bg-white/40">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-4 py-10 md:flex-row md:justify-between md:px-8">
        <div className="flex items-center gap-2">
          <img src="/favicon.svg" alt="" className="size-6" />
          <span className="font-bold text-ink-900">PaTab</span>
          <span className="ml-2 text-sm text-ink-600">
            像手机桌面一样的浏览器新标签页
          </span>
        </div>

        <div className="flex items-center gap-6">
          {FOOTER_LINKS.map((item) => (
            <a
              key={item.label}
              href={item.href}
              className="text-sm text-ink-600 transition-colors hover:text-ink-900"
            >
              {item.label}
            </a>
          ))}
        </div>
      </div>
      <p className="pb-8 text-center text-xs text-ink-600/70">
        © 2026 PaTab · 所有数据仅保存在本地浏览器
      </p>
    </footer>
  );
}
