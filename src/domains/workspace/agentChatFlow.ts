import type { BrowserWindow } from 'electron'
import type OpenAI from 'openai'
import {
  AGENT_TOOL_DEFINITIONS,
  executeAgentTool,
  getAgentWorkspacePath,
  parseToolArguments,
  type AgentToolCall,
} from './agentToolRuntime'
import { OpenAIProvider } from '../../providers/OpenAIProvider'
import { ClaudeDirectProvider } from '../../providers/ClaudeDirectProvider'
import type { BaseProvider } from '../../providers/BaseProvider'
import type { CreateChatProps } from '../../shared/types'
import { notifyPetFromChatChunk } from '../pet/petChatBridge'
import {
  isMeaningfulAssistantText,
  sendChunk,
  streamChatToWindow,
  type WebSearchLang,
} from '../chat/webSearchFlow'
import {
  isChatAborted,
} from '../chat/chatAbort'

const MAX_TOOL_ROUNDS = 12
const TOOL_NAMES = new Set(AGENT_TOOL_DEFINITIONS.map((t) => t.function.name))

type ToolsCapable = {
  chatWithTools: OpenAIProvider['chatWithTools']
  toOpenAIMessages: OpenAIProvider['toOpenAIMessages']
}

function asToolsProvider(provider: BaseProvider): ToolsCapable | null {
  const p = provider as BaseProvider & Partial<ToolsCapable>
  if (typeof p.chatWithTools === 'function' && typeof p.toOpenAIMessages === 'function') {
    return p as ToolsCapable
  }
  if (provider instanceof OpenAIProvider) return provider
  if (provider instanceof ClaudeDirectProvider) return provider
  return null
}

function agentStatus(
  key:
    | 'needWorkspace'
    | 'unsupported'
    | 'running'
    | 'tool'
    | 'composing'
    | 'maxRounds'
    | 'nudge',
  lang: WebSearchLang,
  extra?: string,
): string {
  if (lang === 'en') {
    const map = {
      needWorkspace:
        '**Agent mode** needs a workspace folder first. Use “Choose workspace” in the input bar, then send again.',
      unsupported:
        '**Agent mode** needs a provider that supports tools (OpenAI-compatible or Claude direct). Switch model and retry.',
      running: (ws: string) => `🤖 Agent working in:\n\`${ws}\``,
      tool: `🔧 \`${extra || ''}\`…`,
      composing: '✍️ Writing the final answer…',
      maxRounds: 'Reached the tool-call limit. Partial results may be incomplete.',
      nudge: 'Model replied without tools. Forcing a tool-using retry…',
    }
    if (key === 'running') return map.running(extra || '')
    return map[key]
  }
  const map = {
    needWorkspace:
      '**本机 Agent** 需要先选择工作区文件夹。请在输入栏点「选择工作区」后再发送。',
    unsupported:
      '**本机 Agent** 需要支持工具调用的模型（OpenAI 兼容或 Claude 直连）。请切换模型后重试。',
    running: (ws: string) => `🤖 Agent 工作区：\n\`${ws}\``,
    tool: `🔧 调用：\`${extra || ''}\`…`,
    composing: '✍️ 正在整理最终回答…',
    maxRounds: '已达到工具调用轮次上限，结果可能不完整。',
    nudge: '模型未调用工具，正在强制重试（必须真实读写文件）…',
  }
  if (key === 'running') return map.running(extra || '')
  return map[key]
}

function buildEditorFocusFact(
  lang: WebSearchLang,
  editorContext?: CreateChatProps['editorContext'],
): string {
  if (!editorContext?.path) {
    return lang === 'en'
      ? 'LIVE WORKBENCH UI (FACT): no file is open in the editor right now.'
      : '工作台实时 UI（事实）：当前编辑器未打开任何文件。'
  }
  const line = Math.max(1, editorContext.line || 1)
  const col = Math.max(1, editorContext.column || 1)
  if (lang === 'en') {
    return [
      'LIVE WORKBENCH UI (FACT — not a guess):',
      `- Open file: ${editorContext.path}`,
      `- Cursor: line ${line}, column ${col}`,
      'When asked what is on screen / which file is open / where the cursor is: answer ONLY with the above. Never say "probably", "likely", or infer from chat history.',
    ].join('\n')
  }
  return [
    '工作台实时 UI（事实，不是猜测）：',
    `- 当前打开文件：${editorContext.path}`,
    `- 光标位置：第 ${line} 行，第 ${col} 列`,
    '若用户问「现在屏幕上是什么 / 打开了哪个文件 / 光标在哪」：只能根据上述事实直接回答。禁止说「极大概率」「大概是」「结合上一问推断」，禁止用聊天历史去猜界面。',
  ].join('\n')
}

