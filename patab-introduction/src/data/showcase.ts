/**
 * 界面细节区（ShowcaseSection）数据
 * 三行左右交替图文，复用同一张 PC 截图的不同裁切位置（object-position）。
 */
export interface ShowcaseItem {
  title: string;
  description: string;
  /** 三条要点 */
  points: string[];
  /** 截图取景中心（同时作为 object-position 与 transform-origin） */
  objectPosition: string;
  /** 局部放大倍数（配合 transform-origin 实现特写） */
  zoom: number;
  /** 图片在左还是在右（桌面端） */
  imageSide: "left" | "right";
}

export const SHOWCASE_ITEMS: ShowcaseItem[] = [
  {
    title: "打开标签页，即刻出发",
    description:
      "大字时钟与日期常伴眼前，多引擎搜索框居中待命，新标签页不再是一片空白。",
    points: [
      "HH:MM:SS 大字时钟，12/24 小时制随心切换",
      "百度、必应、谷歌等 7+ 引擎一键换用",
      "必应实时搜索建议，少打字、快直达",
    ],
    objectPosition: "50% 0%",
    zoom: 1.7,
    imageSide: "left",
  },
  {
    title: "待办清单，无需再装扩展",
    description:
      "桌面上的待办挂件让计划一目了然，排期、星标、拖拽排序样样俱全。",
    points: [
      "「全部 / 今天 / 重要」智能列表自动归类",
      "自定义清单 + 日期选择器灵活排期",
      "完成勾选伴随清脆提示音，成就感满满",
    ],
    objectPosition: "62% 28%",
    zoom: 1.9,
    imageSide: "right",
  },
  {
    title: "Dock 栏与多屏，井井有条",
    description:
      "高频网站常驻底部 Dock，多个屏幕按用途分页，AI 工具、学习资源、视频网站各归其位。",
    points: [
      "Mac 风格 Dock 栏，悬停显示名称气泡",
      "屏幕切换器左右翻页，每屏自定义 emoji",
      "长按拖拽整理磁贴，FLIP 动画平滑让位",
    ],
    objectPosition: "50% 100%",
    zoom: 1.8,
    imageSide: "left",
  },
];
