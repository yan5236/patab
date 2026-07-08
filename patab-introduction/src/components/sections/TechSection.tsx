/**
 * 体验细节区：深墨蓝玻璃带，与整页浅色形成节奏对比。
 * 6 张深色玻璃小卡，展示用户能感知的体验收益。
 */
import { useRef } from "react";
import { gsap, useGSAP } from "../../lib/gsap";
import Section from "../common/Section";
import GlassCard from "../common/GlassCard";
import { TECH_HIGHLIGHTS } from "../../data/techHighlights";

export default function TechSection() {
  const sectionRef = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add("(prefers-reduced-motion: no-preference)", () => {
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

        gsap.from("[data-tech-card]", {
          y: 32,
          autoAlpha: 0,
          duration: 0.6,
          ease: "power3.out",
          stagger: 0.08,
          scrollTrigger: {
            trigger: "[data-tech-grid]",
            start: "top 80%",
            once: true,
          },
        });

        // 背景色斑缓缓浮现
        gsap.from("[data-tech-blob]", {
          autoAlpha: 0,
          scale: 0.8,
          duration: 1.2,
          ease: "power2.out",
          scrollTrigger: {
            trigger: sectionRef.current,
            start: "top 70%",
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
      id="tech"
      dark
      title="日常使用更省心"
      subtitle="把常用网站、搜索和待办放在顺手的位置，打开浏览器就能继续做事。"
      className="relative overflow-hidden bg-ink-900"
    >
      {/* 深色区背景色斑 */}
      <div
        data-tech-blob
        className="pointer-events-none absolute -left-32 top-10 size-96 rounded-full bg-lake-500/20 blur-3xl"
      />
      <div
        data-tech-blob
        className="pointer-events-none absolute -right-24 bottom-0 size-80 rounded-full bg-dawn-500/15 blur-3xl"
      />

      <div
        data-tech-grid
        className="relative grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3"
      >
        {TECH_HIGHLIGHTS.map((item) => (
          <GlassCard
            key={item.title}
            dark
            data-tech-card
            className="p-6 transition-colors duration-300 hover:bg-white/12"
          >
            <span className="inline-block rounded-md bg-white/10 px-2 py-1 font-mono text-xs text-lake-300">
              {item.tag}
            </span>
            <h3 className="mt-4 text-lg font-semibold text-white">
              {item.title}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-white/60">
              {item.description}
            </p>
          </GlassCard>
        ))}
      </div>
    </Section>
  );
}
