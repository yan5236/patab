/**
 * 体验细节区（TechSection）数据
 */
export interface TechHighlight {
  /** 小卡片顶部标签 */
  tag: string;
  title: string;
  description: string;
}

export const TECH_HIGHLIGHTS: TechHighlight[] = [
  {
    tag: "拖拽手感",
    title: "轻松整理桌面",
    description:
      "长按后直接拖动磁贴，点击、滚动和整理互不打架，小屏幕上也能放心调整。",
  },
  {
    tag: "动效反馈",
    title: "位置变化看得清",
    description:
      "磁贴移动时会自然让位，整理完成后位置一眼明白，不需要反复找入口。",
  },
  {
    tag: "待办提醒",
    title: "完成任务有反馈",
    description:
      "勾掉待办时有轻量提示，让临时任务从记录到完成都有清楚的确认感。",
  },
  {
    tag: "图标兜底",
    title: "网站入口不空缺",
    description:
      "没有自定义图标时也会自动补上网站图标或首字母占位，桌面保持整齐。",
  },
  {
    tag: "搜索建议",
    title: "输入更快一步",
    description:
      "搜索框会给出联想建议，常见问题和关键词不用完整敲完就能打开。",
  },
  {
    tag: "本地保存",
    title: "隐私留在浏览器",
    description:
      "快捷方式、待办和设置都保存在本机浏览器里，日常使用不用注册账号。",
  },
];
