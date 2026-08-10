---
sidebar_position: 6
---

# Local Debugging and Testing

## Real PaTab Development Host (patab-widget dev)

```bash
pnpm dev    # = patab-widget dev
```

The CLI opens a browser by default and prints a token-free URL:

```text
PaTab 开发宿主已启动：http://127.0.0.1:5174/__patab_dev__/
```

The page is the real PaTab shell built from the same source as the website. The current widget is placed with its default size and variant; dragging, resizing, menus, detail/settings surfaces, theme, language, SandboxAdapter, and Capability Broker use production behavior. Vite updates the surface entry without refreshing the PaTab shell.

Common options:

```bash
patab-widget dev --host localhost --port 5200
patab-widget dev --no-open
```

:::warning
The development host covers real PaTab Web behavior only. Its random session never reads `patab:v1` or `patab-custom-components`, while loopback modules and the HMR CSP remain development-only conveniences. Production `check`/`pack`, ZIP re-import, MV3 sandbox, and optional host-permission validation are still required before release.
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
pnpm run pack         # forces type-check + full packaging + automatic re-validation after generation
patab-widget inspect dist/<id>-<version>.patab.zip   # independently re-validate the finished package
```

`pack` automatically runs the same full validation as `inspect` both before and after writing the output, and deletes temporary artifacts on failure. All CLI output is single-line JSON (`{"ok":true,"code":"OK","message":"..."}`); failures exit with code 1, and the error codes are stable, so it can be wired into CI directly.
