/**
 * 静态 HTML 页面容器：通过 iframe 展示 public 目录下的完整 HTML 文件。
 * 用于复用导航/页脚的同时，保留隐私政策、用户协议等独立文档的原始样式。
 */
import { useRef, useState } from "react";

interface StaticHtmlPageProps {
  src: string;
}

export default function StaticHtmlPage({ src }: StaticHtmlPageProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState("calc(100vh - 64px)");

  const handleLoad = () => {
    const doc = iframeRef.current?.contentDocument;
    if (doc?.body) {
      // 预留少量缓冲，避免末尾被截断
      setHeight(`${doc.body.scrollHeight + 32}px`);
    }
  };

  return (
    <main className="bg-white pt-8">
      <iframe
        ref={iframeRef}
        src={src}
        title={src}
        onLoad={handleLoad}
        className="block w-full"
        style={{ height, minHeight: "calc(100vh - 64px - 32px)", border: "none" }}
      />
    </main>
  );
}
