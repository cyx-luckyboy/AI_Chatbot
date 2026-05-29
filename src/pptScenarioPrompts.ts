import type { PptGenLengthId, PptGenScenarioId } from './types'

const LENGTH_HINT: Record<PptGenLengthId, { zh: string; en: string }> = {
  short: { zh: '约 10–14 页', en: 'about 10–14 slides' },
  medium: { zh: '约 16–22 页', en: 'about 16–22 slides' },
  long: { zh: '约 24–32 页', en: 'about 24–32 slides' },
}

const FORMAT_RULES_ZH = `格式规则：
1. 可选 \`【主题】business\` | \`minimal\` | \`tech\` | \`campus\` | \`guofeng\`
2. 仅一行 \`# 演示文稿总标题\`（用正式全称，勿用「演示文稿」占位）
3. 每页 \`## 第 N 页：标题\` + \`【版式】\` + 要点（\`- \` 列表，每页 3–6 条，每条 ≤80 字）
4. 版式：cover | toc | section | bullets | two-column | table | flow | image-right | chart-bar | chart-pie | closing
5. 数据用 table 或【图表】JSON；流程用 flow；示意图用 image-right +【配图】
6. 可选【备注】演讲词；不要【背景】`

const FORMAT_RULES_EN = `Format: optional Theme line; one # title; ## Slide N + Layout + bullets; layouts as in Chinese spec; optional notes.`

const THESIS_OUTLINE_ZH = `你正在规划「学位论文答辩」PPT 骨架（${'{len}'}）。必须覆盖下列章节（可合并相邻节但顺序不变）：
1. 封面 cover — 论文题目、答辩人、导师、学院
2. 目录 toc
3. 研究背景与意义 section + bullets
4. 国内外研究现状 bullets 或 two-column
5. 研究内容与技术路线 flow 或 image-right
6. 核心方法/模型设计 section + bullets（可含 image-right）
7. 实验环境与数据集 bullets
8. 实验结果与分析 table 或 chart-bar（有数据时写【图表】JSON）
9. 消融/对比实验 table 或 bullets（如有）
10. 创新点与贡献 bullets
11. 不足与展望 bullets
12. 总结 section + closing

建议主题配色：campus 或 business。`

const THESIS_OUTLINE_EN = `Plan a thesis defense deck (${'{len}'}). Cover: background, related work, methods, experiments, results, contributions, limitations, conclusion, Q&A. Use campus or business theme.`

const WORK_OUTLINE_ZH = `你正在规划「工作总结 / 述职汇报」PPT 骨架（${'{len}'}）。建议结构：
1. 封面 cover — 汇报主题、汇报人、部门、周期
2. 目录 toc
3. 工作概述 section + bullets（目标与范围）
4. 核心成果 bullets 或 two-column（分条列成果）
5. 关键数据与指标 table 或 chart-bar
6. 重点项目进展 flow 或 bullets（可按项目分 section）
7. 问题与改进 bullets
8. 下阶段计划 bullets
9. 总结与致谢 closing

建议主题：business 或 tech。`

const WORK_OUTLINE_EN = `Plan a work summary deck (${'{len}'}). Cover, agenda, overview, achievements, metrics, projects, issues, next steps, closing. Theme: business or tech.`

const OUTLINE_OUTPUT_ZH = `本步只输出「骨架」Markdown：
- 必须有 # 总标题
- 每页仅：标题、【版式】、1–2 条极短要点（每页不超过 20 字/条，占位即可）
- 不要展开长段落、不要【备注】、不要【图表】详细数据
- 不要代码块包裹`

const OUTLINE_OUTPUT_EN = `Output skeleton Markdown only: # title; per slide title + layout + 1–2 short placeholder bullets. No long text, no notes, no charts yet.`

const FILL_OUTPUT_ZH = `本步根据下方「已确认骨架」撰写完整 PPT 正文：
- 保持骨架的页序、页标题、【版式】不变（可微调措辞）
- 每页 3–6 条完整要点，符合答辩/述职口语化、专业、简洁
- 实验/业务数据页补充 table 或【图表】；方法页可用 flow
- 封面写【副标题】含答辩人/导师或部门/周期
- 只输出最终 Markdown，不要解释`

