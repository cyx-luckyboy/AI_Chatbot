/** 用户未进入「生成图片」模式但文案明显在要出图时，可自动走绘图 API */
export function looksLikeImageGenerationPrompt(text: string): boolean {
  const s = text.trim()
  if (!s || s.length > 200) return false
  return (
    /(?:生成|画|绘制|做|出|来一?张?).{0,48}(?:图|图片|插画|海报|头像|壁纸|封面)/u.test(s) ||
    /(?:图|图片|插画).{0,12}(?:生成|绘画|绘制)/u.test(s) ||
    /^(?:帮我|请)?(?:画|绘).{2,40}$/u.test(s)
  )
}
