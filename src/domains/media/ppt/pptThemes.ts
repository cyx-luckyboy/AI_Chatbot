/** PPT 视觉主题（矢量配色，不嵌入大图，控制文件体积） */
export type PptThemeId = 'business' | 'minimal' | 'tech' | 'campus' | 'guofeng'

export type PptTheme = {
  id: PptThemeId
  /** 正文页背景 */
  slideBg: string
  /** 封面/章节页背景 */
  heroBg: string
  /** 顶栏/装饰条 */
  accent: string
  accentLight: string
  title: string
  body: string
  muted: string
  onHero: string
  fontFace: string
}

export const PPT_THEMES: Record<PptThemeId, PptTheme> = {
  business: {
    id: 'business',
    slideBg: 'F8FAFC',
    heroBg: '1E3A5F',
    accent: '2563EB',
    accentLight: 'DBEAFE',
    title: '0F172A',
    body: '334155',
    muted: '64748B',
    onHero: 'FFFFFF',
    fontFace: 'Microsoft YaHei',
  },
  minimal: {
    id: 'minimal',
    slideBg: 'FFFFFF',
    heroBg: '18181B',
    accent: '52525B',
    accentLight: 'F4F4F5',
    title: '18181B',
    body: '3F3F46',
    muted: '71717A',
    onHero: 'FAFAFA',
    fontFace: 'Microsoft YaHei',
  },
  tech: {
    id: 'tech',
    slideBg: '0F172A',
    heroBg: '020617',
    accent: '06B6D4',
    accentLight: '164E63',
    title: 'F1F5F9',
    body: 'CBD5E1',
    muted: '94A3B8',
    onHero: 'F8FAFC',
    fontFace: 'Microsoft YaHei',
  },
  campus: {
    id: 'campus',
    slideBg: 'FFFBEB',
    heroBg: '1D4ED8',
    accent: 'F59E0B',
    accentLight: 'FEF3C7',
    title: '1E3A8A',
    body: '374151',
    muted: '6B7280',
    onHero: 'FFFFFF',
    fontFace: 'Microsoft YaHei',
  },
  guofeng: {
    id: 'guofeng',
    slideBg: 'FFF7ED',
    heroBg: '7F1D1D',
    accent: 'B45309',
    accentLight: 'FEE2E2',
    title: '451A03',
    body: '57534E',
    muted: '78716C',
    onHero: 'FFF7ED',
    fontFace: 'Microsoft YaHei',
  },
}

export function resolvePptThemeId(raw?: string | null): PptThemeId {
  const id = (raw || '').trim().toLowerCase() as PptThemeId
  if (id in PPT_THEMES) return id
  if (/商务|business/i.test(raw || '')) return 'business'
  if (/简约|minimal|简洁/i.test(raw || '')) return 'minimal'
  if (/科技|tech/i.test(raw || '')) return 'tech'
  if (/校园|campus/i.test(raw || '')) return 'campus'
  if (/国风|guofeng|中式/i.test(raw || '')) return 'guofeng'
  return 'business'
}

export function getPptTheme(id: PptThemeId): PptTheme {
  return PPT_THEMES[id]
}
