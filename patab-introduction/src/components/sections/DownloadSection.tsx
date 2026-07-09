/**
 * 下载 / CTA 区：三张入口卡（网页版 / 插件商店 / 离线安装包），
 * 插件商店未上架前保持禁用态，上线后统一在 data/links.ts 中替换。
 */
import { useRef } from "react";
import { Globe, Puzzle, Download, ShieldCheck } from "lucide-react";
import { gsap, useGSAP } from "../../lib/gsap";
import Section from "../common/Section";
import GlassCard from "../common/GlassCard";
import CtaButton from "../common/CtaButton";
import { LINKS } from "../../data/links";

/** 渲染介绍站下载区，并在插件商店未上架时禁用商店入口。 */
export default function DownloadSection() {
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

          // 大面板弹性放大入场（移动端幅度减小）
          gsap.from("[data-download-panel]", {
            scale: desktop ? 0.92 : 0.97,
            autoAlpha: 0,
            duration: 0.9,
            ease: "back.out(1.4)",
            scrollTrigger: {
              trigger: "[data-download-panel]",
              start: "top 80%",
              once: true,
            },
          });

          gsap.from("[data-download-card]", {
            y: 32,
            autoAlpha: 0,
            duration: 0.6,
            ease: "power3.out",
            stagger: 0.1,
            delay: 0.2,
            scrollTrigger: {
              trigger: "[data-download-panel]",
              start: "top 80%",
              once: true,
            },
          });
        },
      );
    },
    { scope: sectionRef },
  );

  return (
    <Section
      ref={sectionRef}
      id="download"
      title="现在，换一块更好的新标签页"
      subtitle="网页版打开即用，插件版即将上架各大商店。"
    >
      <GlassCard data-download-panel className="p-6 md:p-10">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3 md:gap-6">
          {/* 在线网页版 */}
          <div
            data-download-card
            className="flex flex-col items-center rounded-xl border border-white/60 bg-white/40 p-6 text-center"
          >
            <div className="flex size-12 items-center justify-center rounded-xl bg-lake-500/15 text-lake-500">
              <Globe className="size-6" />
            </div>
            <h3 className="mt-4 font-semibold text-ink-900">在线网页版</h3>
            <p className="mt-1.5 flex-1 text-sm text-ink-600">
              无需安装，打开即用
            </p>
            <CtaButton href={LINKS.webApp} className="mt-5 w-full">
              立即打开
            </CtaButton>
          </div>

          {/* 浏览器插件版 */}
          <div
            data-download-card
            className="flex flex-col items-center rounded-xl border border-white/60 bg-white/40 p-6 text-center"
          >
            <div className="flex size-12 items-center justify-center rounded-xl bg-dawn-500/15 text-dawn-500">
              <Puzzle className="size-6" />
            </div>
            <h3 className="mt-4 font-semibold text-ink-900">浏览器插件版</h3>
            <p className="mt-1.5 flex-1 text-sm text-ink-600">
              接管新标签页，体验最完整
            </p>
            <div className="mt-5 flex w-full flex-col gap-2">
              <CtaButton
                href={LINKS.chromeStore}
                variant="glass"
                className="w-full py-2.5!"
                disabled
              >
                <img src="/chrome.png" alt="" className="size-5" />
                Chrome 应用商店
              </CtaButton>
              <CtaButton
                href={LINKS.edgeStore}
                variant="glass"
                className="w-full py-2.5!"
                disabled
              >
                <img src="/edge.png" alt="" className="size-5" />
                Edge 外接程序
              </CtaButton>
            </div>
            <span className="mt-2 text-xs text-ink-600/60">即将上架</span>
          </div>

          {/* 离线安装包 */}
          <div
            data-download-card
            className="flex flex-col items-center rounded-xl border border-white/60 bg-white/40 p-6 text-center"
          >
            <div className="flex size-12 items-center justify-center rounded-xl bg-pine-500/15 text-pine-500">
              <Download className="size-6" />
            </div>
            <h3 className="mt-4 font-semibold text-ink-900">离线安装包</h3>
            <p className="mt-1.5 flex-1 text-sm text-ink-600">
              下载 .zip，开发者模式手动加载
            </p>
            <CtaButton href={LINKS.offlineZip} variant="glass" className="mt-5 w-full">
              下载离线包
            </CtaButton>
          </div>
        </div>

        {/* 隐私说明 */}
        <p className="mt-8 flex items-center justify-center gap-1.5 text-xs text-ink-600/80 md:text-sm">
          <ShieldCheck className="size-4 text-pine-500" />
          所有数据保存在本地浏览器，不上传任何服务器。
        </p>
      </GlassCard>
    </Section>
  );
}
