/**
 * 主题色常量。
 *
 * 小程序的 app.config / 页面 config 不支持 CSS 变量，导航栏与 tabBar 的颜色只能写十六进制字面量。
 * 所以本文件是「配置侧」的单一来源，「样式侧」的单一来源是 src/app.scss 里 page 块的 --fm-* 变量。
 * 改主题时这两处必须一起改并保持同值，否则导航栏与页面内容会露出色差。
 *
 * 2026-08-28 随「界面退到松烟墨」一并调整：
 * - primary #1f6f54 → #14524b（色相推到 169°，与餐次色不再同族）
 * - primaryBright #2f8f6c → #1c6f5c（旧值与「午餐」分类色是同一个 hex）
 * - tabBarInactive #9ba5a0 → #697a74（旧值白底对比只有 2.54，未选中 tab 文字不达标）
 */
export const THEME = {
  /** 与 app.scss 的 --fm-primary 同值：tabBar 选中态 */
  primary: '#14524b',
  /** 与 app.scss 的 --fm-primary-bright 同值：登录页导航栏取渐变起点色，才能与头图无缝相接 */
  primaryBright: '#1c6f5c',
  /** 与 app.scss 的 --fm-text-tertiary 同值：tabBar 未选中文字（对比 4.53，过 AA） */
  tabBarInactive: '#697a74',
  /** 与 app.scss 的 --fm-bg 同值：页面底色与下拉背景 */
  pageBackground: '#f2f5f4'
} as const
