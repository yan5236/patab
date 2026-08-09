import type { PatabWidgetManifestV1 } from '@patab/widget-sdk'
import { describe, expect, it } from 'vitest'

import { decideComponentUpdate } from './componentUpdatePolicy'

/** 创建只包含更新身份与版本判定所需字段的 Manifest，避免本纯规则测试耦合 ZIP 或 Repository。 */
function createManifest(version: string, publicKey?: string): Pick<PatabWidgetManifestV1, 'id' | 'publisher' | 'version'> {
  return {
    id: 'com.example.update',
    version,
    ...(publicKey ? { publisher: { publicKey } } : {}),
  }
}

/** 覆盖首次安装、SemVer 先后和发布者身份变化的更新入口判定。 */
describe('组件更新身份与版本判定', () => {
  /** 验证尚无同 ID 目录时保留首次安装路径，不能把新组件误判为更新。 */
  it('将未安装组件判定为首次安装', () => {
    expect(decideComponentUpdate(undefined, createManifest('1.0.0'))).toEqual({ kind: 'install' })
  })

  /** 验证正式版高于预发布版，而仅构建元数据不同、相同或更低版本一律不能覆盖。 */
  it('只允许严格更高的 SemVer 版本进入更新', () => {
    const installed = {
      componentId: 'com.example.update',
      activeVersion: '1.0.0-rc.1',
    }

    expect(decideComponentUpdate(installed, createManifest('1.0.0'))).toMatchObject({
      kind: 'update',
      currentVersion: '1.0.0-rc.1',
      incomingVersion: '1.0.0',
    })
    expect(decideComponentUpdate({ ...installed, activeVersion: '1.0.0' }, createManifest('1.0.0+rebuild'))).toMatchObject({
      kind: 'reject',
      code: 'UPDATE_VERSION_NOT_HIGHER',
    })
    expect(decideComponentUpdate({ ...installed, activeVersion: '2.0.0' }, createManifest('1.9.9'))).toMatchObject({
      kind: 'reject',
      code: 'UPDATE_VERSION_NOT_HIGHER',
    })
  })

  /** 验证签名公钥值、从签名变未签名或从未签名变签名都会阻止同组件覆盖。 */
  it('将发布者密钥变化作为不可覆盖的身份变化', () => {
    const installed = {
      componentId: 'com.example.update',
      activeVersion: '1.0.0',
      publisherPublicKey: 'old-public-key',
    }

    expect(decideComponentUpdate(installed, createManifest('1.1.0', 'new-public-key'))).toMatchObject({
      kind: 'reject',
      code: 'PUBLISHER_KEY_CHANGED',
    })
    expect(decideComponentUpdate(installed, createManifest('1.1.0'))).toMatchObject({
      kind: 'reject',
      code: 'PUBLISHER_KEY_CHANGED',
    })
  })
})
