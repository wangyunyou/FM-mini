import { useState } from 'react'

import { Button, Input, Picker, Textarea, View } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'

import { createDietRecord, deleteDietRecord, updateDietRecord } from '@/api/diet'
import { MEAL_NAME_BY_TYPE, MEAL_ORDER, type MealType } from '@/constants/meal'
import { ROUTES } from '@/constants/route'
import {
  CALORIES_MAX,
  CALORIES_MIN,
  FOOD_NAME_MAX,
  REMARK_MAX
} from '@/constants/validation'
import type { DietRecordResponse } from '@/types/api'
import { parseDate, todayStr } from '@/utils/date'
import { confirm, toast, toastSuccess } from '@/utils/feedback'
import { readStorage, removeStorage, STORAGE_KEYS } from '@/utils/storage'

import './index.scss'

/** 表单内部值，提交前再拆成新增/更新两种请求体。 */
interface DietFormValues {
  recordDate: string
  mealType: number
  foodName: string
  calories: number
  remark?: string
}

/**
 * 读出列表页写下的草稿。
 *
 * 两道防线：
 * 1. 读后即清，避免下次进页时带着上一条记录的残留值；
 * 2. 草稿 id 必须与路由上的 id 一致才采信。上一跳如果 navigateTo 失败
 *    （例如页面栈已满）草稿会留在本地，不校验就会让新增页错进编辑态。
 */
function takeDraft(expectedId: number | null): DietRecordResponse | null {
  const draft = readStorage<DietRecordResponse | ''>(STORAGE_KEYS.EDITING_RECORD, '')
  removeStorage(STORAGE_KEYS.EDITING_RECORD)
  if (!draft || typeof draft.id !== 'number' || draft.id !== expectedId) {
    return null
  }
  return draft
}

/** 关闭编辑页：正常回上一页；分享直达没有上一页时回首页。 */
async function closeEditor(): Promise<void> {
  try {
    await Taro.navigateBack()
  } catch (error) {
    console.warn('[record-edit] 无上一页，改为跳转首页:', error)
    await Taro.reLaunch({ url: ROUTES.HOME })
  }
}

