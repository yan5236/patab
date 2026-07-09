/**
 * PaTab 介绍页根组件：负责组装各分区。
 */
import { useRef } from "react";
import { ScrollTrigger, useGSAP } from "./lib/gsap";
import Navbar from "./components/layout/Navbar";
import Footer from "./components/layout/Footer";
import HeroSection from "./components/sections/HeroSection";
import FeaturesSection from "./components/sections/FeaturesSection";
import ShowcaseSection from "./components/sections/ShowcaseSection";
import WidgetsSection from "./components/sections/WidgetsSection";
import MobileSection from "./components/sections/MobileSection";
import TechSection from "./components/sections/TechSection";
import DownloadSection from "./components/sections/DownloadSection";
import InfoPage from "./components/sections/InfoPage";
import StaticHtmlPage from "./components/sections/StaticHtmlPage";
import ChangelogPage from "./components/sections/ChangelogPage";
import { INFO_PAGES } from "./data/pages";

const STATIC_HTML_PAGES: Record<string, string> = {
  "/install": "/pages/install-content.html",
  "/privacy": "/legal/privacy-policy.html",
  "/user-agreement": "/legal/user-agreement.html",
};

const REACT_PAGES: Record<string, () => React.ReactNode> = {
  "/changelog": () => <ChangelogPage />,
};

/** 规整 Pages 清理 URL 产生的尾斜杠，保证二级页路由稳定命中。 */
function normalizePathname(pathname: string) {
  return pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;
}

export default function App() {
  const rootRef = useRef<HTMLDivElement>(null);
  const pathname = normalizePathname(window.location.pathname);
  const page = INFO_PAGES[pathname];
  const staticHtmlSrc = STATIC_HTML_PAGES[pathname];
  const ReactPage = REACT_PAGES[pathname];

  // 大图（首屏 PC 截图）加载完成后重新计算各 ScrollTrigger 位置，防止触发点漂移
  useGSAP(
    () => {
      const refresh = () => ScrollTrigger.refresh();
      window.addEventListener("load", refresh);
      return () => window.removeEventListener("load", refresh);
    },
    { scope: rootRef },
  );

  return (
    <div ref={rootRef}>
      <Navbar />
      {ReactPage ? (
        <ReactPage />
      ) : staticHtmlSrc ? (
        <StaticHtmlPage src={staticHtmlSrc} />
      ) : page ? (
        <InfoPage page={page} />
      ) : (
        <main>
          <HeroSection />
          <FeaturesSection />
          <ShowcaseSection />
          <WidgetsSection />
          <MobileSection />
          <TechSection />
          <DownloadSection />
        </main>
      )}
      <Footer />
    </div>
  );
}
