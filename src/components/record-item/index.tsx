import { Text, View } from '@tarojs/components'

import { mealColor, mealTypeLabel } from '@/constants/meal'
import type { DietRecordResponse } from '@/types/api'

import './index.scss'

interface RecordItemProps {
  record: DietRecordResponse
  /** 跨天列表（如统计页明细）需要展示所属日期 */
  showDate?: boolean
  /** 列表已按餐次分组时不必再重复餐次标签 */
  showMeal?: boolean
  onTap?: (record: DietRecordResponse) => void
  onLongPress?: (record: DietRecordResponse) => void
}

/**
 * 一条打卡记录。
 *
 * 打卡页与统计页共用，样式只在 index.scss 里维护一份。
 * 点击进编辑、长按删除，与后端「按 id 改/删」的接口形态一一对应。
 * 左侧色条按餐次取色，与统计页的分布条是同一套 MEAL_COLOR，两处能对上。
 */
export default function RecordItem({
  record,
  showDate = false,
  showMeal = true,
  onTap,
  onLongPress
}: RecordItemProps) {
  const calories = typeof record.calories === 'number' ? record.calories : 0
  // 副行把「餐次 / 日期 / 备注」拼成一行，避免开三个小标签把行高撑散
  const subParts: string[] = []
  if (showMeal) {
    subParts.push(mealTypeLabel(record.mealType, record.mealTypeName))
  }
  if (showDate && record.recordDate) {
    subParts.push(record.recordDate)
  }
  if (record.remark) {
    subParts.push(record.remark)
  }

  return (
    <View
      className='record-item'
      onClick={() => onTap?.(record)}
      onLongPress={() => onLongPress?.(record)}
    >
      <View className='record-item__bar' style={{ backgroundColor: mealColor(record.mealType) }} />
      <View className='record-item__main'>
        <View className='record-item__name'>{record.foodName ?? '未命名食物'}</View>
        {subParts.length > 0 ? (
          <View className='record-item__sub'>
            <Text className='record-item__sub-text'>{subParts.join(' · ')}</Text>
          </View>
        ) : null}
      </View>
      <View className='record-item__calories'>
        <Text className='record-item__calories-num'>{calories}</Text>
        <Text className='record-item__calories-unit'>kcal</Text>
      </View>
    </View>
  )
}
