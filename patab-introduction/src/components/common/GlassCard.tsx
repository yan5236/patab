/**
 * 毛玻璃卡片：全站统一的玻璃面板容器。
 * dark 变体用于深色背景区（技术亮点）。
 */
import type { HTMLAttributes } from "react";

interface GlassCardProps extends HTMLAttributes<HTMLDivElement> {
  /** 深色玻璃变体 */
  dark?: boolean;
}

export default function GlassCard({
  dark = false,
  className = "",
  children,
  ...rest
}: GlassCardProps) {
  return (
    <div
      className={`rounded-2xl shadow-glass ${dark ? "glass-dark" : "glass"} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}
