# PaTab 安全规范

## 安全原则

- 默认不信任用户输入。
- 本地持久化数据读取后必须校验形状，损坏时安全回退。
- 不在仓库中提交密钥、令牌、账号、证书或真实用户数据。
- 新依赖必须有明确用途，优先使用已有依赖或浏览器原生能力。

## 输入与 URL

- 快捷方式 URL 必须走统一规范化逻辑，避免组件内各自拼接。
- 用户输入的名称、URL、壁纸地址、图标地址和搜索引擎模板必须做 trim 和基础合法性处理。
- 搜索引擎模板必须包含 `{q}` 或 `%s` 关键词占位，保存前统一归一化为 `{q}`。
- 外链打开行为应避免把未校验字符串直接用于危险上下文。

## 持久化数据

- 当前持久化键为 `patab:v1`。
- 读取 `localStorage` 时必须容错，不能因为脏数据导致应用白屏。
- 修改持久化结构时必须保留兼容逻辑，必要时升级版本号。
- 不把敏感数据写入 `localStorage`。

## 资源与壁纸

- 自定义壁纸可能来自 URL 或 Data URL，展示前应保持来源边界清晰。
- 不执行用户提供的脚本或 HTML。
- 远程图片失败时应提供可用的界面兜底。

## 自定义组件本地导入

用户可公开阅读 [自定义组件安全说明](./custom-component-security.md)；开发者的产物与签名要求见 [自定义组件开发指南](./custom-component-development.md)。这两份说明不得弱化本节的实现边界。

- 本地组件包只接受 `.zip` 与 `.patab.zip`，在读取完整文件前先拒绝超过 10 MiB 的输入；归档解压必须在浏览器 Worker 内完成。
- 安装前只能读取 Manifest、完整性/签名文档和已验证的静态图片；不得插入或执行 package surface HTML，也不得创建第三方 iframe。
- Manifest 通过 SDK Draft 2020-12 Schema、跨字段尺寸/variant 校验、精确 HTTPS origin 校验后，才可检查文件集、SHA-256 完整性和 Ed25519 签名。
- SDK Manifest Schema 验证器在构建期生成 Ajv standalone ESM；MV3 页面不得运行时调用 Ajv `compile` 或放宽为 `unsafe-eval`，生成产物若仍含 CommonJS `require` 会使构建失败。
- 错误界面只能显示稳定错误分类以及安全 ZIP 相对路径或 Manifest JSON Pointer；不得显示 ZIP 正文、本机路径、原始异常、密钥或签名材料。
- `patab-widget check`、`inspect` 与 `pack` 必须复用同一 SDK Schema 和共享包验证链；pack 在任何失败前后删除目标输出，强制执行项目 type-check、生产 surface 自包含校验、完整性与生成后 inspect，且不提供跳过校验的 `--force`。确定性 ZIP 固定排序、压缩级别和 ZIP 允许的最早 DOS 时间，不能写入当前时间。
- `keygen` 默认把 AES-256-CBC 口令加密的 Ed25519 PKCS#8 私钥写到项目目录外；口令只能来自无回显交互终端或受保护 CI 环境变量。解锁、签名或验签失败必须中断 pack，不能降级为未签名包，也不得在默认报告中输出口令、私钥、本机路径或底层加密异常。
- 开发模拟器的 Vite CORS 仅向 opaque sandbox 必需的 `Origin: null` 回显，并默认绑定 `127.0.0.1`；该例外只用于读取本机开发源码与 HMR client，不改变生产 surface CSP、Runtime Broker 或网络权限规则。
- 必需权限和必需网络来源均须用户明确确认；签名无效或发布者密钥变化时禁止安装。授权与包文件只经 `useCustomComponentStore` 调用 Repository 持久化。
- 同 ID 更新只继承新旧 Manifest 交集中的既有 grant；新增权限或精确 origin 必须保持未授权并重新审查。更新前只写 staged 包与快照；migration/离屏健康均复用 sandbox Runtime 且不开放 UI、todos、network、channel 或外链，migration 仅能访问自身 staged storage，单实例最长五秒。最终 activeVersion、instanceData 与 grant 必须在一个 IndexedDB 事务切换；失败只清 staged 内容并保留旧包、旧数据、旧授权及一个上一成功版本。
- 待办 Capability 每次调用都按 `todos.read/create/update/delete` 精确校验动态 grant；只能返回字段受限的复制 DTO。变化事件仅含变化类型与公开 ID，投递前再次检查 `todos.read`，撤销授权后不得继续泄露待办内容或变化。
- `network.fetch` 只接受经 SDK 校验且由策略层再次规范化的 HTTPS 公网 URL：拒绝用户信息、localhost、裸 IP/IPv6、危险端口、Cookie/Host/Origin/Referer、`proxy-*`、`sec-*` 和未声明 fetch 选项；Authorization 仅可作为明确单值请求头传递，任何诊断、错误或日志不得回显 URL、Authorization、请求正文、响应正文或浏览器原始异常。
- 网页端网络调用固定为 CORS、`credentials: 'omit'`、`referrerPolicy: 'no-referrer'`、`redirect: 'error'`、10 秒 AbortController 与 2 MiB 流式响应上限；CORS/网络失败只能返回固定脱敏错误，禁止回退到代理。扩展端除 Repository 精确 origin grant 外，每次 fetch 前还必须以单一精确 `${origin}/*` 模式调用 `chrome.permissions.contains` 确认浏览器仍持有 host permission，撤销后不得发送请求。

