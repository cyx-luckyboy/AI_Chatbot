import type { ChatMessageProps } from '../../shared/types'

/** 发往 API 的系统提示：客户端真实时间（主进程时钟），否则模型只能靠训练知识瞎猜日期。 */
export function buildSystemClockContext(): ChatMessageProps {
  const now = new Date()
  const iso = now.toISOString()
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC'
  const zhCN = now.toLocaleString('zh-CN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: tz,
  })
  const enUS = now.toLocaleString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: tz,
    timeZoneName: 'short',
  })

  const content = [
    '以下为当前应用在用户设备（Electron 主进程）读取的本地时间与 IANA 时区。与用户讨论「今天是几号」「现在几点」「星期几」「某节日是否在今日」等与当前日历/时刻相关的内容时，必须严格以此为准，不得使用训练数据中的臆测日期（例如凭空写成 2024 年某日）。若用户时区与对方认知不一致，可简要说明你依据的是客户端时区。',
    `ISO 8601 (UTC)：${iso}`,
    `Localized (zh-CN, ${tz})：${zhCN}`,
    `Localized (en-US)：${enUS}`,
  ].join('\n')

  return { role: 'system', content }
}
