/**
 * 打卡页（首页 / tabBar 第一项）。
 *
 * 职责：展示今日一览（总量、与本周期律的对比、按餐次分组的记录），
 * 并提供进编辑页的两个入口（右下角 + 新增、点一行改）。
 *
 * 数据来源：同一个接口 GET /api/diet/query 调用两次（今日区间 + 本周区间），
 * 后端没有“首页聚合接口”，所以这里用两个区间复用，代价是两个请求。
 *
 * 关键口径（容易改错的两处）：
 * 1. 本页「本周日均」的分母是**本周已过天数**（不是后端的有记录天数），
 *    两套口径是故意不同的，见 AGENTS.md 同步点第 5 条；
 * 2. 删除靠长按，没做行内按钮：一行已经很挤（色条 + 名称 + 副行 + 热量）。
 *
 * 状态与触发链（改本页前先对上这张表）：
 *   records / todayCalories / weekCalories / loading  ← loadData()
 *   requestSeqRef                                      → 只用于丢弃过期响应，不参与渲染
 *   触发 loadData 的三个入口：useDidShow（切 tab / 从编辑页返回 / 分享直达）、
 *   usePullDownRefresh（下拉）、handleDelete 成功后（删完重拉，不做本地删）
 *   派生值：mealGroups（纯函数，useMemo 只依 records）、weekAvg、progressPercent
 */
import { useCallback, useMemo, useRef, useState } from 'react'

import { Text, View } from '@tarojs/components'
import Taro, { useDidShow, usePullDownRefresh } from '@tarojs/taro'

import { deleteDietRecord, queryDietRecords } from '@/api/diet'
import RecordItem from '@/components/record-item'
import {
  MEAL_NAME_BY_TYPE,
  MEAL_ORDER,
  mealColor,
  mealTypeLabel
} from '@/constants/meal'
import type { DietRecordResponse } from '@/types/api'
import { ensureLoggedIn } from '@/utils/auth'
import {
  currentWeekRange,
  daysElapsedInWeek,
  formatDateLabel,
  singleDayRange,
  todayStr
} from '@/utils/date'
import { confirm, toastSuccess } from '@/utils/feedback'
import { openRecordEditor } from '@/utils/navigation'

import './index.scss'

/** 今日记录按餐次分组后的结果，只用于渲染。 */
interface MealGroup {
  /** 餐次码；未知餐次时是后端返回的原值，所以这里是 number 而不是 MealType */
  mealType: number
  /** 分组标题（中文） */
  name: string
  /** 该餐次下的记录，按接口返回原序 */
  items: DietRecordResponse[]
  /** 组内热量求和，在 useMemo 末尾统一算，不边筛边累加 */
  sum: number
}

/**
 * 今日与本周日均的对比文案，避免「超出 0 kcal」这种别扭说法。
 *
 * 三分支而不是一个模板字符串加减法：`多 -120 kcal` 这种输出要用户自己做心算，
 * 而“差”与“多”的方向已经能直接当结论读。
 */
function buildCompareText (todayCalories: number, weekAvg: number): string {
  if (weekAvg <= 0) {
    return '本周还没有记录，先记第一笔'
  }
  const diff = todayCalories - weekAvg
  if (diff === 0) {
    return '正好持平本周日均'
  }
  return diff > 0 ? `比本周日均多 ${diff} kcal` : `距本周日均还差 ${-diff} kcal`
}

