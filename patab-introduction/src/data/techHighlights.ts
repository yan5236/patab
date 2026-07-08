/**
 * 技术亮点区（TechSection）数据
 */
export interface TechHighlight {
  /** 等宽字体的技术标签 */
  tag: string;
  title: string;
  description: string;
}

export const TECH_HIGHLIGHTS: TechHighlight[] = [
  {
    tag: "Pointer Events",
    title: "自研拖拽引擎",
    description:
      "长按检测 + 移动容差，精确区分点击、滚动、长按与拖拽，不依赖任何第三方拖拽库。",
  },
  {
    tag: "FLIP",
    title: "丝滑让位动画",
    description:
      "磁贴位置变化通过前后位置差与 transform 过渡，180ms 内平滑完成让位与归位。",
  },
  {
    tag: "Web Audio",
    title: "零文件合成音效",
    description:
      "待办完成提示音由振荡器实时合成谐波，无需加载任何音频文件。",
  },
  {
    tag: "Favicon Fallback",
    title: "四级图标回退链",
    description:
      "自定义图标 → 图标服务 → 网站 favicon → 首字母彩色占位，图标永不缺席。",
  },
  {
    tag: "JSONP",
    title: "实时搜索建议",
    description:
      "巧用 JSONP 获取必应搜索建议，配合防抖、请求取消与超时处理，输入流畅不卡顿。",
  },
  {
    tag: "localStorage",
    title: "版本化数据迁移",
    description:
      "数据持久化带版本号管理，旧数据自动清洗、迁移、回填，升级无感知。",
  },
];
