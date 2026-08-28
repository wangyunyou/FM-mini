import { THEME } from '../../constants/theme'

export default definePageConfig({
  navigationBarTitleText: '登录',
  // 与 .login-hero 渐变顶端同色，避免导航栏把头图切断留一条硬边。
  // 取深一档绿而不是亮一档：这里要叠系统白字标题，亮一档 #00ab3c 白字只有 3.05 不达标。
  navigationBarBackgroundColor: THEME.heroTop,
  navigationBarTextStyle: 'white',
  backgroundColor: THEME.heroTop
})
