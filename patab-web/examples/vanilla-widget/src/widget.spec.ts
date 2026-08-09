import { expect, it } from 'vitest'
import { createWidgetMockHost } from '@patab/widget-sdk/testing'

/** 验证组件可以通过公开 SDK Mock 读取实例存储。 */
it('读取 Mock 存储', async () => { const host = createWidgetMockHost({ storage: { greeting: 'PaTab' } }); await expect(host.api.storage.get('greeting')).resolves.toEqual({ found: true, value: 'PaTab' }); host.close() })
