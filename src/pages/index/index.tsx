import { useCallback, useMemo, useState } from 'react'

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

interface MealGroup {
  mealType: number
  name: string
  items: DietRecordResponse[]
  sum: number
}

/** 今日与本周日均的对比文案，避免「超出 0 kcal」这种别扭说法。 */
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
  const [records, setRecords] = useState<DietRecordResponse[]>([])
  const [todayCalories, setTodayCalories] = useState(0)
  const [weekCalories, setWeekCalories] = useState(0)
  const [loading, setLoading] = useState(false)

  /** 拉取「今日」与「本周」两份统计：后端只有一个区间查询接口，用两个区间复用。 */
  const loadData = useCallback(async () => {
    setLoading(true)
    const dateText = todayStr()
    try {
      const [todayStats, weekStats] = await Promise.all([
        queryDietRecords(singleDayRange(dateText)),
        queryDietRecords(currentWeekRange())
      ])
      // 后端字段可能缺失（例如新用户），全部判空后再落到 state
      setRecords(todayStats?.records ?? [])
      setTodayCalories(todayStats?.totalCalories ?? 0)
      setWeekCalories(weekStats?.totalCalories ?? 0)
    } catch (error) {
      // request 层已经提示过，这里只清掉旧数据，避免把上一次的结果当成今日结果
      console.error('[index] 加载今日数据失败:', error)
      setRecords([])
      setTodayCalories(0)
      setWeekCalories(0)
    } finally {
      setLoading(false)
    }
  }, [])

  useDidShow(() => {
    // 从编辑页返回时会自动刷新；未登录（如分享链接直达）则先静默登录
    void (async () => {
      if (await ensureLoggedIn()) {
        await loadData()
      }
    })()
  })

  usePullDownRefresh(() => {
    void loadData().finally(() => {
      Taro.stopPullDownRefresh()
    })
  })

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

  /** 按餐次分组；后端将来扩餐次时，不在预设列表里的记录单独成组而不是被丢掉。 */
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

  const weekAvg = weekCalories > 0
    ? Math.round(weekCalories / Math.max(daysElapsedInWeek(), 1))
    : 0
  const progressPercent = weekAvg > 0
    ? Math.min(100, Math.round((todayCalories / weekAvg) * 100))
    : 0

  return (
    <View className='fm-page'>
      <View className='fm-hero'>
        <Text className='fm-hero__label'>{formatDateLabel(todayStr())}摄入</Text>
        <View className='hero-value'>
          <Text className='fm-num'>{todayCalories}</Text>
          <Text className='fm-unit'>kcal</Text>
        </View>

        <View className='hero-compare'>
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

      <View className='fm-card'>
        <View className='fm-row fm-row--between fm-section-head'>
          <Text className='fm-title'>今日记录</Text>
          <Text className='fm-tertiary'>长按可删除</Text>
        </View>

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

      <View className='fm-fab' onClick={() => openRecordEditor()}>
        +
      </View>
    </View>
  )
}