function appendEditorContextToLastUser(
  msgs: OpenAI.Chat.ChatCompletionMessageParam[],
  editorContext: CreateChatProps['editorContext'] | undefined,
  lang: WebSearchLang,
): OpenAI.Chat.ChatCompletionMessageParam[] {
  if (!editorContext?.path) return msgs
  const block = `\n\n<workbench_ui_state>\n${buildEditorFocusFact(lang, editorContext)}\n</workbench_ui_state>`
  const out = msgs.map((m) => ({ ...m }))
  for (let i = out.length - 1; i >= 0; i--) {
    const m = out[i]
    if (m.role === 'user' && typeof m.content === 'string') {
      out[i] = { ...m, content: m.content + block }
      break
    }
  }
  return out
}

function buildAgentSystem(
  lang: WebSearchLang,
  workspace: string,
  editorContext?: CreateChatProps['editorContext'],
): string {
  const editorHint = buildEditorFocusFact(lang, editorContext)

  if (lang === 'en') {
    return `You are a local computer agent with REAL file tools on the user's real desktop OS (NOT a headless cloud sandbox).
Workspace root (absolute): ${workspace}

${editorHint}

CRITICAL RULES:
1. To create/edit/read/list/search files or run commands you MUST call the provided tools. Never pretend you wrote a file in prose only.
2. Prefer relative paths under the workspace (e.g. "notes/todo.md"). Absolute paths inside the workspace are also accepted.
3. After tools succeed, summarize what you actually did (paths + brief result). If a tool returns Error, fix and retry.
4. Do not claim access outside the workspace.
5. Environment facts: This is the user's real machine. GUI apps (pygame, browsers, Notepad, VS Code) CAN show windows. Do NOT say you are headless/sandboxed or that SDL video is unavailable — that is false here.
6. For GUI / long-running programs (games, servers): do NOT wait on them with a blocking run_command. Use open_path / open_in_editor / open_url, or Windows start "" ..., or tell the user the one-line command.
7. When the user asks to open the project in an IDE/compiler/editor, call open_in_editor (preferred) or open_path. Do not claim you cannot open local apps.
8. When creating an HTML page/demo/game: write_file the .html (and assets), then immediately call open_url with that relative path so it opens in the default browser.
9. LIVE WORKBENCH UI above is ground truth from the IDE. Never guess the open file from conversation history. If a file is listed there, that is what the user is looking at.`
  }
  return `你是本机电脑 Agent，拥有真实文件工具，运行在用户的真实桌面系统上（不是无界面云端沙箱）。
工作区根目录（绝对路径）：${workspace}

${editorHint}

硬性规则：
1. 创建/修改/读取/列出/搜索文件或执行命令时，必须调用提供的 tools。禁止只用文字假装已经写好文件。
2. 路径优先使用工作区内相对路径（如 notes/todo.md）；工作区内的绝对路径也可以。
3. 工具成功后，总结你实际做了什么（路径 + 简要结果）。若工具返回 Error，应修正后重试。
4. 不要声称访问了工作区以外的路径。
5. 环境事实：这里是用户本机。GUI 程序（pygame、浏览器、记事本、VS Code）可以弹出窗口。禁止说「无图形界面 / 沙箱 / 无法初始化 SDL」——在本机 Agent 下这是错误说法。
6. 对 GUI 或长时间进程（游戏、服务器）：不要用会阻塞等待的 run_command 一直挂着。应使用 open_path / open_in_editor / open_url，或 Windows 的 start "" ...，或给出用户可复制的一行命令。
7. 用户要求用编译器/IDE/编辑器打开项目时，优先调用 open_in_editor，其次 open_path。不要声称无法打开本机应用。
8. 写 HTML 页面/小游戏/演示时：先 write_file 写出 .html（及资源），再立刻用 open_url 打开该相对路径，用系统默认浏览器展示。
9. 上方「工作台实时 UI」是 IDE 传来的事实。禁止根据聊天历史猜测当前打开的文件或界面；若已给出打开文件，那就是用户正在看的内容。`
}

