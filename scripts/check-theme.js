/**
 * 主题色自检：解析真实 token，按「这个色实际被用在哪、配什么底色」逐项验算。
 *
 * 为什么需要脚本而不是靠人眼或一次性计算：
 * 1. 本项目色值有两处来源（app.scss 的 CSS 变量 + constants/theme.ts 给 app.config 用），
 *    历史上就出现过 theme.ts 与 scss 不同值、以及页面 scss 里散写 rgba 绕过自查的情况。
 * 2. 对比度门槛取决于「字号」：同一对颜色，24px 粗体只要 3.0，13px 正常体要 4.5。
 *    所以下面每条断言都写清了它对应的样式位置，改字号必须同时改门槛。
 *
 * 用法：pnpm check:theme（失败退出码 1，可直接进 CI / pre-commit）
 */
const fs = require('fs')
const path = require('path')

const SRC = path.resolve(__dirname, '../src')

/* ---------- 解析 ---------- */
function parseTokens () {
  const scss = fs.readFileSync(path.join(SRC, 'app.scss'), 'utf8')
  const pageBlock = scss.slice(scss.indexOf('page {'), scss.indexOf('/* ---------- 布局'))
  const tokens = {}
  for (const m of pageBlock.matchAll(/--fm-([a-z-]+):\s*([^;]+);/g)) {
    tokens[m[1]] = m[2].trim()
  }
  const theme = fs.readFileSync(path.join(SRC, 'constants/theme.ts'), 'utf8')
  const cfg = {}
  for (const m of theme.matchAll(/(\w+):\s*'#([0-9a-fA-F]{6})'/g)) cfg[m[1]] = `#${m[2].toLowerCase()}`

  const meal = fs.readFileSync(path.join(SRC, 'constants/meal.ts'), 'utf8')
  const meals = {}
  const block = meal.slice(meal.indexOf('MEAL_COLOR'))
  for (const m of block.matchAll(/\[MealType\.(\w+)\]:\s*'#([0-9a-fA-F]{6})'/g)) meals[m[1]] = `#${m[2].toLowerCase()}`
  const fallback = /MEAL_COLOR\[mealType as MealType\] \?\? '#([0-9a-fA-F]{6})'/.exec(meal)
  return { tokens, cfg, meals, mealFallback: fallback ? `#${fallback[1].toLowerCase()}` : null }
}

