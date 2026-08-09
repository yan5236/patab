import { createApp } from 'vue'
import '@patab/widget-sdk/theme.css'
import App from './detail.vue'

/** 挂载 detail Vue surface；App 内只调用公开 SDK。 */
createApp(App).mount('#app')
