import dayjs from 'dayjs'

/** 界面展示用：ISO 等时间串 → 本地易读形式 */
export function formatDateTime(value: string | Date | undefined | null): string {
  if (value == null || value === '') return ''
  const d = dayjs(value)
  if (!d.isValid()) return String(value)
  return d.format('YYYY-MM-DD HH:mm:ss')
}
