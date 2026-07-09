/**
 * 二级信息页数据：只放静态文案，页面组件负责展示。
 */
export interface InfoPage {
  title: string;
  subtitle: string;
  sections: Array<{
    title: string;
    items: string[];
  }>;
}

export const INFO_PAGES: Record<string, InfoPage> = {
  "/docs": {
    title: "文档",
    subtitle: "这里整理 PaTab 的核心用法，方便快速上手。",
    sections: [
      {
        title: "基础操作",
        items: ["添加常用网站到桌面磁贴。", "把相关网站放入文件夹。", "使用 Dock 固定最常用入口。"],
      },
      {
        title: "个性化",
        items: ["在设置中更换壁纸、搜索引擎和时间显示方式。", "用待办小组件记录临时任务。"],
      },
    ],
  },
};
