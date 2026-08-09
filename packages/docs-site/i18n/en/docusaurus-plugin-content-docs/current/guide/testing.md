---
sidebar_position: 6
---

# Local Debugging and Testing

## Local Simulator (patab-widget dev)

```bash
pnpm dev    # = patab-widget dev
```

Output looks like:

```text
模拟器已启动：http://127.0.0.1:5174/__patab_widget_simulator__
```

The simulator page has two parts:

- **Right side**: the component surface runs in the same `sandbox="allow-scripts"` iframe as in production, obtaining the same `MessagePort` handshake as the real host via an injected bridge script — the SDK code connects without any changes.
- **Left control panel**: switch the surface, tile size, variant, theme (light/dark), language, and reduced-motion preference; mock `ui.confirm` results and `network.fetch` responses (panel JSON); view the `ui.toast` log.

The simulator is based on the Vite dev server with instant hot reload on source changes. Common options:

```bash
patab-widget dev --host 0.0.0.0 --port 5200   # 默认 127.0.0.1:5174（strictPort，占用即失败）
```

:::warning
The simulator is a purely local environment; it neither needs nor supports connecting to the real PaTab host. Production `check`/`pack` never read the simulator address; the simulator's relaxed loopback access is a development convenience and does not represent real host behavior. To verify real integration, pack the component and re-import the ZIP into PaTab.
:::

## Unit Testing (Mock Host)

The SDK provides the `@patab/widget-sdk/testing` subpath (also exported from the main entry), which simulates the host with a real `MessageChannel` + the real RPC protocol, bypassing none of the public contract:

```ts
import { expect, it } from 'vitest'
import { createWidgetMockHost } from '@patab/widget-sdk/testing'

it('读取 Mock 存储', async () => {
  const host = createWidgetMockHost({ storage: { greeting: 'PaTab' } })
  await expect(host.api.storage.get('greeting')).resolves.toEqual({ found: true, value: 'PaTab' })
  host.close()
})
```

The mock host can inject an initial context, permissions, storage, todo data, network responses, and confirm-dialog results, and can simulate theme/locale/size/variant change events. For the full API, see [Mock Host](../sdk/testing.md).

## Pre-Commit Self-Check Pipeline

We recommend running the following in order before committing or publishing:

```bash
pnpm type-check   # tsc --noEmit
pnpm test         # vitest run
pnpm check        # Manifest + surface build + integrity/quota validation (no ZIP written)
pnpm pack         # forces type-check + full packaging + automatic re-validation after generation
patab-widget inspect dist/<id>-<version>.patab.zip   # independently re-validate the finished package
```

`pack` automatically runs the same full validation as `inspect` both before and after writing the output, and deletes temporary artifacts on failure. All CLI output is single-line JSON (`{"ok":true,"code":"OK","message":"..."}`); failures exit with code 1, and the error codes are stable, so it can be wired into CI directly.
