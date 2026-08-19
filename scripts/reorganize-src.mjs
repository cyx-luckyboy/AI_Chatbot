/**
 * Reorganize src/ into main|preload|renderer|domains|shared|ipc.
 * Run: node scripts/reorganize-src.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const srcRoot = path.join(root, 'src')

const FILE_MOVES = {
  'main.ts': 'main/main.ts',
  'menu.ts': 'main/menu.ts',
  'squirrel-startup.ts': 'main/squirrel-startup.ts',
  'preload.ts': 'preload/preload.ts',
  'preload.d.ts': 'preload/preload.d.ts',
  'ipc.ts': 'ipc/setup.ts',
  'db.ts': 'shared/db.ts',
  'types.ts': 'shared/types.ts',
  'config.ts': 'shared/config.ts',
  'appearance.ts': 'shared/appearance.ts',
  'appMeta.ts': 'shared/appMeta.ts',
  'formatDateTime.ts': 'shared/formatDateTime.ts',
  'rootFontSize.ts': 'shared/rootFontSize.ts',
  'generator.js': 'shared/generator.js',
  'ipcSerialize.ts': 'shared/ipcSerialize.ts',
  'restoreRouteKey.ts': 'shared/restoreRouteKey.ts',
  'config/providerConfig.ts': 'shared/config/providerConfig.ts',
  'chatAbort.ts': 'domains/chat/chatAbort.ts',
  'chatClockContext.ts': 'domains/chat/chatClockContext.ts',
  'chatSystemContext.ts': 'domains/chat/chatSystemContext.ts',
  'conversationTitleMain.ts': 'domains/chat/conversationTitleMain.ts',
  'webSearchFlow.ts': 'domains/chat/webSearchFlow.ts',
  'tavilySearch.ts': 'domains/chat/tavilySearch.ts',
  'helper.ts': 'domains/chat/helper.ts',
  'markdownPlain.ts': 'domains/chat/markdownPlain.ts',
  'persistUploads.ts': 'domains/chat/persistUploads.ts',
  'attachmentLimits.ts': 'domains/chat/attachmentLimits.ts',
  'useChatWallpaperLayer.ts': 'domains/chat/useChatWallpaperLayer.ts',
  'stores/conversation.ts': 'domains/chat/stores/conversation.ts',
  'stores/message.ts': 'domains/chat/stores/message.ts',
  'stores/provider.ts': 'domains/chat/stores/provider.ts',
  'meetingAudioMain.ts': 'domains/meeting/meetingAudioMain.ts',
  'meetingChatPost.ts': 'domains/meeting/meetingChatPost.ts',
  'meetingGlobalHandlers.ts': 'domains/meeting/meetingGlobalHandlers.ts',
  'meetingSessionMain.ts': 'domains/meeting/meetingSessionMain.ts',
  'meetingSummarizeMain.ts': 'domains/meeting/meetingSummarizeMain.ts',
  'meetingTextExport.ts': 'domains/meeting/meetingTextExport.ts',
  'meetingTranslate.ts': 'domains/meeting/meetingTranslate.ts',
  'meetingTranslateMain.ts': 'domains/meeting/meetingTranslateMain.ts',
  'stores/meeting.ts': 'domains/meeting/stores/meeting.ts',
  'views/Meetings.vue': 'domains/meeting/Meetings.vue',
  'petSpeakMain.ts': 'domains/pet/petSpeakMain.ts',
  'petTtsLog.ts': 'domains/pet/petTtsLog.ts',
  'petWindowMain.ts': 'domains/pet/petWindowMain.ts',
  'petChatBridge.ts': 'domains/pet/petChatBridge.ts',
  'petChatHandlers.ts': 'domains/pet/petChatHandlers.ts',
  'petChatPersona.ts': 'domains/pet/petChatPersona.ts',
  'baiduAsrMain.ts': 'domains/speech/baiduAsrMain.ts',
  'baiduRealtimeAsrMain.ts': 'domains/speech/baiduRealtimeAsrMain.ts',
  'speechPlain.ts': 'domains/speech/speechPlain.ts',
  'speech/useMeetingRecorder.ts': 'domains/speech/useMeetingRecorder.ts',
  'speech/useVoiceInput.ts': 'domains/speech/useVoiceInput.ts',
  'speech/wavEncode.ts': 'domains/speech/wavEncode.ts',
  'terminalMain.ts': 'domains/workspace/terminalMain.ts',
  'monacoEnv.ts': 'domains/workspace/monacoEnv.ts',
  'monacoSetup.ts': 'domains/workspace/monacoSetup.ts',
  'agentChatFlow.ts': 'domains/workspace/agentChatFlow.ts',
  'agentToolRuntime.ts': 'domains/workspace/agentToolRuntime.ts',
  'providerPlugins.ts': 'domains/workspace/providerPlugins.ts',
  'providerConfigReady.ts': 'domains/workspace/providerConfigReady.ts',
  'views/Workspace.vue': 'domains/workspace/Workspace.vue',
  'imageGenerateMain.ts': 'domains/media/imageGenerateMain.ts',
  'imageGenPromptDetect.ts': 'domains/media/imageGenPromptDetect.ts',
  'jimengGenerateMain.ts': 'domains/media/jimengGenerateMain.ts',
  'jimengModels.ts': 'domains/media/jimengModels.ts',
  'volcVisualApi.ts': 'domains/media/volcVisualApi.ts',
  'translateMain.ts': 'domains/media/translateMain.ts',
  'translatePrompt.ts': 'domains/media/translatePrompt.ts',
  'pptBuildFile.ts': 'domains/media/ppt/pptBuildFile.ts',
  'pptChatMessages.ts': 'domains/media/ppt/pptChatMessages.ts',
  'pptExportRenderer.ts': 'domains/media/ppt/pptExportRenderer.ts',
  'pptGeneratePrompt.ts': 'domains/media/ppt/pptGeneratePrompt.ts',
  'pptLayouts.ts': 'domains/media/ppt/pptLayouts.ts',
  'pptNormalize.ts': 'domains/media/ppt/pptNormalize.ts',
  'pptParseMarkdown.ts': 'domains/media/ppt/pptParseMarkdown.ts',
  'pptScenarioPrompts.ts': 'domains/media/ppt/pptScenarioPrompts.ts',
  'pptSlideBackgrounds.ts': 'domains/media/ppt/pptSlideBackgrounds.ts',
  'pptThemes.ts': 'domains/media/ppt/pptThemes.ts',
  'locationDetect.ts': 'domains/location/locationDetect.ts',
  'locationMain.ts': 'domains/location/locationMain.ts',
  'locationWindows.ts': 'domains/location/locationWindows.ts',
  'userLocation.ts': 'domains/location/userLocation.ts',
  'useLocationConfig.ts': 'domains/location/useLocationConfig.ts',
  'components/LocationBadge.vue': 'domains/location/LocationBadge.vue',
  'renderer.ts': 'renderer/renderer.ts',
  'App.vue': 'renderer/App.vue',
  'index.css': 'renderer/index.css',
  'iconifySetup.ts': 'renderer/iconifySetup.ts',
  'browserElectronShim.ts': 'renderer/browserElectronShim.ts',
  'views/Home.vue': 'renderer/views/Home.vue',
  'views/Conversation.vue': 'renderer/views/Conversation.vue',
  'views/Settings.vue': 'renderer/views/Settings.vue',
  'components/Button.vue': 'renderer/components/Button.vue',
  'components/ConversationList.vue': 'renderer/components/ConversationList.vue',
  'components/MessageInput.vue': 'renderer/components/MessageInput.vue',
  'components/MessageList.vue': 'renderer/components/MessageList.vue',
  'components/ProviderSelect.vue': 'renderer/components/ProviderSelect.vue',
  'components/WebSearchReferencesBar.vue': 'renderer/components/WebSearchReferencesBar.vue',
}

const DIR_MOVES = {
  pet: 'domains/pet/ui',
  'components/meeting': 'domains/meeting/components',
  'components/workspace': 'domains/workspace/components',
  i18n: 'shared/i18n',
  locales: 'shared/locales',
  stubs: 'shared/stubs',
  composables: 'renderer/composables',
}

function posix(p) {
  return p.split(path.sep).join('/')
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name)
    if (fs.statSync(p).isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}

function buildFullMoves() {
  const full = { ...FILE_MOVES }
  for (const [oldDir, newDir] of Object.entries(DIR_MOVES)) {
    const abs = path.join(srcRoot, oldDir)
    for (const f of walk(abs)) {
      const rel = posix(path.relative(srcRoot, f))
      if (full[rel]) continue
      const rest = rel.slice(posix(oldDir).length).replace(/^\//, '')
      full[rel] = posix(path.posix.join(newDir, rest))
    }
  }
  return full
}

function resolveExisting(absNoExt) {
  const tries = [
    absNoExt,
    absNoExt + '.ts',
    absNoExt + '.js',
    absNoExt + '.vue',
    absNoExt + '.d.ts',
    path.join(absNoExt, 'index.ts'),
    path.join(absNoExt, 'index.js'),
  ]
  for (const t of tries) {
    if (fs.existsSync(t) && fs.statSync(t).isFile()) return t
  }
  return null
}

function importPathFor(fromFile, toFile) {
  let target = toFile
  if (/\.(ts|js|mjs|cjs)$/.test(target) && !target.endsWith('.d.ts')) {
    target = target.replace(/\.(ts|js|mjs|cjs)$/, '')
  }
  let rel = posix(path.relative(path.dirname(fromFile), target))
  if (!rel.startsWith('.')) rel = './' + rel
  return rel
}

const fullMoves = buildFullMoves()
/** oldRel -> newRel (posix, with extension) */
const oldToNew = new Map(Object.entries(fullMoves).map(([k, v]) => [posix(k), posix(v)]))

