import { useCallback, useState } from 'react'

import { Text, View } from '@tarojs/components'
import Taro, { useDidShow, usePullDownRefresh } from '@tarojs/taro'

import { deleteDietRecord, queryDietRecords } from '@/api/diet'
import RecordItem from '@/components/record-item'
import type { DietRecordResponse } from '@/types/api'
import { ensureLoggedIn } from '@/utils/auth'
import { currentWeekRange, formatDateLabel, singleDayRange, todayStr } from '@/utils/date'
import { confirm, toastSuccess } from '@/utils/feedback'
import { openRecordEditor } from '@/utils/navigation'

import './index.scss'

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

  return (
    <View className='fm-page'>
      <View className='fm-card summary-card'>
        <View className='summary-card__main'>
          <Text className='fm-weak'>{formatDateLabel(todayStr())}摄入</Text>
          <View className='fm-row'>
            <Text className='fm-num'>{todayCalories}</Text>
            <Text className='fm-unit'>kcal</Text>
          </View>
        </View>
        <View className='summary-card__side'>
          <Text className='fm-weak'>本周累计</Text>
          <Text className='summary-card__side-num'>{weekCalories} kcal</Text>
        </View>
      </View>

      <View className='fm-card'>
        <View className='fm-row fm-row--between fm-section-head'>
          <Text className='fm-title'>今日记录</Text>
          <Text className='fm-weak'>共 {records.length} 条 · 长按可删除</Text>
        </View>

        {loading && records.length === 0 ? (
          <View className='fm-empty'>加载中…</View>
        ) : null}

        {!loading && records.length === 0 ? (
          <View className='fm-empty'>
            <View>今天还没有记录</View>
            <View>点右下角「+」记第一条</View>
          </View>
        ) : null}

        {records.map((record) => (
          <RecordItem
            key={record.id}
            record={record}
            onTap={openRecordEditor}
            onLongPress={handleDelete}
          />
        ))}
      </View>

      <View className='fm-fab' onClick={() => openRecordEditor()}>
        +
      </View>
    </View>
  )
}
