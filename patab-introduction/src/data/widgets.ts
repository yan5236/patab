/**
 * 小组件区（WidgetsSection）数据
 * 罗列组件商店中的小组件及其上线状态：
 * 当前仅「待办事项」已上线，其余为规划中的路线图，用于传达「持续上新」。
 */
import {
  ListTodo,
  CloudSun,
  StickyNote,
  Timer,
  CalendarDays,
  type LucideIcon,
} from "lucide-react";

export interface WidgetItem {
  /** 卡片图标 */
  icon: LucideIcon;
  title: string;
  /** 一句话简介 */
  description: string;
  /** 上线状态：live 已上线，soon 敬请期待 */
  status: "live" | "soon";
}

export const WIDGETS: WidgetItem[] = [
  {
    icon: ListTodo,
    title: "待办事项",
    description: "随手记下要做的事，勾选即完成",
    status: "live",
  },
  {
    icon: CloudSun,
    title: "天气",
    description: "实时天气与温度，一眼掌握",
    status: "soon",
  },
  {
    icon: StickyNote,
    title: "便签",
    description: "灵感闪现，随手贴在桌面",
    status: "soon",
  },
  {
    icon: Timer,
    title: "番茄钟",
    description: "专注计时，工作张弛有度",
    status: "soon",
  },
  {
    icon: CalendarDays,
    title: "日历",
    description: "近期日程，尽收眼底",
    status: "soon",
  },
];
