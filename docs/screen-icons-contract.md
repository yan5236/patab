# 应用屏幕图标接口契约

## 模块边界

| 模块 | 单一职责 |
|------|----------|
| `utils/screenIcons.ts` | 提供常用图标，并把旧 Emoji 或非法值规范化为可渲染图标名。 |
| `utils/screenIconLibrary.ts` | 提供完整图标目录、搜索与单图标异步加载。 |
| `components/common/AppLucideIcon.vue` | 优先同步渲染常用图标，按需异步渲染非常用图标。 |
| `components/modals/ScreenIconPicker.vue` | 搜索并选择图标，只通过事件返回选择结果。 |

## 接口

```ts
type ScreenIconName = string

normalizeScreenIcon(value: unknown): ScreenIconName
searchScreenIcons(query: string): ScreenIconName[]
loadScreenIconComponent(name: string): Promise<LucideIcon>
```

`ScreenIconPicker` 接收当前 `modelValue: string`，选择后发出 `select(name)`，关闭时发出 `close()`；组件不读取或修改 Pinia 状态。

## 依赖与降级

- 完整图标目录通过 Vite `import.meta.glob` 按需加载已安装的 `@lucide/vue` 单图标模块，并在 glob 阶段排除聚合入口；常用图标留在 `screenIcons.ts`，不引入新依赖，也不把完整目录打进首屏 JS。
- 图标选择器每批渲染 80 个图标，保证列表形成滚动区域；滚动到底部继续加载，完整目录与搜索结果不截断。
- store、分页器和弹窗只依赖以上公开接口，不直接访问图标目录内部映射。
- 旧版十二个 Emoji 映射为语义相近的 Lucide 图标；未知或失效值回退 `LayoutGrid`。
- 图标搜索无结果时返回空数组，不抛异常。

## 最小验证

- 十二个旧 Emoji 均能映射为有效 Lucide 图标。
- 有效图标名保持不变，非法值回退 `LayoutGrid`。
- 搜索忽略大小写和空格，空搜索返回完整目录。
- 同一图标重复加载时复用浏览器模块缓存，加载失败时回退 `LayoutGrid`。
