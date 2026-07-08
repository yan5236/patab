/**
 * 移动端展示区（MobileSection）数据
 * 桌面端配合 ScrollTrigger pin 依次高亮，移动端普通排列。
 */
export interface MobilePoint {
  title: string;
  description: string;
}

export const MOBILE_POINTS: MobilePoint[] = [
  {
    title: "自适应流式布局",
    description:
      "小屏幕下网格自动切换为流式排列，设置面板变为滑入式子页面，小屏体验同样从容。",
  },
  {
    title: "触屏长按拖拽",
    description:
      "手势系统精确区分轻点、滚动与长按，指尖拖动磁贴如原生应用般跟手流畅。",
  },
  {
    title: "同一份本地数据",
    description:
      "手机与电脑打开的是同一个 PaTab，数据始终保存在浏览器本地，随开随用。",
  },
];
