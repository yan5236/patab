/**
 * 核心特性区（FeaturesSection）数据
 */
import {
  LayoutGrid,
  Search,
  FolderOpen,
  ListTodo,
  Rows3,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

export interface Feature {
  /** 卡片图标 */
  icon: LucideIcon;
  /** 图标底色（Tailwind 类） */
  iconClass: string;
  title: string;
  description: string;
}

export const FEATURES: Feature[] = [
  {
    icon: LayoutGrid,
    iconClass: "bg-dawn-500/15 text-dawn-500",
    title: "多屏桌面",
    description:
      "8×4 网格磁贴，多个屏幕自由分页，每屏自定义名称与 emoji。紧凑、自由两种布局模式随心切换。",
  },
  {
    icon: Search,
    iconClass: "bg-lake-500/15 text-lake-500",
    title: "一站式搜索",
    description:
      "内置百度、必应、谷歌等 7+ 搜索引擎，支持自定义引擎与实时搜索建议，输入即刻直达。",
  },
  {
    icon: FolderOpen,
    iconClass: "bg-pine-500/15 text-pine-500",
    title: "文件夹收纳",
    description:
      "拖拽即可归类快捷方式，3×3 迷你预览一眼看清内容，从此告别杂乱的书签栏。",
  },
  {
    icon: ListTodo,
    iconClass: "bg-dawn-500/15 text-dawn-500",
    title: "内置待办",
    description:
      "智能列表、自定义清单、日期排期、星标与拖拽排序，完成时还有清脆的提示音。",
  },
  {
    icon: Rows3,
    iconClass: "bg-lake-500/15 text-lake-500",
    title: "Mac 风格 Dock",
    description:
      "高频网站常驻底部 Dock 栏，悬停显示名称，设置与快速添加触手可及。",
  },
  {
    icon: ShieldCheck,
    iconClass: "bg-pine-500/15 text-pine-500",
    title: "隐私安全",
    description:
      "所有数据保存在本地浏览器，不注册、不上传、不追踪，你的桌面只属于你。",
  },
];
