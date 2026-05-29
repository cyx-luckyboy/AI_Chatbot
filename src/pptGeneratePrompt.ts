import type { PptGenLengthId, PptGenScenarioId } from './types'
import {
  buildPptFillPromptForModel,
  buildPptOutlinePromptForModel,
  pptScenarioUsesTwoStage,
} from './pptScenarioPrompts'

const LENGTH_HINT: Record<PptGenLengthId, { zh: string; en: string }> = {
  short: { zh: '约 8–12 页幻灯片', en: 'about 8–12 slides' },
  medium: { zh: '约 15–20 页幻灯片', en: 'about 15–20 slides' },
  long: { zh: '约 25–35 页幻灯片', en: 'about 25–35 slides' },
}

const FORMAT_ZH = `输出格式（必须严格遵守，程序将据此自动生成 .pptx）：
1. 可选首行：\`【主题】business\` | \`minimal\` | \`tech\` | \`campus\` | \`guofeng\`（整份配色，默认 business）
2. 第一行且仅一行：\`# 演示文稿总标题\`
3. 每一页单独一节：\`## 第 N 页：页面标题\`（N 从 1 递增）
4. 每页必须有一行 \`【版式】\`：cover | toc | section | bullets | two-column | table | flow | image-right | chart-bar | chart-pie | closing
5. 正文用 \`- \` 列出要点（每页 3–6 条，每条不超过 80 字）；封面/章节可用 \`【副标题】\`
6. 表格页用 table 版式，要点写成 \`指标名：数值\` 或 \`列1 | 列2 | 列3\`
7. 流程页用 flow 版式，3–5 个步骤要点
8. 图文页用 image-right，并写 \`【配图】\` 描述示意内容（不需真实图片 URL）
9. 数据图表页加 \`【图表】\` JSON：\`{"type":"bar","labels":["A","B"],"values":[10,20]}\`
10. 可选 \`【备注】\`；不要每页写【背景】

结构建议：封面 → 目录 → 若干 section+正文 → 数据页（如有）→ 总结/closing。`

const FORMAT_EN = `Output format (strict — builds .pptx automatically):
1. Optional: \`【主题】business\` | \`minimal\` | \`tech\` | \`campus\` | \`guofeng\`
2. Exactly one line: \`# Deck title\`
3. Each slide: \`## Slide N: title\`
4. Each slide: \`【版式】\` one of cover, toc, section, bullets, two-column, table, flow, image-right, chart-bar, chart-pie, closing
5. \`- \` bullets (3–6, under 80 chars each); \`【副标题】\` on cover/section
6. table layout: \`key：value\` or \`col1 | col2\` rows
7. flow layout: 3–5 step bullets
8. image-right: add \`【配图】\` description
9. Charts: \`【图表】\` JSON
10. Optional notes; no per-slide backgrounds`

/** 发给大模型的用户消息正文（通用场景单阶段；答辩/述职请用 outline/fill） */
export function buildPptGeneratePromptForModel(
  topicAndRequirements: string,
  length: PptGenLengthId,
  uiLang: 'zh' | 'en',
  scenario: PptGenScenarioId = 'general',
): string {
  if (pptScenarioUsesTwoStage(scenario)) {
    return buildPptOutlinePromptForModel(topicAndRequirements, length, scenario, uiLang)
  }
  const lenHint = LENGTH_HINT[length][uiLang === 'zh' ? 'zh' : 'en']
  const body = topicAndRequirements.trim()
  if (uiLang === 'zh') {
    return `你是一位专业的演示文稿策划与撰稿人。请根据「主题与要求」生成完整 PPT 方案（${lenHint}）。

若用户附带了参考资料，请充分吸收，勿编造矛盾内容。文案简洁、适合投影阅读。

${FORMAT_ZH}

要求：逻辑清晰；默认简体中文；只输出上述 Markdown，不要代码块包裹、不要 JSON 整包、不要解释过程。

---

主题与要求：

${body}`
  }
  return `You are a professional presentation strategist. Produce a complete deck (${lenHint}) from the topic below.

Use attached references faithfully if provided. Keep copy concise for slides.

${FORMAT_EN}

Output only this Markdown (no fences, no meta commentary). English unless the user asks otherwise.

---

Topic and requirements:

${body}`
}

export { buildPptOutlinePromptForModel, buildPptFillPromptForModel, pptScenarioUsesTwoStage }
