/** 页面路径常量，跳转处统一引用，避免拼错路径。与 src/app.config.ts 的 pages 保持一致。 */
export const ROUTES = {
  LOGIN: '/pages/login/index',
  HOME: '/pages/index/index',
  RECORD_EDIT: '/pages/record-edit/index',
  STATISTICS: '/pages/statistics/index',
  PROFILE: '/pages/profile/index'
} as const

/** tabBar 页面只能用 reLaunch/switchTab 进入，普通 navigateTo 会静默失败。 */
export const TAB_BAR_ROUTES: string[] = [ROUTES.HOME, ROUTES.STATISTICS, ROUTES.PROFILE]