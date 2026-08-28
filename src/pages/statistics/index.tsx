/**
 * 统计页（tabBar 第二项）。
 *
 * 职责：按区间看总量、日均、餐次分布与记录明细。
 * 数据来源仍是 GET /api/diet/query 这一个接口（无分页），区间由本页四个 tab 决定。
 *
 * 本页是「区间」这件事上约束最多的地方，改动前先读三条：
 * 1. 日均口径与首页不同：这里用后端的 avgCaloriesPerDay，分母是**有记录的天数**
 *    （见 AGENTS.md 同步点第 5 条，别去“统一”它）；
 * 2. 跨度上限 MAX_QUERY_RANGE_DAYS 天，Picker 的 start 按结束日期倒推这个下界，
 *    提交前还有一道 dayCount 兜底；
 * 3. tab 高亮、表头日期、内容数据三者必须同步：靠 commitRange 成对提交，
 *    请求失败时 tab 不切（见 applyRange）。
 *
 * 状态与触发链（改本页前先分清三组“日期”）：
 *   rangeKey        → 当前高亮的 tab（只在请求成功后变）
 *   startDate/endDate → 自定义表单里**输入中**的值，不代表已生效
 *   activeRange(+Ref) → **已生效**的区间：前者给渲染、后者给生命周期钩子
 *   stats / loading  ← loadStats(range)
 *   触发 loadStats 的四个入口：tab 点击、 「查询该区间」按钮、useDidShow、下拉刷新
 *   派生值：minStart（useMemo，按 endDate 倒推）与渲染前的 records/totalCalories/caloriesByMeal/groups
 */
import { useCallback, useMemo, useRef, useState } from 'react'

import { Picker, Text, View } from '@tarojs/components'
import Taro, { useDidShow, usePullDownRefresh } from '@tarojs/taro'

import { queryDietRecords } from '@/api/diet'
import RecordItem from '@/components/record-item'
import { MEAL_NAME_BY_TYPE, MEAL_ORDER, mealColor } from '@/constants/meal'
import { DATE_MIN, MAX_QUERY_RANGE_DAYS } from '@/constants/validation'
import type { DietStatisticsResponse } from '@/types/api'
import { ensureLoggedIn } from '@/utils/auth'
import {
  currentMonthRange,
  currentWeekRange,
  dayCount,
  formatDateLabel,
  todayStr,
  groupByRecordDate,
  isValidRange,
  recentDaysRange,
  shiftDate,
  type DateRange
} from '@/utils/date'
import { toast } from '@/utils/feedback'

import './index.scss'

/**
 * 当前选中的区间 tab。
 *
 * 四个里只有 custom 带表单；'week' | 'month' | 'recent7' 都能由今天现算，
 * 所以它们不需要存在 state 里——activeRange 已经是它们的生效结果。
 */
type RangeKey = 'week' | 'month' | 'recent7' | 'custom'

/** tabBar 下的四个区间选项，顺决定页面顶部从左到右的展示顺序。 */
const RANGE_TABS: Array<{ key: RangeKey; label: string }> = [
  { key: 'week', label: '本周' },
  { key: 'month', label: '本月' },
  { key: 'recent7', label: '近 7 天' },
  { key: 'custom', label: '自定义' }
]

/** 自定义区间的初始值，避免首次进来是空表单。 */
const INITIAL_CUSTOM_RANGE = recentDaysRange(7)

/** 预设区间：把 key 与 DateRange 的对应关系收在一处。 */
const PRESET_RANGES: Record<Exclude<RangeKey, 'custom'>, () => DateRange> = {
  week: currentWeekRange,
  month: currentMonthRange,
  recent7: () => recentDaysRange(7)
}

