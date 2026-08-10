---
sidebar_position: 6
---

# 本地调试与测试

## 真实 PaTab 开发宿主（patab-widget dev）

```bash
pnpm dev    # = patab-widget dev
```

CLI 默认打开浏览器，并输出不含会话 token 的地址：

```text
PaTab 开发宿主已启动：http://127.0.0.1:5174/__patab_dev__/
```

页面就是与正式站点同源的 PaTab 主屏：当前组件按 Manifest 默认尺寸和 variant 自动放置，拖拽、调整尺寸、右键菜单、detail/settings、主题和语言均使用生产 UI 与 Runtime。surface 入口由 Vite 热更新，SDK 代码无需改动。

常用选项：

```bash
patab-widget dev --host localhost --port 5200
patab-widget dev --no-open
```

:::warning
开发宿主只覆盖真实 PaTab Web 行为。随机会话不会读取 `patab:v1` 或 `patab-custom-components`，但 loopback 模块与 HMR CSP 仅属于开发便利；生产 `check`/`pack` 仍会拒绝 Vite client、外部运行资源和非自包含 surface。发布前仍要重新导入 ZIP，并单独验证 MV3 sandbox 与可选 host permission。
:::

## 单元测试（Mock 宿主）

SDK 提供 `@patab/widget-sdk/testing` 子路径（主入口同样导出），用真实 `MessageChannel` + 真实 RPC 协议模拟宿主，不绕过任何公开契约：

```ts
import { expect, it } from 'vitest'
import { createWidgetMockHost } from '@patab/widget-sdk/testing'

it('读取 Mock 存储', async () => {
  const host = createWidgetMockHost({ storage: { greeting: 'PaTab' } })
  await expect(host.api.storage.get('greeting')).resolves.toEqual({ found: true, value: 'PaTab' })
  host.close()
})
```

Mock 宿主可以注入初始 context、权限、存储、待办数据、网络响应与确认框结果，并模拟主题/语言/尺寸/variant 变化事件。完整 API 见 [Mock 宿主](../sdk/testing.md)。

## 提交前自检流水线

建议在提交或发布前依次执行：

```bash
pnpm type-check   # tsc --noEmit
pnpm test         # vitest run
pnpm check        # Manifest + surface 构建 + 完整性/配额校验（不写 ZIP）
pnpm pack         # 强制 type-check + 完整打包 + 生成后自动复检
patab-widget inspect dist/<id>-<version>.patab.zip   # 对成品包再独立复检
```

`pack` 在写出前、写出后都会自动执行与 `inspect` 相同的完整校验，失败时删除临时产物。所有 CLI 输出为单行 JSON（`{"ok":true,"code":"OK","message":"..."}`），失败时退出码为 1，错误码稳定，可直接接入 CI。
