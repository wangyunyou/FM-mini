/**
 * 页面路径常量，跳转处统一引用，避免拼错路径。与 src/app.config.ts 的 pages 保持一致。
 *
 * 约定：跳转 url 一律带前导 `/`（小程序语义上表示从应用根目录起的路径）。
 * 集中收在一处而不是各页字面量，是因为 app.config.ts 里的 pages 不带 `/`：
 * 两边写两遍必错一边，这里至少只有一处需要改。
 */
export const ROUTES = {
  /** 登录页（非 tab，仅 reLaunch 进入） */
  LOGIN: '/pages/login/index',
  /** 打卡页 = tabBar 第一项 = 启动页 */
  HOME: '/pages/index/index',
  /** 记录编辑页（非 tab）；带 ?id= 则为编辑态，见 pages/record-edit/index.tsx */
  RECORD_EDIT: '/pages/record-edit/index',
  STATISTICS: '/pages/statistics/index',
  PROFILE: '/pages/profile/index'
} as const

/**
 * tabBar 页面只能用 reLaunch/switchTab 进入，普通 navigateTo 会静默失败。
 *
 * 这张表存在的意义：把“为什么点了没反应”从运行期偶发变成可以查阅的约束。
 * 改 app.config.ts 的 tabBar.list 时必须同步改这里（漏一项就是坑下一个人的入口）。
 */
export const TAB_BAR_ROUTES: string[] = [ROUTES.HOME, ROUTES.STATISTICS, ROUTES.PROFILE]