function finishText(
  win: BrowserWindow,
  messageId: number,
  text: string,
  isError = false,
): void {
  const data = {
    is_end: true as const,
    replace: true as const,
    result: text,
    ...(isError ? { is_error: true as const } : {}),
  }
  sendChunk(win, messageId, data)
  notifyPetFromChatChunk(messageId, data)
}

function renderProgress(lang: WebSearchLang, workspace: string, logLines: string[]): string {
  const head = agentStatus('running', lang, workspace)
  if (!logLines.length) return head
  const title = lang === 'zh' ? '### 工具执行' : '### Tools'
  return `${head}\n\n${title}\n${logLines.join('\n')}`
}

/** 从模型正文中解析伪 tool call（部分中转不返回 tool_calls） */
function extractToolCallsFromContent(content: string): AgentToolCall[] {
  const text = (content || '').trim()
  if (!text) return []
  const out: AgentToolCall[] = []

  const push = (name: string, argsObj: unknown, idx: number) => {
    const n = String(name || '').trim()
    if (!TOOL_NAMES.has(n)) return
    const argumentsJson =
      typeof argsObj === 'string' ? argsObj : JSON.stringify(argsObj ?? {})
    out.push({ id: `parsed_${idx}_${n}`, name: n, arguments: argumentsJson })
  }

  // ```tool / ```json blocks
  const fenceRe = /```(?:tool|json|tools)?\s*([\s\S]*?)```/gi
  let m: RegExpExecArray | null
  let i = 0
  while ((m = fenceRe.exec(text)) != null) {
    const body = m[1].trim()
    try {
      const parsed = JSON.parse(body)
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item && typeof item === 'object') {
            const o = item as Record<string, unknown>
            push(String(o.name || o.tool || ''), o.arguments ?? o.parameters ?? o, i++)
          }
        }
      } else if (parsed && typeof parsed === 'object') {
        const o = parsed as Record<string, unknown>
        push(String(o.name || o.tool || ''), o.arguments ?? o.parameters ?? o, i++)
      }
    } catch {
      /* ignore */
    }
  }

  // XML-ish: <tool_call><name>write_file</name><arguments>{...}</arguments></tool_call>
  const xmlRe =
    /<tool_call>\s*<name>\s*([a-z_]+)\s*<\/name>\s*<arguments>\s*([\s\S]*?)\s*<\/arguments>\s*<\/tool_call>/gi
  while ((m = xmlRe.exec(text)) != null) {
    push(m[1], parseToolArguments(m[2]), i++)
  }

  // invoke write_file with ... style
  const invokeRe = /invoke\s+(list_dir|read_file|write_file|search_files|run_command)\b([\s\S]{0,8000}?)(?=invoke\s+(?:list_dir|read_file|write_file|search_files|run_command)\b|$)/gi
  while ((m = invokeRe.exec(text)) != null) {
    const name = m[1]
    const chunk = m[2]
    const args = parseToolArguments(chunk.includes('{') ? chunk.slice(chunk.indexOf('{')) : chunk)
    if (Object.keys(args).length) push(name, args, i++)
  }

  return out
}

function userLikelyWantsFileOps(messages: { role?: string; content?: unknown }[]): boolean {
  const lastUser = [...messages].reverse().find((m) => m.role === 'user')
  const text =
    typeof lastUser?.content === 'string'
      ? lastUser.content
      : JSON.stringify(lastUser?.content ?? '')
  return /写|创建|生成|保存|修改|删除|文件|目录|文件夹|写入|新建|编辑|read|write|create|save|edit|file|folder|mkdir|列出|搜索|运行|执行|command/i.test(
    text,
  )
}

