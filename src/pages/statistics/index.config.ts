/**
 * 统计页（第二个 tabBar）的页面配置。
 *
 * 页面本体见同目录 index.tsx，数据同样来自 GET /api/diet/query，
 * 只是区间换成本周 / 本月 / 近 7 天 / 自定义。
 */
export default definePageConfig({
  navigationBarTitleText: '统计',
  // 与打卡页同理：这里不开下拉刷新，页面里的 usePullDownRefresh 拿不到回调，
  // 且不报错，只表现为「下拉没反应」，所以两个文件必须一起改
  enablePullDownRefresh: true,
  backgroundTextStyle: 'dark'
})
