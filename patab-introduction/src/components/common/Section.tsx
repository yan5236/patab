/**
 * 分区容器：统一各 section 的最大宽度、内边距与标题排版。
 * 标题/副标题带 data-reveal 标记，供各 section 的 GSAP 动画选择。
 */
import type { ReactNode, Ref } from "react";

interface SectionProps {
  id?: string;
  /** 区块主标题 */
  title?: string;
  /** 区块副标题 */
  subtitle?: string;
  /** 深色背景区（技术亮点）时反转文字颜色 */
  dark?: boolean;
  className?: string;
  children: ReactNode;
  /** 传给 <section> 的 ref，作为 useGSAP 的 scope */
  ref?: Ref<HTMLElement>;
}

export default function Section({
  id,
  title,
  subtitle,
  dark = false,
  className = "",
  children,
  ref,
}: SectionProps) {
  return (
    <section ref={ref} id={id} className={`py-16 md:py-28 ${className}`}>
      <div className="mx-auto w-full max-w-6xl px-4 md:px-8">
        {(title || subtitle) && (
          <div className="mb-10 text-center md:mb-16">
            {title && (
              <h2
                data-reveal
                className={`text-2xl font-bold tracking-tight md:text-4xl ${
                  dark ? "text-white" : "text-ink-900"
                }`}
              >
                {title}
              </h2>
            )}
            {subtitle && (
              <p
                data-reveal
                className={`mx-auto mt-4 max-w-2xl text-base md:text-lg ${
                  dark ? "text-white/60" : "text-ink-600"
                }`}
              >
                {subtitle}
              </p>
            )}
          </div>
        )}
        {children}
      </div>
    </section>
  );
}
