/**
 * 记录编辑页的页面配置。
 *
 * 同一个页面承担「新增」与「编辑」两种形态，靠路由有没有 ?id= 区分
 * （判据见 index.tsx 的 routeId / isEdit）。
 */
export default definePageConfig({
  // 这里只是初始标题。页面在 useLoad 里会按形态改写：带 id → 「编辑记录」，
  // 不带 id → 「记一笔」。配置值写「记一笔」是为了新增（主路径）时不闪一下
  navigationBarTitleText: '记一笔'
  // 本页不开 enablePullDownRefresh：可用的数据源只有本地草稿（后端没有单条查询接口），
  // 没有可重拉的东西；而表单里的值已经全在内存 state 中，重进页反而会把用户填了一半的表单弄丢
})
