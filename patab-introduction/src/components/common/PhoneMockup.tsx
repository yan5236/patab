/**
 * 手机 Mockup：圆角机身 + 顶部挖孔摄像头，
 * 用来框住移动版产品截图。
 */
import type { ReactNode } from "react";

interface PhoneMockupProps {
  className?: string;
  children: ReactNode;
}

export default function PhoneMockup({
  className = "",
  children,
}: PhoneMockupProps) {
  return (
    <div
      className={`relative overflow-hidden rounded-[2.5rem] border-[6px] border-ink-900 bg-ink-900 shadow-2xl shadow-ink-900/30 ${className}`}
    >
      {/* 挖孔摄像头 */}
      <div className="absolute left-1/2 top-2.5 z-10 size-3 -translate-x-1/2 rounded-full bg-ink-900" />
      <div className="overflow-hidden rounded-[2.1rem]">{children}</div>
    </div>
  );
}
