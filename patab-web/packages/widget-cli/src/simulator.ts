import { createServer, type Plugin, type ViteDevServer } from 'vite'

import { loadWidgetProject } from './project.js'
import { WidgetCliError } from './report.js'

/** 模拟器固定入口；只由开发 Vite server 提供，生产 check/pack 永远不会读取该 URL。 */
export const WIDGET_SIMULATOR_PATH = '/__patab_widget_simulator__'

/** dev 命令支持的网络端口与 host 输入，默认使用 loopback 避免把 HMR 模拟器暴露到局域网。 */
export interface StartWidgetSimulatorOptions {
  readonly root?: string
  readonly host?: string
  readonly port?: number
}

/** 用 JSON 字符串安全嵌入开发 shell，避免组件源码中的尖括号意外终止宿主脚本。 */
function serializeForSimulator(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
}

/** 生成模拟器页面：控制面板持有 Mock 状态，surface 仍运行在只含 allow-scripts 的 sandbox iframe 内。 */
function createSimulatorHtml(input: {
  readonly manifest: Awaited<ReturnType<typeof loadWidgetProject>>['manifest']
}): string {
  const sourcePaths = Object.fromEntries(Object.entries(input.manifest.surfaces).map(([surface, declaration]) => [surface, `src/surfaces/${declaration.entry.slice('surfaces/'.length)}`]))
  return `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PaTab Widget 模拟器</title><style>
body{margin:0;font-family:system-ui,sans-serif;background:#f4f6fb;color:#182033;display:grid;grid-template-columns:280px 1fr;min-height:100vh}.panel{padding:20px;background:#fff;border-right:1px solid #d9deea}.panel label{display:block;margin:12px 0 4px;font-size:13px}.panel select,.panel input,.panel button{box-sizing:border-box;width:100%;padding:8px}.frame{padding:24px}.frame iframe{width:100%;height:calc(100vh - 48px);border:0;border-radius:16px;background:#fff}.log{font-size:12px;white-space:pre-wrap;max-height:160px;overflow:auto;background:#111827;color:#d1fae5;padding:8px;border-radius:8px}
</style></head><body><aside class="panel"><h1>PaTab 模拟器</h1><label>Surface<select id="surface"></select></label><label>尺寸<select id="size"></select></label><label>类型<select id="variant"></select></label><label>主题<select id="theme"><option value="light">浅色</option><option value="dark">深色</option></select></label><label>语言<select id="locale"><option value="zh-CN">zh-CN</option><option value="en-US">en-US</option></select></label><label><input id="motion" type="checkbox">减少动画</label><label>confirm Mock<select id="confirm"><option value="false">取消</option><option value="true">确认</option></select></label><label>network Mock JSON<input id="network" value='{"status":200,"headers":{"content-type":"application/json"},"body":"{\\"ok\\":true}"}'></label><label>toast</label><div id="log" class="log">等待 surface 连接。</div></aside><main class="frame"><iframe id="surface-frame" sandbox="allow-scripts" title="PaTab sandbox 模拟器"></iframe></main><script>
const manifest=${serializeForSimulator(input.manifest)};const sourcePaths=${serializeForSimulator(sourcePaths)};const storage=new Map();let port;let requestSequence=0;let current={surface:'widget',size:manifest.defaultSize,variantId:manifest.defaultVariant,theme:'light',locale:'zh-CN',reducedMotion:false};
const byId=(id)=>document.getElementById(id);const log=(value)=>{byId('log').textContent=String(value).slice(0,1000)};const sendEvent=(event,payload)=>port&&port.postMessage({protocol:'patab-widget',apiVersion:1,sessionId:'simulator-session',event,payload});
const select=byId('surface');Object.keys(manifest.surfaces).forEach((surface)=>select.add(new Option(surface,surface)));const sizes=byId('size');manifest.sizes.forEach((size)=>sizes.add(new Option(size.w+'×'+size.h,JSON.stringify(size))));const variants=byId('variant');variants.add(new Option('无',''));(manifest.variants||[]).forEach((variant)=>variants.add(new Option(variant.id,variant.id)));
function context(){return {componentId:manifest.id,instanceId:'simulator-instance',componentVersion:manifest.version,apiVersion:1,surface:current.surface,size:current.size,...(current.variantId?{variantId:current.variantId}:{}),locale:current.locale,theme:current.theme,reducedMotion:current.reducedMotion,visible:true,permissions:{granted:manifest.permissions?.required||[],networkOrigins:(manifest.network||[]).map((item)=>item.origin)}}}
function response(request,result,error){port&&port.postMessage(error?{requestId:request.requestId,ok:false,error}:{requestId:request.requestId,ok:true,...(result===undefined?{}:{result})})}
function connect(){const frame=byId('surface-frame');const source=sourcePaths[current.surface];fetch('/'+source).then((result)=>result.text()).then((html)=>{const bridge='<script>(function(){window.addEventListener("message",function(event){if(event.source!==window.parent||event.data?.type!=="patab-simulator-connect")return;const nextPort=event.ports[0];if(!nextPort)return;window.__PATAB_WIDGET_PORT__=nextPort;window.__PATAB_WIDGET_SESSION_ID__=event.data.token;nextPort.start();window.dispatchEvent(new CustomEvent("patab-widget-connected"));});})();<\\/script>';const sourceDirectory=source.slice(0,source.lastIndexOf('/')+1);frame.srcdoc=html.replace('<head>','<head><base href="'+location.origin+'/'+sourceDirectory+'">'+bridge);frame.onload=()=>{const channel=new MessageChannel();port=channel.port1;port.onmessage=(event)=>{const request=event.data||{};let result;let error;try{if(request.method==='context.get')result=context();else if(request.method==='storage.get'){const key=request.params?.key;result=storage.has(key)?{found:true,value:storage.get(key)}:{found:false}}else if(request.method==='storage.keys')result={keys:[...storage.keys()].sort()};else if(request.method==='storage.set'){storage.set(request.params?.key,request.params?.value);sendEvent('storageChanged',{key:request.params?.key,operation:'set'})}else if(request.method==='storage.remove'){const removed=storage.delete(request.params?.key);result={removed};if(removed)sendEvent('storageChanged',{key:request.params?.key,operation:'remove'})}else if(request.method==='channel.publish')sendEvent('channelMessage',{message:request.params?.message});else if(request.method==='channel.subscribe'||request.method==='channel.unsubscribe'){}else if(request.method==='ui.toast')log('toast: '+String(request.params?.message||''));else if(request.method==='ui.confirm')result={confirmed:byId('confirm').value==='true'};else if(request.method==='ui.openSurface'){current.surface=request.params?.surface;response(request);load();return}else if(request.method==='ui.closeSurface'){}else if(request.method==='ui.openExternal')result={opened:false};else if(request.method==='ui.openVariantPicker'){}else if(request.method==='network.fetch')result=JSON.parse(byId('network').value);else if(request.method==='todos.list')result={items:[]};else error={code:'UNKNOWN_METHOD',message:'模拟器未实现该 API 方法。'}}catch{error={code:'INVALID_ARGUMENT',message:'模拟器 Mock 参数无效。'}}response(request,result,error)};port.start();frame.contentWindow.postMessage({type:'patab-simulator-connect',token:'simulator-session'},'*',[channel.port2]);log('已连接 '+current.surface)}}).catch(()=>log('无法加载开发 surface。'))}
function load(){if(port){port.close();port=undefined}connect()}select.onchange=()=>{current.surface=select.value;load()};sizes.onchange=()=>{const previousSize=current.size;current.size=JSON.parse(sizes.value);sendEvent('sizeChanged',{previousSize,size:current.size})};variants.onchange=()=>{const previousVariantId=current.variantId;current.variantId=variants.value||undefined;sendEvent('variantChanged',{...(previousVariantId?{previousVariantId}:{}),...(current.variantId?{variantId:current.variantId}:{})})};byId('theme').onchange=()=>{current.theme=byId('theme').value;sendEvent('themeChanged',{theme:current.theme,reducedMotion:current.reducedMotion})};byId('locale').onchange=()=>{current.locale=byId('locale').value;sendEvent('localeChanged',{locale:current.locale})};byId('motion').onchange=()=>{current.reducedMotion=byId('motion').checked;sendEvent('themeChanged',{theme:current.theme,reducedMotion:current.reducedMotion})};select.value=current.surface;sizes.value=JSON.stringify(current.size);variants.value=current.variantId||'';load();
</script></body></html>`
}