/** Also index by path without extension */
function lookupNew(oldRelWithOrWithoutExt) {
  const p = posix(oldRelWithOrWithoutExt)
  if (oldToNew.has(p)) return oldToNew.get(p)
  for (const [o, n] of oldToNew) {
    if (o.replace(/\.(ts|js|vue|d\.ts)$/, '').replace(/\.d$/, '') === p.replace(/\.(ts|js|vue)$/, '')) {
      return n
    }
  }
  // unmoved (providers, .env, etc.)
  return p
}

// Snapshot import rewrites before moving
/** newRel -> [{spec, newSpec}] */
const pendingRewrites = new Map()

for (const [oldRel, newRel] of oldToNew) {
  const oldAbs = path.join(srcRoot, oldRel)
  if (!fs.existsSync(oldAbs)) continue
  if (!/\.(ts|js|vue|mjs|cjs)$/.test(oldAbs)) continue
  const text = fs.readFileSync(oldAbs, 'utf8')
  const re = /((?:import|export)\s+(?:type\s+)?(?:[^'";]*?\s+from\s+)?|import\s*\(|require\s*\()\s*['"](\.[^'"]+)['"]/g
  const edits = []
  let m
  while ((m = re.exec(text))) {
    const spec = m[2]
    const resolved = resolveExisting(path.normalize(path.join(path.dirname(oldAbs), spec)))
    if (!resolved) {
      // side-effect import like './squirrel-startup' or missing — try without resolve
      const guessed = path.normalize(path.join(path.dirname(oldAbs), spec))
      const oldTargetRel = posix(path.relative(srcRoot, guessed))
      const newTargetRel = lookupNew(oldTargetRel.endsWith('.ts') || oldTargetRel.includes('.') ? oldTargetRel : oldTargetRel)
      // try adding extensions in lookup
      let mapped =
        lookupNew(oldTargetRel) ||
        lookupNew(oldTargetRel + '.ts') ||
        lookupNew(oldTargetRel + '.js') ||
        lookupNew(oldTargetRel + '.vue')
      // lookupNew always returns something
      mapped = lookupNew(oldTargetRel)
      if (!oldToNew.has(oldTargetRel) && !oldToNew.has(oldTargetRel + '.ts') && !oldToNew.has(oldTargetRel + '.vue')) {
        // maybe providers or already correct relative after both unmoved
        const stillOld = path.join(srcRoot, oldTargetRel)
        const stillNew = path.join(srcRoot, lookupNew(oldRel) === newRel ? oldTargetRel : lookupNew(oldTargetRel))
        // If target didn't move and source did, need new relative from newRel to oldTargetRel
        const targetNewRel = (() => {
          for (const ext of ['', '.ts', '.js', '.vue']) {
            const key = oldTargetRel + (oldTargetRel.endsWith(ext) ? '' : ext)
            if (oldToNew.has(key)) return oldToNew.get(key)
            const bare = oldTargetRel.replace(/\.(ts|js|vue)$/, '')
            if (oldToNew.has(bare + ext)) return oldToNew.get(bare + ext)
          }
          // directory prefix
          for (const [od, nd] of Object.entries(DIR_MOVES)) {
            const odp = posix(od) + '/'
            if (oldTargetRel === posix(od) || oldTargetRel.startsWith(odp)) {
              return oldTargetRel.replace(posix(od), posix(nd))
            }
          }
          if (oldTargetRel.startsWith('providers/')) return oldTargetRel
          return oldTargetRel
        })()
        const newSpec = importPathFor(path.join(srcRoot, newRel), path.join(srcRoot, targetNewRel))
        if (newSpec !== spec) edits.push({ spec, newSpec })
        continue
      }
      const targetNewRel = (() => {
        for (const ext of ['', '.ts', '.js', '.vue']) {
          const key = (oldTargetRel.replace(/\.(ts|js|vue)$/, '') + ext).replace(/^\//, '')
          const variants = [oldTargetRel, oldTargetRel + '.ts', oldTargetRel + '.js', oldTargetRel + '.vue', oldTargetRel.replace(/\.(ts|js)$/, '')]
          for (const v of variants) {
            if (oldToNew.has(v)) return oldToNew.get(v)
          }
        }
        return lookupNew(oldTargetRel)
      })()
      const newSpec = importPathFor(path.join(srcRoot, newRel), path.join(srcRoot, targetNewRel))
      if (newSpec !== spec) edits.push({ spec, newSpec })
      continue
    }
    const oldTargetRel = posix(path.relative(srcRoot, resolved))
    const targetNewRel = lookupNew(oldTargetRel)
    const newSpec = importPathFor(path.join(srcRoot, newRel), path.join(srcRoot, targetNewRel))
    if (newSpec !== spec) edits.push({ spec, newSpec })
  }
  if (edits.length) pendingRewrites.set(newRel, edits)
}

// Also rewrite providers (unmoved) that import moved modules
for (const f of walk(path.join(srcRoot, 'providers'))) {
  if (!/\.(ts|js)$/.test(f)) continue
  const oldRel = posix(path.relative(srcRoot, f))
  const text = fs.readFileSync(f, 'utf8')
  const re = /((?:import|export)\s+(?:type\s+)?(?:[^'";]*?\s+from\s+)?|import\s*\(|require\s*\()\s*['"](\.[^'"]+)['"]/g
  const edits = []
  let m
  while ((m = re.exec(text))) {
    const spec = m[2]
    const resolved = resolveExisting(path.normalize(path.join(path.dirname(f), spec)))
    if (!resolved) continue
    const oldTargetRel = posix(path.relative(srcRoot, resolved))
    const targetNewRel = lookupNew(oldTargetRel)
    if (targetNewRel === oldTargetRel) continue
    const newSpec = importPathFor(f, path.join(srcRoot, targetNewRel))
    if (newSpec !== spec) edits.push({ spec, newSpec })
  }
  if (edits.length) pendingRewrites.set(oldRel, edits)
}

// Physical moves
for (const [oldRel, newRel] of [...oldToNew.entries()].sort((a, b) => b[0].length - a[0].length)) {
  const from = path.join(srcRoot, oldRel)
  const to = path.join(srcRoot, newRel)
  if (!fs.existsSync(from)) {
    console.warn('missing', oldRel)
    continue
  }
  fs.mkdirSync(path.dirname(to), { recursive: true })
  if (path.resolve(from) === path.resolve(to)) continue
  if (fs.existsSync(to)) {
    console.warn('exists', newRel)
    continue
  }
  fs.renameSync(from, to)
  console.log('moved', oldRel, '->', newRel)
}

function rmEmpty(dir) {
  if (!fs.existsSync(dir) || dir === srcRoot) {
    if (dir !== srcRoot && fs.existsSync(dir)) {
      /* fallthrough */
    } else if (dir === srcRoot) {
      for (const name of fs.readdirSync(dir)) {
        const p = path.join(dir, name)
        if (fs.statSync(p).isDirectory()) rmEmpty(p)
      }
      return
    }
  }
  if (!fs.existsSync(dir)) return
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name)
    if (fs.statSync(p).isDirectory()) rmEmpty(p)
  }
  if (dir !== srcRoot && fs.readdirSync(dir).length === 0) fs.rmdirSync(dir)
}
rmEmpty(srcRoot)

// Apply rewrites
for (const [rel, edits] of pendingRewrites) {
  const abs = path.join(srcRoot, rel)
  if (!fs.existsSync(abs)) continue
  let text = fs.readFileSync(abs, 'utf8')
  // longer specs first
  const uniq = [...new Map(edits.map((e) => [e.spec, e])).values()].sort(
    (a, b) => b.spec.length - a.spec.length,
  )
  for (const { spec, newSpec } of uniq) {
    const escaped = spec.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`(['"])${escaped}\\1`, 'g')
    text = text.replace(re, `$1${newSpec}$1`)
  }
  fs.writeFileSync(abs, text)
  console.log('rewrote', rel, edits.length)
}

console.log('complete')
