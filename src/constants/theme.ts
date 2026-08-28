/**
 * 主题色常量。
 *
 * 小程序的 app.config / 页面 config 不支持 CSS 变量，导航栏与 tabBar 的颜色只能写十六进制字面量。
 * 所以本文件是「配置侧」的单一来源，「样式侧」的单一来源是 src/app.scss 里 page 块的 --fm-* 变量。
 * 改主题时这两处必须一起改并保持同值，否则导航栏与页面内容会露出色差。
 *
 * 2026-08-28 第二版（参照薄荷健康 / Keep / 知乎 / MyFitnessPal 等的实际用色）：
 * - primary 走「深一档绿 #00873c」：tabBar 选中、导航栏这类**叠白字或小字**的位置，
 *   白字对比 4.63 过 AA。亮一档 #00ab3c 只有 3.05，只能用于图形，不进这里。
 * - tabBarInactive #66736d（旧 #9ba5a0 只有 2.54，未选中 tab 文字不达标）
 * - heroTop 与 .login-hero 渐变顶端同值，导航栏与头图之间不留缝
 */
export const THEME = {
  /** 与 app.scss 的 --fm-primary 同值：tabBar 选中态、导航栏 */
  primary: '#00873c',
  /** 与 app.scss 的 --fm-hero 渐变起点同值：登录页导航栏取它，才能与头图无缝相接 */
  heroTop: '#00873c',
  /** 与 app.scss 的 --fm-text-tertiary 同值：tabBar 未选中文字（对比 5.24，过 AA） */
  tabBarInactive: '#636f69',
  /** 与 app.scss 的 --fm-bg 同值：页面底色与下拉背景 */
  pageBackground: '#f4f7f5'
} as const