export default function IndexPage() {
  // 四个 state 的初值都选「空但可渲染」（[] / 0）而不是 undefined：
  // 首屏会真渲一次（hero 上就是 0 kcal），写成 undefined 会给 JSX 埋下一堆可选判空。
  // 须区分「未加载」与「加载了但为空」，那个信息在 loading 里，不靠 state 为 undefined 表达。
  /** 今日明细（也算条数） */
  const [records, setRecords] = useState<DietRecordResponse[]>([])
  /** 今日总热量 */
  const [todayCalories, setTodayCalories] = useState(0)
  /** 本周累计热量，不是“日均”；除法在渲染前才做 */
  const [weekCalories, setWeekCalories] = useState(0)
  /** 只在首屏无数据时占“加载中…”；刷新时不清列表，避免页面白一下 */
  const [loading, setLoading] = useState(false)

  /**
   * 请求序号：只接受最后一次 loadData 的结果。
   *
   * 下拉刷新、useDidShow（切 tab / 从编辑页返回）可能并发触发两次加载，
   * 先发的那次后返回就会把旧结果盖到新结果上。
   */
  const requestSeqRef = useRef(0)

  /**
   * 拉取「今日」与「本周」两份统计：后端只有一个区间查询接口，用两个区间复用。
   *
   * 为什么用 Promise.all 而不是串行 await：两个请求无依赖，串行会把首屏时间翻倍。
   * 代价是 all 的失败传染 —— 任意一个 reject 就两个都拿不到，所以这里 catch 后
   * 把三份数据全清（宁可显示空态，不可一半新一半旧）。AGENTS.md 同步点第 9 条
   * 记录的“今日记录被清空”事故就是这条链路上发生的。
   */
  const loadData = useCallback(async () => {
    const seq = ++requestSeqRef.current
    setLoading(true)
    const dateText = todayStr()
    try {
      const [todayStats, weekStats] = await Promise.all([
        queryDietRecords(singleDayRange(dateText)),
        queryDietRecords(currentWeekRange())
      ])
      if (seq !== requestSeqRef.current) {
        return
      }
      // 后端字段可能缺失（例如新用户），全部判空后再落到 state
      setRecords(todayStats?.records ?? [])
      setTodayCalories(todayStats?.totalCalories ?? 0)
      setWeekCalories(weekStats?.totalCalories ?? 0)
    } catch (error) {
      if (seq !== requestSeqRef.current) {
        return
      }
      // request 层已经提示过，这里只清掉旧数据，避免把上一次的结果当成今日结果
      //
      // 为什么失败要清而不保留旧值：本页展示的是「今日」，旧值意味着昨日的数字，
      // 留着会比空态更容易误读（统计页反过来：那里保留旧区间是故意的）。
      console.error('[index] 加载今日数据失败:', error)
      setRecords([])
      setTodayCalories(0)
      setWeekCalories(0)
    } finally {
      // 只有当前仍然是「最新那次」才收 loading：否则会把新请求的转圈提前停掉
      if (seq === requestSeqRef.current) {
        setLoading(false)
      }
    }
  }, [])
  // 依赖数组为空是故意的：loadData 不读任何 state（全部靠参数与 ref 取当前值），
  // 写成 [records] 之类只会让 useDidShow 里拿到的引用每次渲染都变新。

  // useDidShow：每次切回本 tab、从编辑页返回、以及分享直达都会走到。
  // 不在这里刷新一遍的话，新增完回列表会看不到那条记录（列表是旧的 state）。
  useDidShow(() => {
    // 从编辑页返回时会自动刷新；未登录（如分享链接直达）则先静默登录
    void (async () => {
      if (await ensureLoggedIn()) {
        await loadData()
      }
    })()
  })

  // 下拉刷新要本页 index.config.ts 开了 enablePullDownRefresh 才会触发；
  // stopPullDownRefresh() 必须在 finally 里调，漏一次下拉动画就永远不收起
  usePullDownRefresh(() => {
    void loadData().finally(() => {
      Taro.stopPullDownRefresh()
    })
  })

  /**
   * 删一条记录（长按行触发）。
   *
   * 删完不本地删 state，而是重新 loadData()：后端是唯一数据源，
   * 本地删会让「今日总量 / 本周累计 / 条数」三个数字与列表各自说法。
   * 多一次请求换“不会出现不一致”，这笔划算。
   */
  const handleDelete = useCallback(async (record: DietRecordResponse) => {
    const confirmed = await confirm(
      '删除记录',
      `确定删除「${record.foodName ?? '这条记录'}」吗？删除后不可恢复。`,
      '删除'
    )
    if (!confirmed) {
      return
    }
    try {
      await deleteDietRecord(record.id)
      toastSuccess('已删除')
      await loadData()
    } catch (error) {
      // 403/2001 之类的提示已由 request 层给出
      console.error('[index] 删除失败:', error)
    }
  }, [loadData])

  /**
   * 按餐次分组。
   *
   * 先把预设四餐全建好桶再筛，而不是 filter 一次 push 一次：
   * 餐次顺序要稳定（早餐永远在午餐前面），空桶在末尾统一丢掉。
   * 后端将来扩餐次时，不在预设列表里的记录单独成组而不是被丢掉。
   */
  const mealGroups = useMemo<MealGroup[]>(() => {
    const knownTypes = new Set<number>(MEAL_ORDER)
    const buckets: MealGroup[] = MEAL_ORDER.map((mealType) => ({
      mealType,
      name: MEAL_NAME_BY_TYPE[mealType],
      items: records.filter((record) => record.mealType === mealType),
      sum: 0
    }))
    // 未知餐次要按各自的 mealType 分开成组：合并成一组会把后端新增的多种餐次捣到同一领“未知”里
    const unknownTypes = Array.from(
      new Set(records.filter((record) => !knownTypes.has(record.mealType)).map((record) => record.mealType))
    )
    unknownTypes.forEach((mealType) => {
      buckets.push({
        mealType,
        name: mealTypeLabel(mealType),
        items: records.filter((record) => record.mealType === mealType),
        sum: 0
      })
    })
    return buckets
      .filter((bucket) => bucket.items.length > 0)
      .map((bucket) => ({
        ...bucket,
        sum: bucket.items.reduce((acc, item) => acc + (typeof item.calories === 'number' ? item.calories : 0), 0)
      }))
  }, [records])

  /** 进度条百分比：以本周日均为 100%，封顶 100 以免溢出容器。分母为 0（本周没记录）时直接 0。 */
  const weekAvg = weekCalories > 0
    ? Math.round(weekCalories / Math.max(daysElapsedInWeek(), 1))
    : 0
  const progressPercent = weekAvg > 0
    ? Math.min(100, Math.round((todayCalories / weekAvg) * 100))
    : 0

  return (
    <View className='fm-page'>
      {/* hero：今日总量 + 进度对比 + 三个副指标，浅色面板（不用深绿渐变，理由见 AGENTS.md「样式」） */}
      <View className='fm-hero'>
        <Text className='fm-hero__label'>{formatDateLabel(todayStr())}摄入</Text>
        <View className='hero-value'>
          <Text className='fm-num'>{todayCalories}</Text>
          <Text className='fm-unit'>kcal</Text>
        </View>

        <View className='hero-compare'>
          {/* 进度条宽度只能用内联 style：它是运行期算出来的，写不进 scss。
              封顶 100% 在 progressPercent 里做，而不是交给 CSS max-width——
              fill 是百分比宽度的子元素，CSS 拦不住它溢出圆角容器 */}
          <View className='fm-progress'>
            <View className='fm-progress__fill' style={{ width: `${progressPercent}%` }} />
          </View>
          <Text className='hero-compare__text'>{buildCompareText(todayCalories, weekAvg)}</Text>
        </View>

        <View className='fm-hero__stats'>
          <View className='fm-hero__stat'>
            <Text className='fm-hero__stat-num'>{weekCalories}</Text>
            <Text className='fm-hero__stat-label'>本周累计 kcal</Text>
          </View>
          <View className='fm-hero__stat'>
            <Text className='fm-hero__stat-num'>{weekAvg}</Text>
            <Text className='fm-hero__stat-label'>本周日均 kcal</Text>
          </View>
          <View className='fm-hero__stat'>
            <Text className='fm-hero__stat-num'>{records.length}</Text>
            <Text className='fm-hero__stat-label'>今日条数</Text>
          </View>
        </View>
        {/* 首页日均口径与统计页不同：分母是本周已过天数，不是有记录天数 */}
        <Text className='fm-hero__note'>
          本周日均 = 本周累计 ÷ 本周已过 {daysElapsedInWeek()} 天
        </Text>
      </View>

      {/* 今日记录：按餐次分组，没记录时空态文案直接引导点右下角 + */}
      <View className='fm-card'>
        <View className='fm-row fm-row--between fm-section-head'>
          <Text className='fm-title'>今日记录</Text>
          <Text className='fm-tertiary'>长按可删除</Text>
        </View>

        {/* 三种互斥状态：首屏加载中 / 空态 / 列表。
            用 loading && records.length === 0 而不是只看 loading，
            否则刷新时会把已有列表整块替成“加载中…”，闪一下很难看 */}
        {loading && records.length === 0 ? (
          <View className='fm-loading'>加载中…</View>
        ) : null}

        {!loading && records.length === 0 ? (
          <View className='fm-empty'>
            <Text className='fm-empty__icon'>🍽</Text>
            <View>今天还没有记录</View>
            <View className='fm-empty__hint'>点右下角「+」记第一条</View>
          </View>
        ) : null}

        {mealGroups.map((group) => (
          <View className='meal-group' key={group.mealType}>
            <View className='meal-group__head'>
              <View className='meal-group__dot' style={{ backgroundColor: mealColor(group.mealType) }} />
              <Text className='meal-group__name'>{group.name}</Text>
              <Text className='meal-group__count'>{group.items.length} 条</Text>
              <Text className='meal-group__sum'>{group.sum} kcal</Text>
            </View>
            {group.items.map((record) => (
              <RecordItem
                key={record.id}
                record={record}
                showMeal={false}
                onTap={openRecordEditor}
                onLongPress={handleDelete}
              />
            ))}
          </View>
        ))}
      </View>

      {/* 新增入口：固定在右下角的悬浮按钮，空态文案里提的就是它 */}
      <View className='fm-fab' onClick={() => openRecordEditor()}>
        +
      </View>
    </View>
  )
}