## 依赖审计

- 新增依赖前确认现有依赖、标准库或浏览器原生能力不能满足需求。
- 更新依赖后至少运行 `pnpm build` 和 `pnpm test:unit`。
- 出现安全公告时优先升级直接相关依赖。

## 浏览器扩展

- Chrome/Edge 扩展版使用 Manifest V3；常驻 `host_permissions` 只保留当前必需的 `https://api.bing.com/*`，第三方组件来源不得写入常驻授权。
- 生产扩展只能在 `optional_host_permissions` 声明 HTTPS 能力包络，并在安装/更新确认的有效用户手势中逐个申请组件 Manifest 已声明的精确 `${origin}/*`。可选声明不等于已授权；批准、拒绝、跨重启状态和撤销都必须以 `chrome.permissions.contains` 的真实结果为准。
- 第三方 surface 在 Web 端只能运行于唯一 `srcdoc`、`sandbox="allow-scripts"` iframe；MV3 端只能经固定 Manifest sandbox page 转交到唯一同属性内层 iframe。两端都不得添加 `allow-same-origin`，surface CSP 必须保持 `connect-src 'none'` 且禁止 `unsafe-eval`。
- sandbox 只接受预期 iframe `event.source`、一次性随机会话令牌和唯一转移 `MessagePort`；握手失败或 5 秒超时必须关闭端口并移除整棵 iframe。Broker 还必须校验协议/版本/requestId/方法/参数、限制消息体和频率，并在每次调用重读活动版本 grant；错误边界只保留稳定分类，不得泄露 DOMException、扩展 URL、HTML、令牌、请求载荷或堆栈。
- 运行恢复仅在既有 `runtimeHealth` 表保存稳定失败类别和时间戳：单实例 24 小时内第三次握手失败、超时或 Broker 洪泛才自动停用 launcher 引用；成功握手只能清除未执行的握手类失败，洪泛累计只能由用户明确重新启用或窗口过期解除。根启动 `pending` 连续遗留三次时必须在创建任一第三方 iframe 前进入全局安全模式；退出安全模式不得自动重新启用实例。
- 完整卸载的预览必须只显示实例、版本、数据与健康计数；取消不得写入或销毁 session。确认删除必须在一个 IndexedDB `readwrite` 事务内删除组件目录（含 grant）、所有包/rollback/staged 文件、实例数据、健康记录和关联 staged 快照；事务提交前不得移除 launcher 引用，提交后立即销毁该组件全部 sandbox session。
- 基础 Capability 只能从 Broker session 派生组件和实例范围：context/lifecycle 只传 SDK 公共 DTO；storage 先在 Repository 内完成 1 MiB 原子配额校验，`storageChanged` 不含 value；channel 只向同一 `instanceId` 的已订阅 surface 发送最多 64 KiB 的纯 JSON 副本，销毁 session 时必须注销全部订阅。
- `ui.toast` 与 `ui.confirm` 必须走宿主反馈层，始终标识第三方来源，ESC、遮罩和关闭均按取消处理；不得调用浏览器原生 alert/confirm。`ui.openExternal` 每次请求检查 `navigator.userActivation.isActive`、无凭据 HTTPS URL 和宿主目标 origin 确认，只可用 `_blank` 加 `noopener,noreferrer` 打开，任何拒绝、取消或 popup blocker 均不得泄露窗口异常。
- 扩展页禁止加载远程脚本；搜索联想在扩展环境使用 `fetch` 获取 JSONP 文本并本地解析。
- 不新增后台 service worker、content script、tabs 等权限，除非真实功能已经需要。
- 扩展版与网页版共享业务源码，但各自运行在独立 origin，`localStorage` 数据天然隔离。

## 检查清单

- 是否新增了未校验的用户输入？
- 是否新增了直接读写 `localStorage` 的路径？
- 是否新增了外链、图片 URL 或 Data URL 处理？
- 是否新增了依赖或构建插件？
- 是否新增了扩展权限或远程脚本加载路径？
- 是否有错误状态会导致白屏或数据丢失？
