#!/usr/bin/env node
import { runPatabWidgetCli } from './cli.js'

/** 以进程退出码转交可测试的 CLI 执行结果，避免库入口在 import 时意外修改宿主进程。 */
void runPatabWidgetCli(process.argv.slice(2)).then((exitCode) => {
  process.exitCode = exitCode
})