/* ---------- 色彩数学 ---------- */
const toLin = (hex) => {
  let h = hex.replace('#', '')
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
}
const relLum = (hex) => { const [r, g, b] = toLin(hex); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
const contrast = (a, b) => { const [x, y] = [relLum(a), relLum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
const toLab = (hex) => {
  const [r, g, b] = toLin(hex)
  const X = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047
  const Y = r * 0.2126 + g * 0.7152 + b * 0.0722
  const Z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  const [fx, fy, fz] = [X, Y, Z].map(f)
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}
const deltaE = (a, b) => Math.hypot(...toLab(a).map((v, i) => v - toLab(b)[i]))
/** Viénot/Brettel 近似矩阵：模拟红盲 / 绿盲下看到的颜色 */
const MATRIX = {
  deut: [[1, 0.494207, 0], [0, 1, 0], [0, 0.249421, 1]],
  prot: [[0, 2.02344, -2.52581], [0, 1, 0], [0, 0, 1]]
}
function simulate (hex, kind) {
  const m = MATRIX[kind], [r, g, b] = toLin(hex)
  const out = [0, 1, 2].map((i) => {
    const v = m[i][0] * r + m[i][1] * g + m[i][2] * b
    const c = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055
    return Math.max(0, Math.min(255, Math.round(c * 255)))
  })
  return '#%s'.replace('%s', out.map((v) => v.toString(16).padStart(2, '0')).join(''))
}

/* ---------- 断言 ---------- */
const { tokens, cfg, meals, mealFallback } = parseTokens()
const V = (name) => {
  const v = tokens[name]
  if (!v) throw new Error(`app.scss 里找不到 --fm-${name}`)
  return v
}
const HEX = (name) => {
  const v = V(name)
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v)
  if (!m) throw new Error(`--fm-${name} 不是 hex 字面量（当前 ${v}）；若是 rgba()/渐变请改用 V() 读取`)
  const h = m[1]
  return `#${h.length === 3 ? h.split('').map((c) => c + c).join('') : h}`.toLowerCase()
}
const results = []
const fail = []
function expectContrast (label, fg, bg, need, where) {
  const got = contrast(fg, bg)
  const ok = got >= need
  results.push({ ok, label, got: `${got.toFixed(2)} / ≥${need}`, where })
  if (!ok) fail.push(`${label}：对比 ${got.toFixed(2)}，门槛 ${need}（${where}）`)
}
function expectDelta (label, a, b, need, where) {
  const got = deltaE(a, b)
  const ok = got >= need
  results.push({ ok, label, got: `ΔE ${got.toFixed(0)} / ≥${need}`, where })
  if (!ok) fail.push(`${label}：ΔE ${got.toFixed(0)}，门槛 ${need}（${where}）`)
}
function expectSame (label, a, b, where) {
  const ok = a.toLowerCase() === b.toLowerCase()
  results.push({ ok, label, got: ok ? '一致' : `${a} ≠ ${b}`, where })
  if (!ok) fail.push(`${label}：${a} 与 ${b} 不同值（${where}）`)
}

const SURFACE = HEX('surface')
const BG = HEX('bg')
const PRIMARY = HEX('primary')
const BRIGHT = HEX('primary-bright')
const WEAK = HEX('primary-weak')
const TEXT = HEX('text')
const SEC = HEX('text-secondary')
const TER = HEX('text-tertiary')
const DANGER = HEX('accent-danger')
const PANEL = HEX('hero-panel')
const ONPRIMARY = HEX('on-primary')
const heroStops = [HEX('hero-top'), HEX('hero-deep')]

/* 1) 两处来源必须同值（历史上漂移过） */
expectSame('theme.primary ↔ --fm-primary', cfg.primary, PRIMARY, 'tabBar 选中色 / 导航栏')
expectSame('theme.tabBarInactive ↔ --fm-text-tertiary', cfg.tabBarInactive, TER, 'tabBar 未选中文字')
expectSame('theme.pageBackground ↔ --fm-bg', cfg.pageBackground, BG, '页面底色 / 下拉背景')
expectSame('theme.heroTop ↔ --fm-hero 渐变起点', cfg.heroTop, (heroStops[0] || '').toLowerCase(), '登录页导航栏与头图接缝')
expectSame('餐次兜底色 ↔ --fm-text-tertiary', mealFallback, TER, 'mealColor() 未知餐次回落')

/* 2) 文字类：门槛 4.5（AA 正常字号）。字号列在 where 里，改字号要同步改门槛 */
expectContrast('CTA/FAB/区间 tab 上的白字', ONPRIMARY, PRIMARY, 4.5, '按钮 30px(design)≈15px CSS 正常字号')
if (heroStops.length >= 2) {
  expectContrast('登录页白字（渐变最浅端）', ONPRIMARY, heroStops[0].toLowerCase(), 4.5, '.login-hero 标题/说明')
  expectContrast('登录页白字（渐变最深端）', ONPRIMARY, heroStops[1].toLowerCase(), 4.5, '.login-hero 底部')
}
expectContrast('主文本 on 卡片', TEXT, SURFACE, 4.5, '.fm-card')
expectContrast('主文本 on 页面底', TEXT, BG, 4.5, '页面正文')
expectContrast('主文本 on hero 面板', TEXT, PANEL, 4.5, '.fm-hero__stat-num')
expectContrast('次级文字 on 卡片', SEC, SURFACE, 4.5, '.fm-weak / .fm-hero__label 24-25px≈12px CSS')
expectContrast('次级文字 on hero 面板', SEC, PANEL, 4.5, '.fm-hero__label / __note')
expectContrast('次级文字 on 输入底', SEC, HEX('surface-muted'), 4.5, '.fm-chip 未选中文字')
expectContrast('三级文字 on 卡片', TER, SURFACE, 4.5, '.fm-tertiary / .fm-unit 22px≈11px CSS')
expectContrast('三级文字 on hero 面板', TER, PANEL, 4.5, '.fm-hero .fm-unit')
expectContrast('三级文字 on 纯白 tabBar', TER, '#ffffff', 4.5, 'tabBar 未选中文字（系统渲染，字号固定小）')
expectContrast('danger 文字 on 卡片', DANGER, SURFACE, 4.5, '.edit-delete / 退出登录 26px≈13px CSS')
expectContrast('选中态文字（主文本色）on 浅绿底', TEXT, WEAK, 4.5, '.fm-chip--active —— 刻意不用绿字：绿字在浅绿底上只有 4.1')

/* 3) 图形类：门槛 3.0（WCAG 1.4.11 非文本对比） */
expectContrast('hero 大数字（鲜绿档）on 面板', BRIGHT, PANEL, 3.0, '.fm-hero .fm-num 76px≈38px CSS 属大文字，门槛 3.0')
expectContrast('进度条填充 on 面板', BRIGHT, PANEL, 3.0, '.fm-progress__fill')
expectContrast('选中态描边 on 浅绿底', PRIMARY, WEAK, 3.0, '.fm-chip--active 边框（图形）')
for (const [name, hex] of Object.entries(meals)) {
  expectContrast(`${name} 色点/分布条 on 卡片`, hex, SURFACE, 3.0, 'record-item 色条、meal-bar、meal-group 圆点')
}

/* 4) 内容色不得被界面色吃掉 */
for (const [name, hex] of Object.entries(meals)) {
  expectDelta(`${name} vs primary`, hex, PRIMARY, 25, '界面主色不能和分类色同族')
  expectDelta(`${name} vs primary-bright`, hex, BRIGHT, 25, '亮绿强调档同样不能撞')
}

/* 5) 四类餐次色在色觉障碍下彼此仍可分 */
const names = Object.keys(meals)
for (const kind of ['deut', 'prot']) {
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const a = simulate(meals[names[i]], kind), b = simulate(meals[names[j]], kind)
      expectDelta(`${names[i]}×${names[j]}（${kind === 'deut' ? '绿盲' : '红盲'}）`, a, b, 20, '分布条/色点仅靠颜色区分')
    }
  }
}

