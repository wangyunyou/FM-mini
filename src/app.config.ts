/**
 * 小程序全局配置（编译时由 Taro 转成 app.json，不是运行时代码）。
 *
 * 三件事在这里定死：页面清单与启动页、tabBar、窗口默认样式。
 *
 * ⚠️ 色值为什么写不进 CSS 变量：本文件与各页的 index.config.ts 都是**编译期**产物，
 * 微信在渲染原生导航栏 / tabBar 时拿不到 app.scss 里的 `--fm-*`，只能写 literal hex。
 * 所以设色有两个必须同步的来源（AGENTS.md「样式」）：
 *   1. src/app.scss 的 page 块    —— 页面内容侧
 *   2. src/constants/theme.ts    —— 本文件这类配置侧
 * 两边不一致会露出色差，由 `pnpm check:theme` 卡着。
 */
import { THEME } from './constants/theme'

export default defineAppConfig({
  // 第一项是启动页；未登录时由 app.ts 的 useLaunch 重定向到登录页。
  // 登录页放在最后而不是最前：它是被 reLaunch 进去的，不该占启动位。
  // 这里的顺序还同时决定了 tabBar 页的左右位置（与下面 list 一致：打卡 / 统计 / 我的）
  pages: [
    'pages/index/index',
    'pages/statistics/index',
    'pages/record-edit/index',
    'pages/profile/index',
    'pages/login/index'
  ],
  // tabBar 只能有 3 个入口（微信限 2~5）；record-edit 与 login 不是 tab，
  // 所以它们只能用 navigateTo / reLaunch 进入（见 constants/route.ts 的 TAB_BAR_ROUTES）
  tabBar: {
    // 未选中 / 选中色从 theme.ts 取，改主题时不会出现“页面变绿了 tabBar 还是旧色”
    color: THEME.tabBarInactive,
    selectedColor: THEME.primary,
    backgroundColor: '#ffffff',
    // 白色描边在白色 tabBar 上等于不可见，比黑线干净
    borderStyle: 'white',
    list: [
      {
        pagePath: 'pages/index/index',
        text: '打卡',
        // 图标是普通 PNG，走的是文件路径而不是字体，所以必须同时备常/选中两套
        iconPath: 'assets/tabbar/home.png',
        selectedIconPath: 'assets/tabbar/home-active.png'
      },
      {
        pagePath: 'pages/statistics/index',
        text: '统计',
        iconPath: 'assets/tabbar/chart.png',
        selectedIconPath: 'assets/tabbar/chart-active.png'
      },
      {
        pagePath: 'pages/profile/index',
        text: '我的',
        iconPath: 'assets/tabbar/profile.png',
        selectedIconPath: 'assets/tabbar/profile-active.png'
      }
    ]
  },
  // window 是全局默认值，各页 index.config.ts 可单页覆盖
  // （登录页把导航标改成深绿配白字，见 pages/login/index.config.ts）
  window: {
    backgroundTextStyle: 'dark',
    navigationBarBackgroundColor: '#ffffff',
    navigationBarTitleText: 'FM 饮食记录',
    navigationBarTextStyle: 'black',
    backgroundColor: THEME.pageBackground
  }
})
