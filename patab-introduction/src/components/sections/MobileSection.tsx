/**
 * 移动端展示区（全页动画重点）：
 * 桌面端 —— ScrollTrigger pin 固定整个分区，滚动时手机轻微摆动、
 *          右侧三段文案依次提亮，形成"滚动讲解"效果；
 * 移动端 —— 禁用 pin（地址栏伸缩易抖动），普通 reveal。
 */
import { useRef } from "react";
import { gsap, useGSAP } from "../../lib/gsap";
import Section from "../common/Section";
import PhoneMockup from "../common/PhoneMockup";
import { MOBILE_POINTS } from "../../data/mobilePoints";

export default function MobileSection() {
  const sectionRef = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add(
        {
          desktop: "(min-width: 768px) and (prefers-reduced-motion: no-preference)",
          mobile: "(max-width: 767px) and (prefers-reduced-motion: no-preference)",
        },
        (ctx) => {
          const { desktop } = ctx.conditions as { desktop: boolean };

          // 标题与手机入场 reveal（两端通用）
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
          gsap.from("[data-mobile-phone]", {
            y: 60,
            autoAlpha: 0,
            duration: 0.9,
            ease: "power3.out",
            scrollTrigger: {
              trigger: "[data-mobile-pin]",
              start: "top 75%",
              once: true,
            },
          });

          if (desktop) {
            // —— pin 滚动讲解：三段文案依次提亮，手机缓慢摆动 ——
            const points = gsap.utils.toArray<HTMLElement>("[data-mobile-point]");
            // 初始：除第一段外全部压暗
            gsap.set(points.slice(1), { opacity: 0.25 });

            const tl = gsap.timeline({
              scrollTrigger: {
                trigger: "[data-mobile-pin]",
                start: "center center",
                end: "+=160%",
                pin: true,
                scrub: 0.6,
              },
            });
            points.forEach((point, i) => {
              if (i === 0) return;
              tl.to(points[i - 1], { opacity: 0.25, y: -8, duration: 1 }).to(
                point,
                { opacity: 1, y: 0, duration: 1 },
                "<",
              );
            });
            // 手机随滚动轻微摆动（与文案时间线并行）
            tl.fromTo(
              "[data-mobile-phone]",
              { rotate: -2 },
              { rotate: 2, duration: tl.duration(), ease: "none" },
              0,
            );
          } else {
            // 移动端：三段文案各自普通 reveal
            gsap.utils
              .toArray<HTMLElement>("[data-mobile-point]")
              .forEach((point) => {
                gsap.from(point, {
                  y: 32,
                  autoAlpha: 0,
                  duration: 0.6,
                  ease: "power3.out",
                  scrollTrigger: { trigger: point, start: "top 85%", once: true },
                });
              });
          }
        },
      );
    },
    { scope: sectionRef },
  );

  return (
    <Section
      ref={sectionRef}
      id="mobile"
      title="口袋里，也是一样好用"
      subtitle="手机浏览器打开同一个 PaTab，布局自动适配，指尖拖拽依旧跟手。"
    >
      <div
        data-mobile-pin
        className="flex flex-col items-center gap-10 md:flex-row md:justify-center md:gap-20"
      >
        {/* 手机 Mockup */}
        <div data-mobile-phone className="w-56 shrink-0 md:w-64">
          <PhoneMockup>
            <img
              src="/mobile-version-introduction-image.png"
              alt="PaTab 移动端界面：时钟、搜索框、快捷方式与待办挂件"
              loading="lazy"
              decoding="async"
              className="aspect-[360/741] w-full object-cover"
            />
          </PhoneMockup>
        </div>

        {/* 三段讲解文案 */}
        <div className="flex max-w-md flex-col gap-8 md:gap-12">
          {MOBILE_POINTS.map((point, i) => (
            <div key={point.title} data-mobile-point>
              <div className="flex items-center gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-dawn-500 to-lake-500 text-sm font-bold text-white">
                  {i + 1}
                </span>
                <h3 className="text-lg font-semibold text-ink-900 md:text-xl">
                  {point.title}
                </h3>
              </div>
              <p className="mt-2.5 pl-11 text-sm leading-relaxed text-ink-600 md:text-base">
                {point.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}
