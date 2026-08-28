import { Text, View } from '@tarojs/components'

import { mealColor, mealTypeLabel } from '@/constants/meal'
import type { DietRecordResponse } from '@/types/api'

import './index.scss'

/**
 * 一条打卡记录。
 *
 * 打卡页与统计页共用，样式只在 index.scss 里维护一份。
 * 点击进编辑、长按删除，与后端「按 id 改/删」的接口形态一一对应。
 * 左侧色条按餐次取色，与统计页的分布条是同一套 MEAL_COLOR，两处能对上。
 *
 * 组件自己不发请求：记录从 props 进来，所以父页换数据源（改成分页/搜索）不用动这里。
 */
interface RecordItemProps {
  /** 后端 DietRecordResponse 原样传入，组件不改写它 */
  record: DietRecordResponse
  /** 跨天列表（如统计页明细）需要展示所属日期 */
  showDate?: boolean
  /** 列表已按餐次分组时不必再重复餐次标签（首页不传 = 默认 true，但首页显式传了 false） */
  showMeal?: boolean
  /** 点一行；不传则点了没反应（删除只能靠列表页的长按时，这里不强制给） */
  onTap?: (record: DietRecordResponse) => void
  /** 长按触发删除确认，由父页弹 confirm，组件自己不调接口 */
  onLongPress?: (record: DietRecordResponse) => void
}
export default function RecordItem({
  record,
  showDate = false,
  showMeal = true,
  onTap,
  onLongPress
}: RecordItemProps) {
  // 接口对老数据可能给 null，归零而不是让 NaN 进到行高里
  const calories = typeof record.calories === 'number' ? record.calories : 0
  // 副行把「餐次 / 日期 / 备注」拼成一行，避免开三个小标签把行高撑散
  const subParts: string[] = []
  if (showMeal) {
    // 优先用后端翻译好的 mealTypeName，本地映射只做兜底（理由见 constants/meal.ts）
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
      // onTap/onLongPress 都是可选的，用 ?. 调而不是默认空函数：
      // 少一个 prop 不应该多一对没人的回调
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
