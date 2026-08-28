/**
 * 小程序入口组件。
 *
 * 职责只有一件事：启动时卡住未登录的用户。业务页面全在 pages/ 下，
 * 样式变量在 app.scss 的 page 块（设色只能改这一处 + constants/theme.ts，缺一不可）。
 *
 * 为什么登录判定不做成路由拦截器：小程序没有后端那种 Filter，
 * 可用的是 app 启动钩子与各页 useDidShow；前者盖住直接启动，
 * 后者盖住分享直达（见 utils/auth.ts 的 ensureLoggedIn）。
 */
import type { PropsWithChildren } from 'react'

import Taro, { useLaunch } from '@tarojs/taro'

import { ROUTES } from '@/constants/route'
import { hasLocalSession } from '@/utils/auth'

import './app.scss'

/**
 * 根组件。
 *
 * 只验本地有没有 token，验不了 token 有没有效：JWT 无状态，
 * 服务端 revoke / 账号被禁用（1002）都只能等请求碰壁后由 request 层处理。
 */
function App({ children }: PropsWithChildren) {
  useLaunch(() => {
    // 本地没有 token 就先卡到登录页；登录成功后由登录页 reLaunch 回启动页。
    // token 是否真的有效不在这里判断，交给 request 层的 401 处理。
    if (!hasLocalSession()) {
      Taro.reLaunch({ url: ROUTES.LOGIN }).catch((error) => {
        console.error('[app] 跳转登录页失败:', error)
      })
    }
  })

  // Taro + React 的约定：根组件不自己渲内容，把 children（当前页面）原样递出去
  return children
}

export default App
