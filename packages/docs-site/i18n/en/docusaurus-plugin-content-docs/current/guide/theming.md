---
sidebar_position: 5
---

# Theming and Localization

## Theme Token Injection

A component never sees the host's internal CSS variables or framework class names. Before a surface starts, the host injects a set of public `--pt-*` CSS custom properties (20 in total; their names are part of the API v1 contract) into the sandbox document's `:root`:

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

When the theme changes, the host broadcasts a `themeChanged` event and writes the new tokens into the sandbox root node — **even if the component has not loaded the SDK yet, the theme already takes effect**. A component only needs to reference `var(--pt-*)` to follow light/dark themes automatically.

For the full token list and value descriptions, see [theme.css and Theme Tokens](../sdk/theme-css.md).

## Semantic Classes and theme.css

The SDK provides an optional style contract that can be imported directly:

```ts
import '@patab/widget-sdk/theme.css'
```

Built on the `--pt-*` tokens, it provides common semantic classes: `.pt-surface`, `.pt-surface-strong`, `.pt-text`, `.pt-text-strong`, `.pt-text-muted`, `.pt-button` (including hover/active), `.pt-input`, `.pt-focus-ring`, `.pt-danger`, plus a built-in global `@media (prefers-reduced-motion: reduce)` rule. See [theme.css and Theme Tokens](../sdk/theme-css.md) for details.

:::caution Two hard rules
- Do not reference the host's internal `--theme-*` variables or utility classes from the host's UI framework — they are not part of the public contract and can change at any time.
- Do not include your own CSP meta tag or external styles/scripts in surface HTML; the host rejects such HTML before injecting its CSP.
:::

## Reading and Reacting to Theme Changes

```ts
const context = await api.context.get()
// context.theme: 'light' | 'dark'
// context.reducedMotion: boolean

const unsubscribe = api.on<WidgetThemeChangedEvent>('themeChanged', (event) => {
  // event: { theme, reducedMotion, tokens?: WidgetThemeTokens }
  document.documentElement.dataset.theme = event.theme
})
```

You can also use the named helper (equivalent to subscribing to `themeChanged`):

```ts
import { onWidgetThemeChanged } from '@patab/widget-sdk'

const unsubscribe = onWidgetThemeChanged(client, (event) => { /* ... */ })
```

## Localization

The host's current language is provided via `context.locale` (`'zh-CN' | 'en-US'`), and a `localeChanged` event is broadcast when it changes:

```ts
const unsubscribe = api.on<WidgetLocaleChangedEvent>('localeChanged', (event) => {
  // event.locale: 'zh-CN' | 'en-US'，重新渲染文案
})
```

We recommend that components ship the same trilingual copy as the Manifest (`default` / `zh-CN` / `en-US`), choosing the display language based on `context.locale` and the `localeChanged` event. The Manifest's `name`, `description`, surface titles, variant copy, and network purpose descriptions are all selected automatically by the host according to the current language (see [Manifest Configuration](./manifest.md#localizedtext)).

## Reduced Motion

`context.reducedMotion` and `themeChanged`/`reducedMotion` reflect the user's `prefers-reduced-motion` preference. `theme.css` already includes a global reduced-motion rule; custom animations in components should respect this preference as well (see the `--pt-motion-duration` and `--pt-motion-easing` tokens).