/* 6) 禁止页面 scss 散写色值（rgba 白色透明层除外：深色块上的既定写法） */
/** 把 CSS 注释内容替换成等长空格，保持行号不变（注释里引用旧色值是必要文档，不该算违规） */
function stripComments (text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
}
const offenders = []
for (const dir of ['pages', 'components']) {
  const base = path.join(SRC, dir)
  for (const file of fs.readdirSync(base, { recursive: true })) {
    const f = String(file)
    if (!f.endsWith('.scss')) continue
    const full = path.join(base, f)
    const lines = stripComments(fs.readFileSync(full, 'utf8')).split('\n')
    lines.forEach((line, i) => {
      if (line.trim().startsWith('//')) return
      const hits = line.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(\s*(?!255,\s*255,\s*255)\d/g) || []
      if (hits.length) offenders.push(`${path.relative(SRC, full)}:${i + 1}  ${line.trim()}`)
    })
  }
}
if (offenders.length) fail.push(`页面/组件 scss 里散写色值（应收进 app.scss 的 token）：\n      ${offenders.join('\n      ')}`)

/* ---------- 输出 ---------- */
const width = Math.max(...results.map((r) => r.label.length))
for (const r of results) {
  console.log(`${r.ok ? '  ✅' : '  ❌'} ${r.label.padEnd(width)}  ${r.got}`)
}
console.log(`\n共 ${results.length} 项断言，失败 ${fail.length} 项`)
if (fail.length) {
  console.log('\n失败明细：')
  fail.forEach((f) => console.log('  · ' + f))
  process.exit(1)
}
console.log('\n主题色自检通过。')