export default function RecordEditPage() {
  const router = useRouter()
  // 新增时路由不带 id，此时 Number(undefined) 是 NaN，归为 null
  const expectedId = Number(router.params.id)
  const [draft] = useState(() => takeDraft(Number.isFinite(expectedId) ? expectedId : null))
  const isEdit = typeof draft?.id === 'number'
  const [dateText, setDateText] = useState(draft?.recordDate ?? todayStr())
  const [mealIndex, setMealIndex] = useState(() => {
    const index = MEAL_ORDER.indexOf(draft?.mealType as MealType)
    // 草稿里的餐次缺失或越界时回到第一项，而不是让 Picker 显示空
    return index >= 0 ? index : 0
  })
  const [foodName, setFoodName] = useState(draft?.foodName ?? '')
  const [caloriesText, setCaloriesText] = useState(
    typeof draft?.calories === 'number' ? String(draft.calories) : ''
  )
  const [remark, setRemark] = useState(draft?.remark ?? '')
  const [submitting, setSubmitting] = useState(false)

  /** 逐条对齐后端校验规则，任一不合法就提示并返回 null。 */
  function buildValues(): DietFormValues | null {
    const name = foodName.trim()
    if (!name) {
      toast('请填写食物名称')
      return null
    }
    if (name.length > FOOD_NAME_MAX) {
      toast(`食物名称最多 ${FOOD_NAME_MAX} 个字符`)
      return null
    }

    const caloriesRaw = caloriesText.trim()
    if (!caloriesRaw) {
      toast('请填写热量')
      return null
    }
    const calories = Number(caloriesRaw)
    // 实测：后端 calories 字段是 Integer，但 Jackson 会把 12.5 静默截断成 12 并返回 200，
    // 不挡的话用户输入会被悄悄改掉，所以前端强制要求整数
    if (!Number.isFinite(calories) || !Number.isInteger(calories)) {
      toast('热量请填整数')
      return null
    }
    if (calories < CALORIES_MIN) {
      toast(`热量不能小于 ${CALORIES_MIN}`)
      return null
    }
    if (calories > CALORIES_MAX) {
      toast(`热量看起来过大（上限 ${CALORIES_MAX}）`)
      return null
    }

    const remarkText = remark.trim()
    if (remarkText.length > REMARK_MAX) {
      toast(`备注最多 ${REMARK_MAX} 个字符`)
      return null
    }

    const mealType = MEAL_ORDER[mealIndex]
    if (mealType == null) {
      toast('请选择餐次')
      return null
    }

    return {
      recordDate: dateText,
      mealType,
      foodName: name,
      calories,
      remark: remarkText || undefined
    }
  }

  async function handleSubmit() {
    if (submitting) {
      return
    }
    const values = buildValues()
    if (!values) {
      return
    }
    if (!isEdit && !parseDate(values.recordDate)) {
      toast('请选择正确的日期')
      return
    }

    setSubmitting(true)
    try {
      if (isEdit && draft?.id != null) {
        // 后端更新接口不接受 recordDate，所以编辑态只提交可改字段
        await updateDietRecord(draft.id, {
          mealType: values.mealType,
          foodName: values.foodName,
          calories: values.calories,
          remark: values.remark
        })
      } else {
        await createDietRecord(values)
      }
      await closeEditor()
      toastSuccess(isEdit ? '已更新' : '已记录')
    } catch (error) {
      // 具体文案由 request 层提示，这里只留日志，不重复弹一次
      console.error('[record-edit] 保存失败:', error)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete() {
    if (submitting || draft?.id == null) {
      return
    }
    const confirmed = await confirm(
      '删除记录',
      `确定删除「${draft.foodName ?? '这条记录'}」吗？删除后不可恢复。`,
      '删除'
    )
    if (!confirmed) {
      return
    }
    setSubmitting(true)
    try {
      await deleteDietRecord(draft.id)
      await closeEditor()
      toastSuccess('已删除')
    } catch (error) {
      console.error('[record-edit] 删除失败:', error)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <View className='fm-page'>
      <View className='fm-card'>
        <View className='fm-field'>
          <View className='fm-field__label'>餐次</View>
          <Picker
            mode='selector'
            range={MEAL_ORDER.map((mealType) => MEAL_NAME_BY_TYPE[mealType])}
            value={mealIndex}
            onChange={(event) => setMealIndex(Number(event.detail.value))}
          >
            <View className='fm-picker'>{MEAL_NAME_BY_TYPE[MEAL_ORDER[mealIndex] ?? MEAL_ORDER[0]]}</View>
          </Picker>
        </View>

        <View className='fm-field'>
          <View className='fm-field__label'>日期</View>
          {isEdit ? (
            <View>
              <View className='fm-picker fm-picker--locked'>{dateText}</View>
              <View className='fm-weak edit-date-tip'>
                后端更新接口不支持修改日期；需要换日期请删除后重新记录。
              </View>
            </View>
          ) : (
            <Picker
              mode='date'
              end={todayStr()}
              value={dateText}
              onChange={(event) => setDateText(event.detail.value)}
            >
              <View className='fm-picker'>{dateText}</View>
            </Picker>
          )}
        </View>

        <View className='fm-field'>
          <View className='fm-field__label'>食物名称</View>
          <Input
            className='fm-input'
            maxlength={FOOD_NAME_MAX}
            placeholder='吃了什么'
            value={foodName}
            onInput={(event) => setFoodName(event.detail.value)}
          />
        </View>

        <View className='fm-field'>
          <View className='fm-field__label'>热量（kcal）</View>
          <Input
            className='fm-input'
            placeholder='例如 320'
            type='number'
            value={caloriesText}
            onInput={(event) => setCaloriesText(event.detail.value)}
          />
        </View>

        <View className='fm-field'>
          <View className='fm-field__label'>备注（选填）</View>
          <Textarea
            className='fm-input fm-textarea'
            maxlength={REMARK_MAX}
            placeholder='口味、份量、和谁一起吃'
            value={remark}
            onInput={(event) => setRemark(event.detail.value)}
          />
          <View className='fm-weak counter'>
            {remark.length}
            /
            {REMARK_MAX}
          </View>
        </View>
      </View>

      <Button
        className='fm-btn fm-btn--primary'
        disabled={submitting}
        loading={submitting}
        onClick={handleSubmit}
      >
        {submitting ? '保存中…' : isEdit ? '保存修改' : '记下这一笔'}
      </Button>

      {isEdit ? (
        <Button className='fm-btn fm-btn--danger edit-delete' disabled={submitting} onClick={handleDelete}>
          删除这条记录
        </Button>
      ) : null}
    </View>
  )
}
