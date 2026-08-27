import { THEME } from './constants/theme'

export default defineAppConfig({
  // 第一项是启动页；未登录时由 app.ts 的 useLaunch 重定向到登录页
  pages: [
    'pages/index/index',
    'pages/statistics/index',
    'pages/record-edit/index',
    'pages/login/index'
  ],
  tabBar: {
    color: THEME.tabBarInactive,
    selectedColor: THEME.primary,
    backgroundColor: '#ffffff',
    // 白色描边在白色 tabBar 上等于不可见，比黑线干净
    borderStyle: 'white',
    list: [
      {
        pagePath: 'pages/index/index',
        text: '打卡',
        iconPath: 'assets/tabbar/home.png',
        selectedIconPath: 'assets/tabbar/home-active.png'
      },
      {
        pagePath: 'pages/statistics/index',
        text: '统计',
        iconPath: 'assets/tabbar/chart.png',
        selectedIconPath: 'assets/tabbar/chart-active.png'
      }
    ]
  },
  window: {
    backgroundTextStyle: 'dark',
    navigationBarBackgroundColor: '#ffffff',
    navigationBarTitleText: 'FM 饮食记录',
    navigationBarTextStyle: 'black',
    backgroundColor: THEME.pageBackground
  }
})
