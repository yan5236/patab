import { createApp } from 'vue'
import '@patab/widget-sdk/theme.css'
import App from './widget.vue'

/** 挂载 widget Vue surface；App 内只调用公开 SDK。 */
createApp(App).mount('#app')
