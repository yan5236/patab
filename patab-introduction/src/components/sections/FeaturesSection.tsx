/**
 * 核心特性区：6 张毛玻璃卡片网格，滚动进入时 stagger reveal。
 */
import { useRef } from "react";
import { gsap, useGSAP } from "../../lib/gsap";
import Section from "../common/Section";
import GlassCard from "../common/GlassCard";
import { FEATURES } from "../../data/features";

export default function FeaturesSection() {
  const sectionRef = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add("(prefers-reduced-motion: no-preference)", () => {
        // 区块标题 reveal
        gsap.from("[data-reveal]", {
          y: 32,
          autoAlpha: 0,
          duration: 0.7,
          ease: "power3.out",
          stagger: 0.1,
          scrollTrigger: {
            trigger: sectionRef.current,
            start: "top 75%",
            once: true,
          },
        });

        // 卡片 stagger reveal
        gsap.from("[data-feature-card]", {
          y: 40,
          autoAlpha: 0,
          duration: 0.7,
          ease: "power3.out",
          stagger: 0.08,
          scrollTrigger: {
            trigger: "[data-feature-grid]",
            start: "top 80%",
            once: true,
          },
        });
      });
    },
    { scope: sectionRef },
  );

  return (
    <Section
      ref={sectionRef}
      id="features"
      title="一块屏幕，装下你的整个工作台"
      subtitle="书签、搜索、待办、文件夹——常用的一切都以磁贴形式铺在眼前，像使用手机桌面一样自然。"
    >
      <div
        data-feature-grid
        className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 md:gap-6"
      >
        {FEATURES.map((feature) => (
          <GlassCard
            key={feature.title}
            data-feature-card
            className="p-6 transition-[translate,box-shadow,background-color,border-color] duration-300 hover:-translate-y-1 hover:border-white/90 hover:bg-white/70 md:p-7"
          >
            <div
              className={`mb-4 flex size-12 items-center justify-center rounded-xl ${feature.iconClass}`}
            >
              <feature.icon className="size-6" />
            </div>
            <h3 className="text-lg font-semibold text-ink-900">
              {feature.title}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-600">
              {feature.description}
            </p>
          </GlassCard>
        ))}
      </div>
    </Section>
  );
}
