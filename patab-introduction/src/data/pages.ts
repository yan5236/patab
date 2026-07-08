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
  "/install": {
    title: "安装教程",
    subtitle: "网页版可直接打开，插件版按浏览器提示完成加载即可。",
    sections: [
      {
        title: "在线网页版",
        items: ["点击顶部“立即体验”或首页按钮。", "打开后把页面加入书签，后续可直接访问。"],
      },
      {
        title: "浏览器插件版",
        items: [
          "下载离线安装包并解压。",
          "在 Chrome / Edge 扩展管理页打开开发者模式。",
          "选择“加载已解压的扩展程序”，选中解压后的目录。",
        ],
      },
    ],
  },
  "/privacy": {
    title: "隐私政策",
    subtitle: "PaTab 默认把数据保存在你的浏览器本地，不上传到服务器。",
    sections: [
      {
        title: "本地存储",
        items: ["快捷方式、待办、壁纸与设置保存在当前浏览器。", "清理浏览器站点数据会同步清除 PaTab 数据。"],
      },
      {
        title: "网络访问",
        items: ["搜索时会跳转到你选择的搜索引擎。", "网站图标可能来自目标网站 favicon 或图标服务。"],
      },
    ],
  },
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
