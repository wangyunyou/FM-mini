import { THEME } from '../../constants/theme'

export default definePageConfig({
  navigationBarTitleText: '登录',
  // 与 .login-hero 渐变顶端同色，避免白色导航栏把绿色头图切断留一条硬边。
  // 色值来自 THEME.primaryBright，与 app.scss 里的 --fm-primary-bright 保持一致。
  navigationBarBackgroundColor: THEME.primaryBright,
  navigationBarTextStyle: 'white',
  backgroundColor: THEME.primaryBright
})
