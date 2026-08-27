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

type RangeKey = 'week' | 'month' | 'recent7' | 'custom'

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
  const [rangeKey, setRangeKey] = useState<RangeKey>('week')
  const [startDate, setStartDate] = useState(INITIAL_CUSTOM_RANGE.startDate)
  const [endDate, setEndDate] = useState(INITIAL_CUSTOM_RANGE.endDate)
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

  usePullDownRefresh(() => {
    void loadStats(activeRangeRef.current).finally(() => {
      Taro.stopPullDownRefresh()
    })
  })

  const records = stats?.records ?? []
  const totalCalories = stats?.totalCalories ?? 0
  const caloriesByMeal = stats?.caloriesByMeal ?? {}
  const groups = groupByRecordDate(records)

  return (
    <View className='fm-page'>
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

      {rangeKey === 'custom' ? (
        <View className='fm-card custom-range'>
          <View className='custom-range__row'>
            <Picker
              className='custom-range__picker'
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
            onClick={() => handleTabChange('custom')}
          >
            查询该区间
          </View>
        </View>
      ) : null}

      <View className='fm-hero'>
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
          MEAL_ORDER.map((mealType) => {
            const name = MEAL_NAME_BY_TYPE[mealType]
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
