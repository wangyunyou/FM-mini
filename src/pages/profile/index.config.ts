/**
 * 「我的」页（第三个 tabBar）的页面配置。
 *
 * 页面本体见同目录 index.tsx，负责 GET/PUT /api/user/info 与退出登录。
 * 这里没开 enablePullDownRefresh：index.tsx 里根本没用 usePullDownRefresh，
 * 开了也不会多出一个刷新入口。本页的刷新靠 useDidShow —— 每次切到该 tab
 * 先拿缓存秒开（utils/auth.ts 的 getCachedUserInfo），再拉一次网络覆盖。
 */
export default definePageConfig({
  navigationBarTitleText: '我的'
})
