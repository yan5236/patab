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
import { INFO_PAGES } from "./data/pages";

export default function App() {
  const rootRef = useRef<HTMLDivElement>(null);
  const page = INFO_PAGES[window.location.pathname];

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
      {page ? (
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