export default function StatisticsPage() {
  /** 当前选中的 tab（只在请求成功后才切，见 applyRange） */
  const [rangeKey, setRangeKey] = useState<RangeKey>('week')
  /**
   * 自定义区间的两个输入框当前值（草稿性质，不代表已生效）。
   *
   * 为什么要单独一组 state：自定义表单允许用户先把两个日期都挑完再点「查询」，
   * 所以“输入中的区间”（startDate/endDate）与“已生效的区间”（activeRange）必须分开；
   * 合成一份的话，表头会在用户还没提交时就跟着输入框跑。
   */
  const [startDate, setStartDate] = useState(INITIAL_CUSTOM_RANGE.startDate)
  const [endDate, setEndDate] = useState(INITIAL_CUSTOM_RANGE.endDate)
  /** 当前生效区间的接口响应；null = 还没拉到或拉失败了 */
  const [stats, setStats] = useState<DietStatisticsResponse | null>(null)
  const [loading, setLoading] = useState(false)

  /**
   * 当前生效的区间（渲染用）。
   *
   * 为什么是 state 而不是只留 ref：以前表头那行日期与「区间天数」读的是
   * activeRangeRef.current，而 ref 只在请求**成功**后才更新，
   * 于是切 tab 后请求失败时会出现「表头是新区间、内容却是空/旧数据」的错位。
   * 现在区间与数据由 commitRange 成对提交，两者不可能各说一套。
   */
  const [activeRange, setActiveRange] = useState<DateRange>(currentWeekRange)

  /**
   * 生命周期钩子用的区间镜像。
   *
   * Taro 的 useDidShow / usePullDownRefresh 只在挂载时注册一次，
   * 闭包里的 state 会是旧值，回到页面刷新时就会查到错误的区间，所以读 ref。
   */
  const activeRangeRef = useRef<DateRange>(activeRange)

  /**
   * 请求序号：只接受最后一次请求的结果。
   *
   * 区间 tab 连点、或下拉刷新与 useDidShow 撞在一起时，两个请求会并发；
   * 先发的后返回就会把新数据盖回旧区间的结果（实测过这种"新头旧身体"）。
   */
  const requestSeqRef = useRef(0)

  /**
   * 把区间同时写进 ref 与 state。
   *
   * 两者必须成对提交：ref 给生命周期钩子用，state 给渲染用。
   * 只改一个就会出现“表头新区间、内容旧数据”或反之。
   */
  const commitRange = useCallback((range: DateRange) => {
    activeRangeRef.current = range
    setActiveRange(range)
  }, [])

  /** @returns 是否加载成功（被更新的请求抢占时也算 false，调用方不该再动 tab） */
  const loadStats = useCallback(async (range: DateRange): Promise<boolean> => {
    const seq = ++requestSeqRef.current
    setLoading(true)
    try {
      const data = await queryDietRecords(range)
      if (seq !== requestSeqRef.current) {
        return false
      }
      setStats(data ?? null)
      commitRange(range)
      return true
    } catch (error) {
      if (seq !== requestSeqRef.current) {
        return false
      }
      // 失败提示已由 request 层给出；区间保持不动，这样表头与"暂无数据"说的是同一段时间
      console.error('[statistics] 加载统计失败:', error)
      setStats(null)
      return false
    } finally {
      if (seq === requestSeqRef.current) {
        setLoading(false)
      }
    }
  }, [commitRange])

  /**
   * 应用一个区间：请求成功才把高亮 tab 切过去。
   *
   * 为什么不在点击时就 setRangeKey：区间与数据必须同步展示，
   * 否则请求失败时会出现「tab 高亮在本周、下面还是上次的月度数据」这种自相矛盾的画面。
   * 这里不做乐观更新是有意的：本页的 tab 本质上是「你正在看哪段时间」的表头，
   * 而不只是一个待完成的操作。
   *
   * @param key 准备高亮的 tab（与 range 成对传入，不允许“查 A 区间却亮 B tab”）
   */
  async function applyRange(key: RangeKey, range: DateRange) {
    const ok = await loadStats(range)
    if (ok) {
      setRangeKey(key)
    }
  }

  /**
   * 开始日期可选下界：不早于 DATE_MIN，且不早于「结束日期往前推 MAX_QUERY_RANGE_DAYS-1 天」。
   *
   * 为什么按结束日期倒推而不是写死：后端接口无分页，跨度超过 366 天会返回 2003
   * （见 DietRecordServiceImpl.MAX_QUERY_RANGE_DAYS）。在 Picker 上就挡住，
   * 用户选不出注定被拒的区间，也不用等一次网络往返再吃错误提示。
   */
  const minStart = useMemo(() => {
    const bySpan = shiftDate(endDate, -(MAX_QUERY_RANGE_DAYS - 1))
    return bySpan > DATE_MIN ? bySpan : DATE_MIN
  }, [endDate])

  /** tab 切换与「查询该区间」按钮的唯一入口。 */
  function handleTabChange(key: RangeKey) {
    if (key !== 'custom') {
      void applyRange(key, PRESET_RANGES[key]())
      return
    }
    const custom = { startDate, endDate }
    // 后端对 startDate 晚于 endDate 返回 2002，先在本地挡掉
    if (!isValidRange(custom)) {
      toast('开始日期不能晚于结束日期')
      return
    }
    // 兜底：Picker 的 start 已经挡过，这里防的是「先选好区间、再把结束日期往后拖」
    if (dayCount(custom) > MAX_QUERY_RANGE_DAYS) {
      toast(`一次最多查 ${MAX_QUERY_RANGE_DAYS} 天，请缩短区间`)
      return
    }
    void applyRange('custom', custom)
  }

  useDidShow(() => {
    void (async () => {
      if (await ensureLoggedIn()) {
        await loadStats(activeRangeRef.current)
      }
    })()
  })

  // 下拉刷新同样只读 ref：这个回调只在挂载时注册一次，直接读 state 会拿到首帧的区间
  usePullDownRefresh(() => {
    void loadStats(activeRangeRef.current).finally(() => {
      Taro.stopPullDownRefresh()
    })
  })

  /**
   * 派生值统一收在渲染前算，而不是塞进 JSX。
   *
   * 原因很实际：JSX 里写 `{(stats?.xx ?? 0) + …}` 没人愿意读第二遍；
   * 而且这几个值全要判空（后端异常响应体可能缺字段）。
   */
  const records = stats?.records ?? []
  const totalCalories = stats?.totalCalories ?? 0
  const caloriesByMeal = stats?.caloriesByMeal ?? {}
  // 按天分组是本页唯一的算法，实现与为什么用 Map 见 utils/date.ts 的 groupByRecordDate
  const groups = groupByRecordDate(records)

  return (
    <View className='fm-page'>
      {/* 区间 tab：选中态看 rangeKey，而它只在请求成功后才变（见 applyRange），
          所以不会出现“高亮已切、数据还是旧区间” */}
      <View className='range-tabs'>
        {RANGE_TABS.map((tab) => (
          <View
            key={tab.key}
            className={`range-tabs__item${rangeKey === tab.key ? ' range-tabs__item--active' : ''}`}
            onClick={() => handleTabChange(tab.key)}
          >
            {tab.label}
          </View>
        ))}
      </View>

      {/* 自定义表单只在 custom 处于选中态时展开。注意一个连带的时序：
          rangeKey 在请求成功后才变 custom，所以「点自定义」同一次就发一次查询，
          查失败时 tab 不切、表单也不弹出来（近 7 天几乎不会失败，所以不碍事，
          但断网时这个 tab 会看起来“点了没反应”，改这里的人值得知道） */}
      {rangeKey === 'custom' ? (
        <View className='fm-card custom-range'>
          <View className='custom-range__row'>
            <Picker
              className='custom-range__picker'
              // start 按结束日期倒推 MAX_QUERY_RANGE_DAYS（理由见 minStart）；
              // end 锁到当前 endDate，两个 Picker 互夹，选不出反区间
              end={endDate}
              mode='date'
              start={minStart}
              value={startDate}
              onChange={(event) => setStartDate(event.detail.value)}
            >
              <Text className='fm-field__label'>开始日期</Text>
              <Text className='custom-range__value'>{startDate}</Text>
            </Picker>
            <Text className='custom-range__sep'>至</Text>
            <Picker
              className='custom-range__picker'
              end={todayStr()}
              mode='date'
              start={startDate}
              value={endDate}
              onChange={(event) => setEndDate(event.detail.value)}
            >
              <Text className='fm-field__label'>结束日期</Text>
              <Text className='custom-range__value'>{endDate}</Text>
            </Picker>
          </View>
          <View
            className='fm-btn fm-btn--primary custom-range__apply'
            // 复用 tab 的同一个入口：手改日期与点 tab 的后端行为完全一致，
            // 写两个函数就会有一处漏掉 dayCount 兜底
            onClick={() => handleTabChange('custom')}
          >
            查询该区间
          </View>
        </View>
      ) : null}

      <View className='fm-hero'>
        {/* 表头日期读 activeRange（已生效的区间），而不是 startDate/endDate 输入框的值 */}
        <Text className='fm-hero__label'>
          {activeRange.startDate} 至 {activeRange.endDate}
        </Text>
        <View className='stat-hero-value'>
          <Text className='fm-num'>{totalCalories}</Text>
          <Text className='fm-unit'>kcal</Text>
        </View>
        <View className='fm-hero__stats'>
          <View className='fm-hero__stat'>
            <Text className='fm-hero__stat-num'>{stats?.recordCount ?? 0}</Text>
            <Text className='fm-hero__stat-label'>记录条数</Text>
          </View>
          <View className='fm-hero__stat'>
            <Text className='fm-hero__stat-num'>{stats?.avgCaloriesPerDay ?? 0}</Text>
            <Text className='fm-hero__stat-label'>日均 kcal</Text>
          </View>
          <View className='fm-hero__stat'>
            <Text className='fm-hero__stat-num'>{dayCount(activeRange)}</Text>
            <Text className='fm-hero__stat-label'>区间天数</Text>
          </View>
        </View>
        {/* 口径说明放在日均数字正下方，而不是“按餐次分布”卡片标题栏 */}
        <Text className='fm-hero__note'>日均 = 区间总量 ÷ 有记录的天数</Text>
      </View>

      <View className='fm-card'>
        <View className='fm-row fm-row--between fm-section-head'>
          <Text className='fm-title'>按餐次分布</Text>
        </View>
        {totalCalories > 0 ? (
          // 遍历 MEAL_ORDER 而不是遍历 caloriesByMeal：后端只返「区间内出现过」的餐次，
          // 直接遍历数据会让没吃过的餐次整行消失，四行永远齐着才能横向比较
          MEAL_ORDER.map((mealType) => {
            const name = MEAL_NAME_BY_TYPE[mealType]
            // key 是**餐次中文名**且只含区间内出现过的餐次（后端 Map<String,Integer>），
            // 所以必须 ?? 0；直接用 undefined 参与后面的除法会把整块渲染成 NaN
            const calories = caloriesByMeal[name] ?? 0
            const color = mealColor(mealType)
            const percent = Math.min(100, Math.round((calories / totalCalories) * 100))
            return (
              <View className='meal-bar' key={name}>
                <View className='meal-bar__head'>
                  <View className='meal-bar__dot' style={{ backgroundColor: color }} />
                  <Text className='meal-bar__name'>{name}</Text>
                  <Text className='meal-bar__value'>
                    {calories} kcal · {percent}%
                  </Text>
                </View>
                <View className='meal-bar__track'>
                  {/* 百分比以 totalCalories 为分母，封顶 100：四项加起来应等于总量，
                      但因为四项各自 round，百分比总和可能是 99 或 101，属预期误差 */}
                  <View
                    className='meal-bar__fill'
                    style={{ backgroundColor: color, width: `${percent}%` }}
                  />
                </View>
              </View>
            )
          })
        ) : (
          <View className='fm-empty'>
            <Text className='fm-empty__icon'>📊</Text>
            <View>该区间还没有记录</View>
          </View>
        )}
      </View>

      <View className='fm-card'>
        <View className='fm-row fm-row--between fm-section-head'>
          <Text className='fm-title'>记录明细</Text>
          <Text className='fm-tertiary'>{records.length} 条</Text>
        </View>
        {loading && records.length === 0 ? <View className='fm-loading'>加载中…</View> : null}
        {/* 空态判 groups 而不判 records：records 为空时 groups 必为空，反过来也成立，
            但拿 groups 说下去要渲染的东西更贴近“列表为什么是空的” */}
        {!loading && groups.length === 0 ? (
          <View className='fm-empty'>
            <Text className='fm-empty__icon'>🗒</Text>
            <View>暂无记录</View>
          </View>
        ) : null}
        {groups.map((group) => (
          <View className='detail-group' key={group.date}>
            <View className='detail-group__head'>
              <Text className='detail-group__date'>{formatDateLabel(group.date)}</Text>
              <Text className='detail-group__count'>{group.items.length} 条</Text>
            </View>
            {group.items.map((record) => (
              // 统计页是跨天列表，副行要带所属日期（record-item 早就留了 showDate，此前没人传）
              <RecordItem key={record.id} record={record} showDate />
            ))}
          </View>
        ))}
      </View>
    </View>
  )
}