/** 为 Vite 注入一个仅开发期存在的模拟器端点，避免向项目源码、生产 bundle 或 ZIP 写入任何 dev client 配置。 */
function createSimulatorPlugin(html: string): Plugin {
  return {
    name: 'patab-widget-simulator',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url?.split('?', 1)[0] !== WIDGET_SIMULATOR_PATH) return next()
        response.statusCode = 200
        response.setHeader('Content-Type', 'text/html; charset=utf-8')
        response.end(html)
      })
    },
  }
}

/**
 * 启动带 HMR 的本地 sandbox 模拟器。
 *
 * Vite 仅服务开发源码，组件仍在 allow-scripts iframe 内通过公开 MessageChannel Mock 调用 API；生产 check/pack 会重新构建并拒绝这些本地资源。
 */
export async function startWidgetSimulator(options: StartWidgetSimulatorOptions = {}): Promise<ViteDevServer> {
  const project = await loadWidgetProject(options.root)
  const html = createSimulatorHtml({ manifest: project.manifest })
  try {
    const server = await createServer({
      root: project.root,
      appType: 'spa',
      plugins: [createSimulatorPlugin(html)],
      server: {
        host: options.host ?? '127.0.0.1',
        port: options.port ?? 5174,
        strictPort: true,
        // allow-scripts iframe 是 opaque origin；仅回显 null 使其能读取同一 loopback Vite 源码和 HMR client。
        cors: { origin: 'null' },
      },
    })
    await server.listen()
    return server
  } catch {
    throw new WidgetCliError('BUILD_FAILED', '无法启动组件开发模拟器。')
  }
}
