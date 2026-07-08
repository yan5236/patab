/**
 * 界面细节区：三行左右交替图文。
 * 三张"截图"实为同一张 PC 图的不同 object-position 裁切，浏览器只下载一次。
 */
import { useRef } from "react";
import { CheckCircle2 } from "lucide-react";
import { gsap, useGSAP } from "../../lib/gsap";
import Section from "../common/Section";
import { SHOWCASE_ITEMS } from "../../data/showcase";

export default function ShowcaseSection() {
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

          gsap.utils
            .toArray<HTMLElement>("[data-showcase-row]")
            .forEach((row) => {
              const fromLeft = row.dataset.side === "left";
              const image = row.querySelector("[data-showcase-image]");
              const texts = row.querySelectorAll("[data-showcase-text]");

              // 桌面：图从所在侧滑入；移动：纵向 fade-up
              gsap.from(image, {
                x: desktop ? (fromLeft ? -60 : 60) : 0,
                y: desktop ? 0 : 40,
                autoAlpha: 0,
                duration: 0.8,
                ease: "power3.out",
                scrollTrigger: { trigger: row, start: "top 75%", once: true },
              });
              gsap.from(texts, {
                y: 24,
                autoAlpha: 0,
                duration: 0.6,
                ease: "power3.out",
                stagger: 0.1,
                scrollTrigger: { trigger: row, start: "top 70%", once: true },
              });

              // 桌面：图内轻微 scrub 视差
              if (desktop) {
                gsap.fromTo(
                  row.querySelector("img"),
                  { yPercent: -6 },
                  {
                    yPercent: 6,
                    ease: "none",
                    scrollTrigger: {
                      trigger: row,
                      start: "top bottom",
                      end: "bottom top",
                      scrub: true,
                    },
                  },
                );
              }
            });
        },
      );
    },
    { scope: sectionRef },
  );

  return (
    <Section
      ref={sectionRef}
      id="showcase"
      title="每个角落，都经得起细看"
      subtitle="从清晨打开的第一个标签页，到深夜整理的最后一条待办，细节始终在线。"
    >
      <div className="flex flex-col gap-16 md:gap-24">
        {SHOWCASE_ITEMS.map((item) => (
          <div
            key={item.title}
            data-showcase-row
            data-side={item.imageSide}
            className={`flex flex-col items-center gap-8 md:gap-12 ${
              item.imageSide === "left" ? "md:flex-row" : "md:flex-row-reverse"
            }`}
          >
            {/* 截图裁切卡片：固定高度 + object-position 局部取景 */}
            <div
              data-showcase-image
              className="w-full overflow-hidden rounded-2xl border border-white/60 shadow-glass md:w-1/2"
            >
              <div className="h-56 overflow-hidden md:h-72">
                {/* 通过 scale + transform-origin 放大到取景点，实现局部特写 */}
                <img
                  src="/pc-version-introduction-image.png"
                  alt={item.title}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover"
                  style={{
                    objectPosition: item.objectPosition,
                    scale: String(item.zoom),
                    transformOrigin: item.objectPosition,
                  }}
                />
              </div>
            </div>

            {/* 文案侧 */}
            <div className="w-full md:w-1/2">
              <h3
                data-showcase-text
                className="text-xl font-bold text-ink-900 md:text-2xl"
              >
                {item.title}
              </h3>
              <p
                data-showcase-text
                className="mt-3 leading-relaxed text-ink-600"
              >
                {item.description}
              </p>
              <ul className="mt-5 flex flex-col gap-3">
                {item.points.map((point) => (
                  <li
                    key={point}
                    data-showcase-text
                    className="flex items-start gap-2.5 text-sm text-ink-600 md:text-base"
                  >
                    <CheckCircle2 className="mt-0.5 size-4.5 shrink-0 text-pine-500" />
                    {point}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}
