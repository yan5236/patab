#!/usr/bin/env node
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'

import { resolveCreateCommandInput } from './cli-input.js'
import { createWidgetProject } from './scaffold.js'

/** 执行 create-patab-widget，默认以当前目录下的项目名创建全新目录，不会写入已存在项目。 */
async function main(): Promise<void> {
  const argumentsList = process.argv.slice(2)
  if (argumentsList.includes('--help')) {
    stdout.write('用法：create-patab-widget [项目名] [--template vue-ts|vanilla-ts]\n')
    return
  }
  const readline = stdin.isTTY ? createInterface({ input: stdin, output: stdout }) : undefined
  const { name, template } = await resolveCreateCommandInput(argumentsList, readline?.question.bind(readline))
    .finally(() => readline?.close())
  const created = await createWidgetProject({ targetDirectory: name, name, template })
  stdout.write(`已创建 ${created.template} 组件项目。请先安装依赖，再运行 npm run check。\n`)
}

void main().catch(() => {
  process.stderr.write('创建组件项目失败。\n')
  process.exitCode = 1
})