export async function runAgentChatPipeline(
  win: BrowserWindow,
  provider: BaseProvider,
  data: CreateChatProps,
  lang: WebSearchLang,
): Promise<void> {
  const { messages, messageId, selectedModel } = data
  const workspace = getAgentWorkspacePath()
  if (!workspace) {
    finishText(win, messageId, agentStatus('needWorkspace', lang), true)
    return
  }

  const toolsProvider = asToolsProvider(provider)
  if (!toolsProvider) {
    finishText(win, messageId, agentStatus('unsupported', lang), true)
    return
  }

  const logLines: string[] = []
  const pushProgress = () => {
    sendChunk(win, messageId, {
      is_end: false,
      replace: true,
      result: renderProgress(lang, workspace, logLines),
    })
  }

  pushProgress()

  const openaiMsgs = await toolsProvider.toOpenAIMessages(messages)
  const loopMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: buildAgentSystem(lang, workspace, data.editorContext) },
    ...appendEditorContextToLastUser(openaiMsgs, data.editorContext, lang),
  ]

  let lastAssistantText = ''
  let hitMaxRounds = false
  let toolsExecuted = 0
  let forcedRetryDone = false
  const tools = AGENT_TOOL_DEFINITIONS as OpenAI.Chat.ChatCompletionTool[]

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    if (isChatAborted(messageId)) {
      const note = lang === 'zh' ? '已中断生成。' : 'Generation stopped.'
      finishText(
        win,
        messageId,
        (logLines.length
          ? `${renderProgress(lang, workspace, logLines)}\n\n`
          : '') + note,
      )
      return
    }

    const toolChoice: 'auto' | 'required' =
      round === 0 && userLikelyWantsFileOps(openaiMsgs) ? 'required' : 'auto'

    let result
    try {
      result = await toolsProvider.chatWithTools(loopMessages, selectedModel, tools, toolChoice)
    } catch (e) {
      if (isChatAborted(messageId)) {
        finishText(
          win,
          messageId,
          lang === 'zh' ? '已中断生成。' : 'Generation stopped.',
        )
        return
      }
      // 部分网关不支持 tool_choice=required，回退 auto
      if (toolChoice === 'required') {
        try {
          result = await toolsProvider.chatWithTools(loopMessages, selectedModel, tools, 'auto')
        } catch (e2) {
          if (isChatAborted(messageId)) {
            finishText(
              win,
              messageId,
              lang === 'zh' ? '已中断生成。' : 'Generation stopped.',
            )
            return
          }
          const msg = e2 instanceof Error ? e2.message : String(e2)
          finishText(
            win,
            messageId,
            lang === 'zh' ? `Agent 调用模型失败：${msg}` : `Agent model error: ${msg}`,
            true,
          )
          return
        }
      } else {
        const msg = e instanceof Error ? e.message : String(e)
        finishText(
          win,
          messageId,
          lang === 'zh' ? `Agent 调用模型失败：${msg}` : `Agent model error: ${msg}`,
          true,
        )
        return
      }
    }

    if (isChatAborted(messageId)) {
      finishText(
        win,
        messageId,
        (logLines.length ? `${renderProgress(lang, workspace, logLines)}\n\n` : '') +
          (lang === 'zh' ? '已中断生成。' : 'Generation stopped.'),
      )
      return
    }

    lastAssistantText = (result.content || '').trim()
    let calls = result.toolCalls.slice()
    if (!calls.length && lastAssistantText) {
      calls = extractToolCallsFromContent(lastAssistantText)
    }

    if (!calls.length) {
      // 用户要操作文件，但模型只回了文字 → 强制再试一次
      if (
        !forcedRetryDone &&
        toolsExecuted === 0 &&
        userLikelyWantsFileOps(openaiMsgs) &&
        isMeaningfulAssistantText(lastAssistantText)
      ) {
        forcedRetryDone = true
        logLines.push(`- ${agentStatus('nudge', lang)}`)
        pushProgress()
        loopMessages.push({
          role: 'assistant',
          content: lastAssistantText,
        })
        loopMessages.push({
          role: 'user',
          content:
            lang === 'zh'
              ? '你刚才没有调用任何 tool。请立刻用 write_file / read_file / list_dir 等工具真实操作工作区文件，不要只描述内容。'
              : 'You did not call any tools. Immediately use write_file / read_file / list_dir to actually operate files in the workspace. Do not only describe content.',
        })
        continue
      }
      break
    }

    if (round === MAX_TOOL_ROUNDS - 1) {
      hitMaxRounds = true
      break
    }

    loopMessages.push({
      role: 'assistant',
      content: result.content || null,
      tool_calls: calls.map((tc) => ({
        id: tc.id,
        type: 'function' as const,
        function: { name: tc.name, arguments: tc.arguments },
      })),
    })

    for (const tc of calls) {
      if (isChatAborted(messageId)) {
        finishText(
          win,
          messageId,
          `${renderProgress(lang, workspace, logLines)}\n\n` +
            (lang === 'zh' ? '已中断生成。' : 'Generation stopped.'),
        )
        return
      }
      logLines.push(`- ⏳ \`${tc.name}\``)
      pushProgress()
      const call: AgentToolCall = { id: tc.id, name: tc.name, arguments: tc.arguments }
      const toolResult = await executeAgentTool(call)
      if (isChatAborted(messageId)) {
        logLines[logLines.length - 1] = `- ⏹ \`${tc.name}\` — aborted`
        finishText(
          win,
          messageId,
          `${renderProgress(lang, workspace, logLines)}\n\n` +
            (lang === 'zh' ? '已中断生成。' : 'Generation stopped.'),
        )
        return
      }
      toolsExecuted++
      const ok = !toolResult.startsWith('Error:')
      const preview = toolResult.replace(/\s+/g, ' ').slice(0, 160)
      logLines[logLines.length - 1] = ok
        ? `- ✅ \`${tc.name}\` — ${preview}`
        : `- ❌ \`${tc.name}\` — ${preview}`
      pushProgress()
      loopMessages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: toolResult,
      })
    }
  }

  const logBlock =
    logLines.length > 0
      ? `\n\n---\n${lang === 'zh' ? '### 本机操作记录' : '### Local actions'}\n${logLines.join('\n')}\n\`${workspace}\``
      : ''

  if (isMeaningfulAssistantText(lastAssistantText)) {
    const suffix = hitMaxRounds ? `\n\n_${agentStatus('maxRounds', lang)}_` : ''
    // 若从未执行工具却在谈「已写入」，附加警告
    let warn = ''
    if (
      toolsExecuted === 0 &&
      userLikelyWantsFileOps(openaiMsgs) &&
      /已(经)?(写入|创建|保存|生成)|wrote|created|saved/i.test(lastAssistantText)
    ) {
      warn =
        lang === 'zh'
          ? '\n\n> ⚠️ 未检测到真实工具调用，文件可能并未写入磁盘。请确认模型支持 function calling，或换一个 OpenAI 兼容模型。'
          : '\n\n> ⚠️ No real tool calls detected; files may not have been written. Use a model that supports function calling.'
    }
    finishText(win, messageId, lastAssistantText + suffix + warn + logBlock)
    return
  }

  sendChunk(win, messageId, {
    is_end: false,
    replace: true,
    result: agentStatus('composing', lang) + (logLines.length ? `\n\n${logLines.join('\n')}` : ''),
  })

  const flat = flattenForStream(loopMessages, lang)
  flat.push({
    role: 'user',
    content:
      lang === 'zh'
        ? '请根据以上工具结果给出最终 Markdown 回答，并明确写出实际写入/修改的文件路径。'
        : 'Give a final Markdown answer based on the tool results, and clearly list files that were actually written/changed.',
  })

  const ok = await streamChatToWindow(
    win,
    provider,
    flat,
    selectedModel,
    messageId,
    undefined,
    lang,
  )
  if (!ok && logBlock) {
    finishText(
      win,
      messageId,
      (lang === 'zh' ? '工具已执行，但模型未返回总结。' : 'Tools ran, but the model returned no summary.') +
        logBlock,
    )
  }
}

function flattenForStream(
  msgs: OpenAI.Chat.ChatCompletionMessageParam[],
  lang: WebSearchLang,
): { role: string; content: string }[] {
  const out: { role: string; content: string }[] = []
  for (const m of msgs) {
    if (m.role === 'system') {
      out.push({ role: 'system', content: typeof m.content === 'string' ? m.content : '' })
      continue
    }
    if (m.role === 'user') {
      const c = typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
      out.push({ role: 'user', content: c })
      continue
    }
    if (m.role === 'assistant') {
      const parts: string[] = []
      if (typeof m.content === 'string' && m.content) parts.push(m.content)
      if ('tool_calls' in m && m.tool_calls?.length) {
        parts.push(
          `[tools: ${m.tool_calls.map((t) => ('function' in t ? t.function.name : 'tool')).join(', ')}]`,
        )
      }
      out.push({ role: 'assistant', content: parts.join('\n') || '(tool call)' })
      continue
    }
    if (m.role === 'tool') {
      const label = lang === 'zh' ? '工具结果' : 'Tool result'
      const c = typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
      out.push({
        role: 'user',
        content: `${label} (${m.tool_call_id}):\n${c.slice(0, 12_000)}`,
      })
    }
  }
  return out
}
