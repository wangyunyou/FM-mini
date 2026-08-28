/**
 * 打卡页（首页 / 第一个 tabBar）的页面配置。
 *
 * 页面本体见同目录 index.tsx，数据来自 GET /api/diet/query（今日 + 本周两次查询）。
 */
export default definePageConfig({
  navigationBarTitleText: '打卡',
  // 必须在这里开，index.tsx 的 usePullDownRefresh 才拿得到回调；
  // 少了这行不会报错，只会表现为“下拉没反应”，所以两个文件要一起看
  enablePullDownRefresh: true,
  // 下拉时三条点的颜色：本页是浅底，用 dark
  backgroundTextStyle: 'dark'
})
