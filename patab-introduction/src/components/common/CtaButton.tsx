/**
 * CTA 按钮：统一渲染为 <a>，三种视觉变体，支持占位入口禁用态。
 * primary — 晨光渐变实底主按钮
 * glass   — 毛玻璃次级按钮
 * ghost   — 纯文字链接样式
 */
import type { ReactNode } from "react";

interface CtaButtonProps {
  href: string;
  variant?: "primary" | "glass" | "ghost";
  className?: string;
  disabled?: boolean;
  children: ReactNode;
}

const VARIANT_CLASS: Record<NonNullable<CtaButtonProps["variant"]>, string> = {
  primary:
    "bg-gradient-to-r from-dawn-500 to-lake-500 text-white shadow-lg shadow-dawn-500/30 hover:shadow-xl hover:shadow-dawn-500/40 hover:brightness-105",
  glass: "glass text-ink-900 shadow-glass hover:bg-white/75",
  ghost: "text-ink-600 hover:text-ink-900 underline-offset-4 hover:underline",
};

/** 渲染统一 CTA 链接，禁用时移除 href 并声明 aria-disabled。 */
export default function CtaButton({
  href,
  variant = "primary",
  className = "",
  disabled = false,
  children,
}: CtaButtonProps) {
  const disabledClass = disabled
    ? "pointer-events-none cursor-not-allowed opacity-45 shadow-none hover:shadow-none hover:brightness-100 hover:bg-transparent hover:text-inherit hover:no-underline"
    : "";

  return (
    <a
      href={disabled ? undefined : href}
      aria-disabled={disabled}
      // 注意：过渡属性刻意不包含 opacity/transform，避免与 GSAP 入场动画冲突
      className={`inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-medium transition-[color,background-color,box-shadow,filter] duration-300 md:text-base ${VARIANT_CLASS[variant]} ${disabledClass} ${className}`}
    >
      {children}
    </a>
  );
}
