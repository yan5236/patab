---
sidebar_position: 5
---

# theme.css and Theme Tokens

## Usage

```ts
import '@patab/widget-sdk/theme.css'
```

The stylesheet defines semantic classes on top of the host-injected `--pt-*` tokens and includes a global `@media (prefers-reduced-motion: reduce)` rule for reduced motion. Importing it is optional — you can also reference `var(--pt-*)` directly in your own CSS.

## Semantic Classes

| Class name | Purpose |
|---|---|
| `.pt-surface` | Regular container background and text color |
| `.pt-surface-strong` | Emphasized container (a higher-contrast surface) |
| `.pt-text` | Body text color |
| `.pt-text-strong` | Heading/emphasis text color |
| `.pt-text-muted` | Secondary/de-emphasized text color |
| `.pt-button` | Button (including hover/active states) |
| `.pt-input` | Input field |
| `.pt-focus-ring` | Focus ring |
| `.pt-danger` | Danger/destructive action color |

:::note
The above are all the contract classes provided by `theme.css`. The `pt-card`, `pt-title`, and `pt-muted` class names that appear in the official examples are **not** part of the SDK contract (they do not exist in `theme.css`); use contract classes such as `.pt-surface` or define your own styles if you need card styling.
:::

## Theme Tokens (20)

Token names are part of the API v1 contract. The host injects them into the sandbox document's `:root` and updates them in sync when the theme changes:

| Token | Purpose |
|---|---|
| `--pt-surface` | Regular surface background |
| `--pt-surface-strong` | Emphasized surface background |
| `--pt-text` | Body text |
| `--pt-text-strong` | Emphasized text |
| `--pt-text-muted` | De-emphasized text |
| `--pt-accent` | Theme accent color |
| `--pt-accent-contrast` | Contrasting text color on the accent color |
| `--pt-accent-hover` | Accent color hover state |
| `--pt-border` | Border |
| `--pt-input` | Input control background |
| `--pt-danger` | Danger color |
| `--pt-focus-ring` | Focus ring |
| `--pt-radius-sm` / `--pt-radius-md` / `--pt-radius-lg` | Border radii |
| `--pt-shadow` | Shadow |
| `--pt-font-sans` | Body font family |
| `--pt-motion-duration` / `--pt-motion-easing` | Motion duration and easing |
| `--pt-color-scheme` | `color-scheme` value (light/dark) |

The corresponding TypeScript union type is `WidgetThemeTokenName`; the `themeChanged` event may carry a `WidgetThemeTokens` (`{ version: 1; values: Record<WidgetThemeTokenName, string> }`) snapshot.

:::caution
Do not reference the host's internal `--theme-*` variables or the host UI framework's utility classes — they are not part of the public contract. The host translates internal variables into `--pt-*` through an explicit mapping table; unmapped internal variables are never exposed to widgets.
:::
