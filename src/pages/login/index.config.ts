/**
 * 登录页的页面配置。
 *
 * 它是唯一把导航栏改成深底白字的页面：登录页 hero 是一整块深绿渐变（全仓唯一），
 * 余下页面都是浅底黑字（走 app.config.ts 的 window 默认值）。
 * 本页也不开下拉刷新：未登录状态下没有任何可刷的数据源。
 */
import { THEME } from '../../constants/theme'

export default definePageConfig({
  navigationBarTitleText: '欢迎登录',
  navigationBarBackgroundColor: '#ffffff',
  navigationBarTextStyle: 'black',
  backgroundColor: THEME.pageBackground
})
