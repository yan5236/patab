---
sidebar_position: 5
---

# 主题与多语言

## 主题 token 注入

组件永远看不到宿主的内部 CSS 变量与框架类名。宿主在 surface 启动前，向 sandbox 文档的 `:root` 注入一组公开的 `--pt-*` CSS 自定义属性（共 20 个，名称属于 API v1 契约）：

```css
:root {
  --pt-surface: ...;
  --pt-surface-strong: ...;
  --pt-text: ...;
  --pt-text-strong: ...;
  --pt-text-muted: ...;
  --pt-accent: ...;
  /* …其余 token 见完整列表 */
}
```

主题切换时，宿主广播 `themeChanged` 事件并把新 token 同步写入 sandbox 根节点——**即使组件尚未加载 SDK，主题也已生效**。组件只需引用 `var(--pt-*)` 即可自动跟随明暗主题。

完整 token 列表与取值说明见 [theme.css 与主题 token](../sdk/theme-css.md)。

## 语义类与 theme.css

SDK 提供一个可选的样式契约，导入后即可使用：

```ts
import '@patab/widget-sdk/theme.css'
```

它基于 `--pt-*` token 提供常用语义类：`.pt-surface`、`.pt-surface-strong`、`.pt-text`、`.pt-text-strong`、`.pt-text-muted`、`.pt-button`（含 hover/active）、`.pt-input`、`.pt-focus-ring`、`.pt-danger`，并内置 `@media (prefers-reduced-motion: reduce)` 全局降动效规则。详见 [theme.css 与主题 token](../sdk/theme-css.md)。

:::caution 两条禁令
- 不要引用宿主内部的 `--theme-*` 变量或宿主 UI 框架的工具类——它们不属于公开契约，随时会变。
- 不要在 surface HTML 中自带 CSP meta 或外链样式/脚本，宿主注入 CSP 前会拒绝这类 HTML。
:::

## 读取与响应主题变化

```ts
const context = await api.context.get()
// context.theme: 'light' | 'dark'
// context.reducedMotion: boolean

const unsubscribe = api.on<WidgetThemeChangedEvent>('themeChanged', (event) => {
  // event: { theme, reducedMotion, tokens?: WidgetThemeTokens }
  document.documentElement.dataset.theme = event.theme
})
```

也可以使用具名辅助函数（等价于订阅 `themeChanged`）：

```ts
import { onWidgetThemeChanged } from '@patab/widget-sdk'

const unsubscribe = onWidgetThemeChanged(client, (event) => { /* ... */ })
```

## 多语言

宿主当前语言通过 `context.locale`（`'zh-CN' | 'en-US'`）提供，变化时广播 `localeChanged`：

```ts
const unsubscribe = api.on<WidgetLocaleChangedEvent>('localeChanged', (event) => {
  // event.locale: 'zh-CN' | 'en-US'，重新渲染文案
})
```

建议组件内置与 Manifest 一致的三语文案（`default` / `zh-CN` / `en-US`），按 `context.locale` 与 `localeChanged` 事件选择展示语言。Manifest 的 `name`、`description`、surface 标题、variant 文案、网络用途说明均由宿主按当前语言自动选择（见 [Manifest 配置](./manifest.md#localizedtext)）。

## 减少动画

`context.reducedMotion` 与 `themeChanged`/`reducedMotion` 反映用户的 `prefers-reduced-motion` 偏好。`theme.css` 已内置全局降动效规则；组件自定义动画应同样尊重该偏好（可参考 `--pt-motion-duration`、`--pt-motion-easing` token）。
