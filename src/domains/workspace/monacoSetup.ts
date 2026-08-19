import './monacoEnv'
import * as monaco from 'monaco-editor'

let configured = false
let definitionProviders: monaco.IDisposable[] = []
let editorOpener: monaco.IDisposable | null = null

export type OpenAtHandler = (payload: { path: string; line: number; column: number }) => void

function fileUri(relPath: string): monaco.Uri {
  const clean = String(relPath || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
  return monaco.Uri.parse(`file:///${clean}`)
}

export function languageFromPath(filePath: string): string {
  const name = filePath.replace(/\\/g, '/').split('/').pop() || ''
  const lower = name.toLowerCase()
  if (lower.endsWith('.ts') || lower.endsWith('.mts') || lower.endsWith('.cts')) return 'typescript'
  if (lower.endsWith('.tsx')) return 'typescript'
  if (lower.endsWith('.js') || lower.endsWith('.mjs') || lower.endsWith('.cjs')) return 'javascript'
  if (lower.endsWith('.jsx')) return 'javascript'
  if (lower.endsWith('.json')) return 'json'
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'html'
  if (lower.endsWith('.vue')) return 'html'
  if (lower.endsWith('.css')) return 'css'
  if (lower.endsWith('.scss') || lower.endsWith('.sass')) return 'scss'
  if (lower.endsWith('.less')) return 'less'
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) return 'markdown'
  if (lower.endsWith('.py')) return 'python'
  if (lower.endsWith('.go')) return 'go'
  if (lower.endsWith('.rs')) return 'rust'
  if (lower.endsWith('.java')) return 'java'
  if (lower.endsWith('.kt')) return 'kotlin'
  if (lower.endsWith('.cs')) return 'csharp'
  if (lower.endsWith('.cpp') || lower.endsWith('.cc') || lower.endsWith('.cxx')) return 'cpp'
  if (lower.endsWith('.c') || lower.endsWith('.h')) return 'c'
  if (lower.endsWith('.xml')) return 'xml'
  if (lower.endsWith('.yaml') || lower.endsWith('.yml')) return 'yaml'
  if (lower.endsWith('.sql')) return 'sql'
  if (lower.endsWith('.sh') || lower.endsWith('.bash')) return 'shell'
  if (lower.endsWith('.ps1')) return 'powershell'
  if (lower.endsWith('.toml') || lower.endsWith('.ini')) return 'ini'
  return 'plaintext'
}

export function ensureMonacoConfigured(onOpenAt: OpenAtHandler) {
  if (!configured) {
    configured = true
    monaco.languages.typescript.typescriptDefaults.setEagerModelSync(true)
    monaco.languages.typescript.javascriptDefaults.setEagerModelSync(true)
    monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
      target: monaco.languages.typescript.ScriptTarget.ESNext,
      allowNonTsExtensions: true,
      moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
      module: monaco.languages.typescript.ModuleKind.ESNext,
      noEmit: true,
      esModuleInterop: true,
      jsx: monaco.languages.typescript.JsxEmit.React,
      allowJs: true,
    })
    monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
      target: monaco.languages.typescript.ScriptTarget.ESNext,
      allowNonTsExtensions: true,
      allowJs: true,
      noEmit: true,
    })
    monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: true,
      noSyntaxValidation: false,
    })
    monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: true,
      noSyntaxValidation: false,
    })
  }

  editorOpener?.dispose()
  editorOpener = monaco.editor.registerEditorOpener({
    openCodeEditor(_source, resource, selection) {
      const raw = resource.path || resource.fsPath || ''
      const path = decodeURIComponent(String(raw).replace(/^\/+/, '')).replace(/\\/g, '/')
      if (!path) return false
      const line = selection?.startLineNumber || 1
      const column = selection?.startColumn || 1
      onOpenAt({ path, line, column })
      return true
    },
  })

  for (const d of definitionProviders) d.dispose()
  definitionProviders = []

  const langs = ['typescript', 'javascript', 'html', 'python', 'go', 'rust', 'java', 'csharp', 'cpp', 'c']
  for (const lang of langs) {
    definitionProviders.push(
      monaco.languages.registerDefinitionProvider(lang, {
        provideDefinition: async (model, position) => {
          const word = model.getWordAtPosition(position)
          if (!word?.word) return null
          const fromPath = decodeURIComponent((model.uri.path || '').replace(/^\/+/, '')).replace(
            /\\/g,
            '/',
          )
          const res = await window.electronAPI.workspaceFindDefinition({
            symbol: word.word,
            fromPath,
          })
          if (!res.ok || !res.hits.length) return null
          return res.hits.map((h) => ({
            uri: fileUri(h.path),
            range: new monaco.Range(h.line, h.column, h.line, h.column + word.word.length),
          }))
        },
      }),
    )
  }
}

export function applyMonacoTheme(isDark: boolean) {
  monaco.editor.setTheme(isDark ? 'vs-dark' : 'vs')
}

export function getOrCreateModel(relPath: string, content: string, language: string) {
  const uri = fileUri(relPath)
  const existing = monaco.editor.getModel(uri)
  if (existing) {
    if (existing.getValue() !== content) existing.setValue(content)
    monaco.editor.setModelLanguage(existing, language)
    return existing
  }
  return monaco.editor.createModel(content, language, uri)
}

export { monaco, fileUri }
