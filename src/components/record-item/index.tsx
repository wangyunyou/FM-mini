import { Text, View } from '@tarojs/components'

import { mealTypeLabel } from '@/constants/meal'
import type { DietRecordResponse } from '@/types/api'

import './index.scss'

interface RecordItemProps {
  record: DietRecordResponse
  /** 跨天列表（如统计页明细）需要展示所属日期 */
  showDate?: boolean
  onTap?: (record: DietRecordResponse) => void
  onLongPress?: (record: DietRecordResponse) => void
}

/**
 * 一条打卡记录。
 *
 * 打卡页与统计页共用，样式只在 index.scss 里维护一份。
 * 点击进编辑、长按删除，与后端「按 id 改/删」的接口形态一一对应。
 */
export default function RecordItem({
  record,
  showDate = false,
  onTap,
  onLongPress
}: RecordItemProps) {
  const calories = typeof record.calories === 'number' ? record.calories : 0
  const hasSubLine = Boolean(showDate && record.recordDate) || Boolean(record.remark)

  return (
    <View
      className='record-item'
      onClick={() => onTap?.(record)}
      onLongPress={() => onLongPress?.(record)}
    >
      <View className='record-item__main'>
        <View className='record-item__head'>
          <Text className='fm-tag'>{mealTypeLabel(record.mealType, record.mealTypeName)}</Text>
          <Text className='record-item__name'>{record.foodName ?? '未命名食物'}</Text>
        </View>
        {hasSubLine ? (
          <View className='record-item__sub'>
            {showDate && record.recordDate ? <Text className='fm-weak'>{record.recordDate}</Text> : null}
            {record.remark ? <Text className='fm-weak record-item__remark'>{record.remark}</Text> : null}
          </View>
        ) : null}
      </View>
      <View className='record-item__calories'>
        <Text className='record-item__calories-num'>{calories}</Text>
        <Text className='fm-unit'>kcal</Text>
      </View>
    </View>
  )
}
