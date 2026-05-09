/** 将 Markdown 转为适合复制/朗读的纯文本（非完整解析，够用即可） */
export function markdownToPlainText(md: string): string {
  let s = md.replace(/\r\n/g, '\n')
  s = s.replace(/```[\s\S]*?```/g, '\n')
  s = s.replace(/`([^`]+)`/g, '$1')
  s = s.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  s = s.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
  s = s.replace(/^#{1,6}\s+/gm, '')
  s = s.replace(/^\s*[-*+]\s+/gm, '• ')
  s = s.replace(/\*\*([^*]+)\*\*/g, '$1')
  s = s.replace(/\*([^*]+)\*/g, '$1')
  s = s.replace(/__([^_]+)__/g, '$1')
  s = s.replace(/_([^_]+)_/g, '$1')
  s = s.replace(/\n{3,}/g, '\n\n')
  s = s.replace(/[ \t\f\v]+/g, ' ')
  return s.trim()
}
