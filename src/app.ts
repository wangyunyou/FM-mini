import type { PropsWithChildren } from 'react'

import Taro, { useLaunch } from '@tarojs/taro'

import { ROUTES } from '@/constants/route'
import { hasLocalSession } from '@/utils/auth'

import './app.scss'

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

  // children 是将要渲染的页面
  return children
}

export default App