const FILL_OUTPUT_EN = `Expand the outline below into full slide Markdown. Keep slide order and layouts. 3–6 bullets per slide. Add charts/tables where needed. Output Markdown only.`

function lenHint(length: PptGenLengthId, lang: 'zh' | 'en') {
  return LENGTH_HINT[length][lang === 'zh' ? 'zh' : 'en']
}

function scenarioOutlineGuide(scenario: PptGenScenarioId, lang: 'zh' | 'en', length: PptGenLengthId): string {
  const len = lenHint(length, lang)
  if (scenario === 'thesis') {
    return (lang === 'zh' ? THESIS_OUTLINE_ZH : THESIS_OUTLINE_EN).replace('{len}', len)
  }
  if (scenario === 'work-summary') {
    return (lang === 'zh' ? WORK_OUTLINE_ZH : WORK_OUTLINE_EN).replace('{len}', len)
  }
  return lang === 'zh'
    ? `按专业演示结构规划 ${len}（封面→目录→正文→总结）。`
    : `Plan a professional deck (${len}): cover, agenda, body, closing.`
}

function scenarioThemeHint(scenario: PptGenScenarioId, lang: 'zh' | 'en'): string {
  if (scenario === 'thesis') {
    return lang === 'zh' ? '推荐首行【主题】campus' : 'Prefer 【主题】campus'
  }
  if (scenario === 'work-summary') {
    return lang === 'zh' ? '推荐首行【主题】business' : 'Prefer 【主题】business'
  }
  return ''
}

/** 第一阶段：仅生成页序 + 版式 + 短要点 */
export function buildPptOutlinePromptForModel(
  topicAndRequirements: string,
  length: PptGenLengthId,
  scenario: PptGenScenarioId,
  uiLang: 'zh' | 'en',
): string {
  const body = topicAndRequirements.trim()
  const guide = scenarioOutlineGuide(scenario, uiLang, length)
  const themeHint = scenarioThemeHint(scenario, uiLang)
  if (uiLang === 'zh') {
    return `你是演示文稿结构策划专家。${guide}
${themeHint ? `${themeHint}\n` : ''}
${OUTLINE_OUTPUT_ZH}

${FORMAT_RULES_ZH}

---

主题与要求：

${body}`
  }
  return `You are a presentation architect. ${guide}
${OUTLINE_OUTPUT_EN}

${FORMAT_RULES_EN}

---

Topic and requirements:

${body}`
}

/** 第二阶段：在骨架基础上填满内容 */
export function buildPptFillPromptForModel(
  topicAndRequirements: string,
  outlineMarkdown: string,
  length: PptGenLengthId,
  scenario: PptGenScenarioId,
  uiLang: 'zh' | 'en',
): string {
  const body = topicAndRequirements.trim()
  const outline = outlineMarkdown.trim()
  const scenarioLabel =
    scenario === 'thesis'
      ? uiLang === 'zh'
        ? '论文答辩'
        : 'thesis defense'
      : scenario === 'work-summary'
        ? uiLang === 'zh'
          ? '工作总结'
          : 'work summary'
        : uiLang === 'zh'
          ? '演示'
          : 'presentation'

  if (uiLang === 'zh') {
    return `你是${scenarioLabel} PPT 撰稿人。${FILL_OUTPUT_ZH}
篇幅参考：${lenHint(length, 'zh')}。

${FORMAT_RULES_ZH}

---

用户原始主题与要求：

${body}

---

已确认骨架（请保持结构）：

${outline}`
  }
  return `You are a ${scenarioLabel} slide writer. ${FILL_OUTPUT_EN}
Target length: ${lenHint(length, 'en')}.

${FORMAT_RULES_EN}

---

User topic:

${body}

---

Approved outline:

${outline}`
}

export function pptScenarioUsesTwoStage(scenario: PptGenScenarioId): boolean {
  return scenario === 'thesis' || scenario === 'work-summary'
}
