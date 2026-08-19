import { markdownToPlainText } from '../chat/markdownPlain'

export { markdownToPlainText }

export function speechLangFromAppLanguage(language: string | undefined): string {
  return language && language.startsWith('en') ? 'en-US' : 'zh-CN'
}
