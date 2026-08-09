---
sidebar_position: 7
---

# 安全模型

PaTab 自定义组件是**用户本地导入的第三方 ZIP**，不属于 PaTab 审核或托管的软件。平台的设计前提是一切包内容都不可信：即使签名有效，也只表示包与该公钥匹配，不代表 PaTab 对组件内容作出安全保证。

## 沙箱隔离

- 组件 surface 只能运行在 **不含 `allow-same-origin` 的 `sandbox="allow-scripts"` iframe** 中（另设 `referrerpolicy="no-referrer"`）。组件无法访问宿主 DOM、Pinia store、localStorage 或浏览器扩展 API，也不开放表单、下载、顶层导航与弹窗。
- **Web 端**用 `srcdoc` 注入 surface（opaque origin）；**浏览器扩展端（MV3）**用清单声明的固定 sandbox page 加唯一内层 iframe，固定页本身受 MV3 sandbox CSP 约束。
- 安装前的审查页**不插入、不执行**包内 HTML，不创建任何第三方 iframe——所有校验都是纯静态的。

## 内容安全策略（CSP）

宿主在运行前向每个 surface 注入固定 CSP（无 `unsafe-eval`）：

```text
default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline';
img-src data: blob:; font-src data:; media-src data: blob:;
connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'
```

要点：

- `connect-src 'none'`：组件**不能直接发起任何网络请求**，唯一出口是 `network.fetch`
- 脚本/样式只允许内联（产物本就是自包含 HTML）；图片/字体/媒体只允许 `data:`/`blob:`
- 自带 CSP meta 的 surface、外链资源、`meta refresh`、内联 `import(` 等都会在注入前被拒绝

## 通信与 Capability Broker

握手完成后，组件与宿主之间只存在一条 `MessagePort` 通道，所有请求经过宿主侧唯一的 **Capability Broker** 逐次校验：

- **协议与形状**：固定 `protocol: 'patab-widget'`、`apiVersion: 1`、会话 ID 匹配、请求字段白名单、请求 ID 格式与防重
- **权限**：每次调用实时重查授权（不缓存）——用户撤销权限后，旧 iframe 的下一次调用立即被拒绝；组件更新或卸载后，旧会话的调用同样立即失效
- **配额与频率**：单请求 256 KiB、channel 消息 64 KiB、10 秒 100 请求、并发 16（网络 4）、toast 10 秒 3 次；连续 3 次超限触发洪泛保护并销毁 iframe
- **错误脱敏**：只返回 19 个稳定错误码与安全消息，不展示组件私有数据、请求正文、`Authorization`、宿主堆栈或本机路径

## 数据隔离

- 组件包、授权、实例私有数据、回滚版本与健康记录存放在**独立的 IndexedDB 数据库**（`patab-custom-components`），与宿主主状态分离；主屏 localStorage 只保留轻量实例引用（另有独立的安全状态布尔/计数键）
- 实例存储按 `组件 ID + 实例 ID` 隔离，单实例 1 MiB；变化事件只广播键名，不携带值
- 更新、卸载与配额写入使用原子事务

## 故障恢复与安全模式

- surface 须在 **5 秒内完成握手**，否则判定启动失败并销毁 iframe
- 24 小时内连续 3 次启动失败/洪泛/未完成启动：自动停用该实例（调用返回 `INSTANCE_DISABLED`）
- 连续 3 次会话未完成启动：进入**安全模式**——阻止所有第三方 iframe，但保留管理与卸载入口；退出安全模式不会自动重新启用实例
- 卸载需二次确认，原子删除包、授权、所有实例、私有数据、健康记录与回滚版本

## 已知边界（用户与开发者都应了解）

- 浏览器 sandbox 没有可靠的 CPU/内存硬配额，平台以启动标记、自动停用与安全模式缓解资源滥用
- 已授权的网络 origin 仍可能接收组件主动发出的数据——Manifest 的 `reason` 会在安装确认页向用户展示
- 未签名包更新时没有发布者身份连续性保证
- Web 端 `network.fetch` 受目标站点 CORS 约束（PaTab 不提供代理绕过）；扩展端的 host permission 可被用户随时撤销

## 给组件开发者的安全清单

- 只声明真正需要的权限与网络来源，`reason` 写清楚用途
- `ui.openExternal` 仅用于用户明确触发的跳转
- 不要把 `client.sessionId` 或实例私有数据发往外部服务
- 对 `PERMISSION_DENIED`、`QUOTA_EXCEEDED`、`RATE_LIMITED` 等错误做好降级处理
- 妥善保管签名私钥（口令保护、勿提交仓库）；换钥意味着发布者身份变化
