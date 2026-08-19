import type { SummarySection } from '../../shared/types'

export function formatSummaryAsText(
  title: string,
  overview?: string,
  sections?: SummarySection[],
): string {
  const lines: string[] = [title.trim()]
  if (overview?.trim()) {
    lines.push('', overview.trim())
  }
  for (const sec of sections ?? []) {
    if (!sec.heading?.trim()) continue
    lines.push('', sec.heading.trim())
    for (const b of sec.bullets ?? []) {
      if (b.trim()) lines.push(`· ${b.trim()}`)
    }
  }
  return lines.join('\n').trim()
}
