/**
 * 登录页的页面配置。
 *
 * 它是唯一把导航栏改成深底白字的页面：登录页 hero 是一整块深绿渐变（全仓唯一），
 * 余下页面都是浅底黑字（走 app.config.ts 的 window 默认值）。
 * 本页也不开下拉刷新：未登录状态下没有任何可刷的数据源。
 */
import { THEME } from '../../constants/theme'

export default definePageConfig({
  navigationBarTitleText: '登录',
  // 与 .login-hero 渐变顶端同色，避免导航栏把头图切断留一条硬边。
  // 取深一档绿而不是亮一档：这里要叠系统白字标题，亮一档 #00ab3c 白字只有 3.05 不达标。
  navigationBarBackgroundColor: THEME.heroTop,
  navigationBarTextStyle: 'white',
  backgroundColor: THEME.heroTop
})
