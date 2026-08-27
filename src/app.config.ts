export default defineAppConfig({
  // 第一项是启动页；未登录时由 app.ts 的 useLaunch 重定向到登录页
  pages: [
    'pages/index/index',
    'pages/statistics/index',
    'pages/record-edit/index',
    'pages/login/index'
  ],
  // 只用文字 tabBar，不依赖图标资源；后续接入设计稿再补 iconPath
  tabBar: {
    color: '#8a8f99',
    selectedColor: '#2f7d5e',
    backgroundColor: '#ffffff',
    borderStyle: 'black',
    list: [
      { pagePath: 'pages/index/index', text: '打卡' },
      { pagePath: 'pages/statistics/index', text: '统计' }
    ]
  },
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#ffffff',
    navigationBarTitleText: 'FM 饮食记录',
    navigationBarTextStyle: 'black',
    backgroundColor: '#f5f6f8'
  }
})
