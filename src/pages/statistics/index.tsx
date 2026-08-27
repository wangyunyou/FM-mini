import { useCallback, useRef, useState } from 'react'

import { Picker, Text, View } from '@tarojs/components'
import Taro, { useDidShow, usePullDownRefresh } from '@tarojs/taro'

import { queryDietRecords } from '@/api/diet'
import RecordItem from '@/components/record-item'
import { MEAL_NAME_BY_TYPE, MEAL_ORDER } from '@/constants/meal'
import { DATE_MAX, DATE_MIN } from '@/constants/validation'
import type { DietStatisticsResponse } from '@/types/api'
import { ensureLoggedIn } from '@/utils/auth'
import {
  currentMonthRange,
  currentWeekRange,
  dayCount,
  formatDateLabel,
  groupByRecordDate,
  isValidRange,
  recentDaysRange,
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
   * 当前生效的区间。
   *
   * 用 ref 而不是 state：Taro 的生命周期钩子只在挂载时注册一次，
   * 闭包里的 state 会是旧值，回到页面刷新时就会查到错误的区间。
   */
  const activeRangeRef = useRef<DateRange>(currentWeekRange())

  const loadStats = useCallback(async (range: DateRange) => {
    setLoading(true)
    try {
      const data = await queryDietRecords(range)
      setStats(data ?? null)
      activeRangeRef.current = range
    } catch (error) {
      // 失败提示已由 request 层给出，这里清空避免把上一个区间的结果当成当前的
      console.error('[statistics] 加载统计失败:', error)
      setStats(null)
    } finally {
      setLoading(false)
    }
  }, [])

  function handleTabChange(key: RangeKey) {
    setRangeKey(key)
    if (key !== 'custom') {
      void loadStats(PRESET_RANGES[key]())
      return
    }
    const custom = { startDate, endDate }
    // 后端对 startDate 晚于 endDate 返回 2002，先在本地挡掉
    if (!isValidRange(custom)) {
      toast('开始日期不能晚于结束日期')
      return
    }
    void loadStats(custom)
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
  const activeRange = activeRangeRef.current

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
          <Picker
            className='custom-range__item'
            end={endDate}
            mode='date'
            start={DATE_MIN}
            value={startDate}
            onChange={(event) => setStartDate(event.detail.value)}
          >
            <View className='fm-field__label'>开始日期</View>
            <View className='fm-picker'>{startDate}</View>
          </Picker>
          <Picker
            className='custom-range__item'
            end={DATE_MAX}
            mode='date'
            start={startDate}
            value={endDate}
            onChange={(event) => setEndDate(event.detail.value)}
          >
            <View className='fm-field__label'>结束日期</View>
            <View className='fm-picker'>{endDate}</View>
          </Picker>
          <View
            className='fm-btn fm-btn--primary custom-range__apply'
            onClick={() => handleTabChange('custom')}
          >
            查询
          </View>
        </View>
      ) : null}

      <View className='fm-card'>
        <View className='fm-row fm-row--between fm-section-head'>
          <Text className='fm-title'>区间概览</Text>
          <Text className='fm-weak'>{activeRange.startDate} ~ {activeRange.endDate}</Text>
        </View>
        <View className='stat-grid'>
          <View className='stat-grid__item'>
            <Text className='stat-grid__num'>{totalCalories}</Text>
            <Text className='fm-weak'>总热量 kcal</Text>
          </View>
          <View className='stat-grid__item'>
            <Text className='stat-grid__num'>{stats?.recordCount ?? 0}</Text>
            <Text className='fm-weak'>记录条数</Text>
          </View>
          <View className='stat-grid__item'>
            <Text className='stat-grid__num'>{stats?.avgCaloriesPerDay ?? 0}</Text>
            <Text className='fm-weak'>日均 kcal</Text>
          </View>
          <View className='stat-grid__item'>
            <Text className='stat-grid__num'>{dayCount(activeRange)}</Text>
            <Text className='fm-weak'>区间天数</Text>
          </View>
        </View>
        <Text className='fm-weak stat-note'>日均按区间天数计算，与后端 avgCaloriesPerDay 口径一致。</Text>
      </View>

      <View className='fm-card'>
        <Text className='fm-title'>按餐次分布</Text>
        {totalCalories > 0 ? (
          MEAL_ORDER.map((mealType) => {
            const name = MEAL_NAME_BY_TYPE[mealType]
            const calories = caloriesByMeal[name] ?? 0
            const percent = Math.min(100, Math.round((calories / totalCalories) * 100))
            return (
              <View className='meal-bar' key={name}>
                <Text className='meal-bar__name'>{name}</Text>
                <View className='meal-bar__track'>
                  <View className='meal-bar__fill' style={{ width: `${percent}%` }} />
                </View>
                <Text className='meal-bar__value'>{calories}</Text>
              </View>
            )
          })
        ) : (
          <View className='fm-empty'>该区间还没有记录</View>
        )}
      </View>

      <View className='fm-card'>
        <Text className='fm-title'>记录明细</Text>
        {loading && records.length === 0 ? <View className='fm-empty'>加载中…</View> : null}
        {!loading && groups.length === 0 ? <View className='fm-empty'>暂无记录</View> : null}
        {groups.map((group) => (
          <View className='detail-group' key={group.date}>
            <Text className='detail-group__date'>
              {formatDateLabel(group.date)} · {group.items.length} 条
            </Text>
            {group.items.map((record) => (
              <RecordItem key={record.id} record={record} />
            ))}
          </View>
        ))}
      </View>
    </View>
  )
}
