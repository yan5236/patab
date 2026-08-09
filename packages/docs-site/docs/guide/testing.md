---
sidebar_position: 6
---

# 本地调试与测试

## 本地模拟器（patab-widget dev）

```bash
pnpm dev    # = patab-widget dev
```

输出形如：

```text
模拟器已启动：http://127.0.0.1:5174/__patab_widget_simulator__
```

模拟器页面分两部分：

- **右侧**：组件 surface 运行在与生产一致的 `sandbox="allow-scripts"` iframe 中，通过注入的桥接脚本获得与宿主一致的 `MessagePort` 握手，SDK 代码无需任何改动即可连接。
- **左侧控制面板**：切换 surface、图块尺寸、variant、主题（明/暗）、语言、减少动画偏好；mock `ui.confirm` 的结果与 `network.fetch` 的响应（面板 JSON）；查看 `ui.toast` 日志。

模拟器基于 Vite dev server，修改源码即时热更新。常用选项：

```bash
patab-widget dev --host 0.0.0.0 --port 5200   # 默认 127.0.0.1:5174（strictPort，占用即失败）
```

:::warning
模拟器是纯本地环境，不需要也不支持接入真实 PaTab 宿主。生产 `check`/`pack` 永远不会读取模拟器地址；模拟器放宽的 loopback 访问只是开发便利，不代表现实宿主行为。要验证真实集成，打包后把 ZIP 重新导入 PaTab。
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
