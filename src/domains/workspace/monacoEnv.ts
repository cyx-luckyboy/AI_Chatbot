/**
 * 必须在 import monaco-editor 之前执行。
 * Vite 用 ?worker 打包 Monaco 语言服务 Worker，避免 Electron 下 getWorker 未定义。
 */
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import CssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import HtmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import TsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'

type MonacoWorkerCtor = new () => Worker

function asWorkerCtor(mod: unknown): MonacoWorkerCtor {
  // Vite ?worker 默认导出为 Worker 构造函数；部分环境下是 { default: Ctor }
  const c = mod as MonacoWorkerCtor | { default: MonacoWorkerCtor }
  return typeof c === 'function' ? c : c.default
}

const EditorWorkerCtor = asWorkerCtor(EditorWorker)
const JsonWorkerCtor = asWorkerCtor(JsonWorker)
const CssWorkerCtor = asWorkerCtor(CssWorker)
const HtmlWorkerCtor = asWorkerCtor(HtmlWorker)
const TsWorkerCtor = asWorkerCtor(TsWorker)

;(globalThis as typeof globalThis & { MonacoEnvironment?: { getWorker: (_: unknown, label: string) => Worker } }).MonacoEnvironment =
  {
    getWorker(_: unknown, label: string) {
      if (label === 'json') return new JsonWorkerCtor()
      if (label === 'css' || label === 'scss' || label === 'less') return new CssWorkerCtor()
      if (label === 'html' || label === 'handlebars' || label === 'razor') return new HtmlWorkerCtor()
      if (label === 'typescript' || label === 'javascript') return new TsWorkerCtor()
      return new EditorWorkerCtor()
    },
  }
