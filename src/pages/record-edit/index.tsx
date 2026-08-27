import { useState } from 'react'

import { Button, Input, Picker, Text, Textarea, View } from '@tarojs/components'
import Taro, { useLoad, useRouter } from '@tarojs/taro'

import { createDietRecord, deleteDietRecord, updateDietRecord } from '@/api/diet'
import { MEAL_NAME_BY_TYPE, MEAL_ORDER, mealColor, type MealType } from '@/constants/meal'
import { ROUTES } from '@/constants/route'
import {
  CALORIES_MAX,
  CALORIES_MIN,
  FOOD_NAME_MAX,
  REMARK_MAX
} from '@/constants/validation'
import type { DietRecordResponse } from '@/types/api'
import { dayOffsetStr, parseDate, todayStr } from '@/utils/date'
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

/** 热量快捷加数：绝大多数一餐落在这个量级里，点几下比打字快。 */
const CALORIES_STEPS = [100, 200, 300, 500]

/** 日期快捷项，超过两项就交给 Picker 选。 */
const DATE_SHORTCUTS = [
  { label: '今天', offset: 0 },
  { label: '昨天', offset: -1 },
  { label: '前天', offset: -2 }
]

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
  const routeId = Number.isFinite(expectedId) ? expectedId : null
  const [draft] = useState(() => takeDraft(routeId))

  /**
   * 路由带着 id 却没读到草稿 —— 编辑态不可用，必须挡住而不是退化成新增。
   *
   * 为什么这是严重问题：草稿是「读后即清」的（takeDraft），用户进过编辑页又返回、
   * 或上一跳 navigateTo 失败把草稿留在本地导致 id 不匹配，都会走到这里。
   * 以前 isEdit 完全由「草稿是否读到」推导，于是这些场景下页面变成一张空表单，
   * 用户以为在改，实际点保存是 POST 新建一条重复记录（静默污染数据）。
   */
  const draftMissing = routeId != null && draft == null
  const isEdit = typeof draft?.id === 'number'
  const editId = isEdit ? (draft as DietRecordResponse).id : routeId
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
  /**
   * 编辑态下「进来的时候备注是什么」。
   * 用于区分备注框留空到底是「不改」还是「要清空」——
   * 后端只认 null=不改、空串=清空，光看当前输入值分不出来。
   */
  const [initialRemark] = useState(() => draft?.remark ?? '')
  const [submitting, setSubmitting] = useState(false)

  // 同一页面承担新增与编辑两种形态，导航标跟着切换，避免用户不确定自己在改哪条
  useLoad(() => {
    Taro.setNavigationBarTitle({ title: isEdit ? '编辑记录' : '记一笔' }).catch((error) => {
      console.error('[record-edit] 设置导航标失败:', error)
    })
  })

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
      // 创建接口没有「保持原值」语义，空备注直接不传
      remark: remarkText || undefined
    }
  }

  async function handleSubmit() {
    if (submitting) {
      return
    }
    if (draftMissing) {
      await closeEditor()
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
      if (isEdit && editId != null) {
        // 后端更新接口不接受 recordDate，所以编辑态只提交可改字段
        await updateDietRecord(editId, {
          mealType: values.mealType,
          foodName: values.foodName,
          calories: values.calories,
          // 备注框被清空、且进来时本来有内容 → 显式发空串表示「清空」。
          // 不能发 undefined：JSON.stringify 会丢掉该键，后端当成「不改」，
          // 于是备注永远清不掉（实测省略键与传 null 都改不动原值）。
          remark:
            !values.remark && initialRemark ? '' : values.remark
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
    if (submitting || editId == null) {
      return
    }
    const confirmed = await confirm(
      '删除记录',
      `确定删除「${draft?.foodName ?? '这条记录'}」吗？删除后不可恢复。`,
      '删除'
    )
    if (!confirmed) {
      return
    }
    setSubmitting(true)
    try {
      await deleteDietRecord(editId)
      await closeEditor()
      toastSuccess('已删除')
    } catch (error) {
      console.error('[record-edit] 删除失败:', error)
    } finally {
      setSubmitting(false)
    }
  }

  /** 快捷加数只改输入框内容，整数与上下限仍走 buildValues 那一套校验。 */
  function addCaloriesStep(step: number) {
    const current = Number(caloriesText.trim())
    const base = Number.isFinite(current) && current > 0 ? current : 0
    setCaloriesText(String(base + step))
  }

  if (draftMissing) {
    return (
      <View className='fm-page edit-page'>
        <View className='fm-card draft-lost'>
          <View className='draft-lost__icon'>⚠️</View>
          <View className='draft-lost__title'>这条记录的数据已失效</View>
          <View className='fm-weak draft-lost__desc'>
            编辑需要先拿到原记录内容（后端没有单条查询接口），本地草稿已不在，
            为避免把「修改」记成「新增一条重复记录」，这里不再提供表单。
          </View>
          <View className='fm-btn fm-btn--primary draft-lost__btn' onClick={closeEditor}>
            返回记录列表
          </View>
        </View>
      </View>
    )
  }

  return (
    <View className='fm-page edit-page'>
      <View className='fm-card'>
        <View className='fm-field'>
          <View className='fm-field__label'>餐次</View>
          <View className='fm-chips fm-chips--grid'>
            {MEAL_ORDER.map((mealType, index) => (
              <View
                key={mealType}
                className={`fm-chip edit-chip${index === mealIndex ? ' fm-chip--active' : ''}`}
                onClick={() => setMealIndex(index)}
              >
                <View className='edit-chip__dot' style={{ backgroundColor: mealColor(mealType) }} />
                {MEAL_NAME_BY_TYPE[mealType]}
              </View>
            ))}
          </View>
        </View>

        <View className='fm-field'>
          <View className='fm-field__label'>日期</View>
          {isEdit ? (
            <View>
              <View className='fm-picker fm-picker--locked'>{dateText}</View>
              <View className='fm-weak edit-tip'>
                后端更新接口不支持修改日期；需要换日期请删除后重新记录。
              </View>
            </View>
          ) : (
            <View>
              <View className='fm-chips fm-chips--grid'>
                {DATE_SHORTCUTS.map((shortcut) => (
                  <View
                    key={shortcut.offset}
                    className={`fm-chip edit-chip${dayOffsetStr(shortcut.offset) === dateText ? ' fm-chip--active' : ''}`}
                    onClick={() => setDateText(dayOffsetStr(shortcut.offset))}
                  >
                    {shortcut.label}
                  </View>
                ))}
              </View>
              <Picker
                className='edit-date-picker'
                end={todayStr()}
                mode='date'
                value={dateText}
                onChange={(event) => setDateText(event.detail.value)}
              >
                <View className='fm-picker edit-date-value'>
                  <Text className='edit-date-value__text'>{dateText}</Text>
                  <Text className='edit-date-value__hint'>选其他日期</Text>
                </View>
              </Picker>
            </View>
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
          <View className='calories-row'>
            <Input
              className='fm-input calories-input'
              placeholder='例如 320'
              type='number'
              value={caloriesText}
              onInput={(event) => setCaloriesText(event.detail.value)}
            />
            {caloriesText ? (
              <View className='calories-clear' onClick={() => setCaloriesText('')}>
                清空
              </View>
            ) : null}
          </View>
          <View className='fm-chips fm-chips--grid calories-steps'>
            {CALORIES_STEPS.map((step) => (
              <View key={step} className='fm-chip calorie-step' onClick={() => addCaloriesStep(step)}>
                +{step}
              </View>
            ))}
          </View>
        </View>

        <View className='fm-field'>
          <View className='fm-field__label edit-label'>
            备注（选填）
            <Text className='counter'>
              {remark.length}
              /
              {REMARK_MAX}
            </Text>
          </View>
          <Textarea
            className='fm-input fm-textarea'
            maxlength={REMARK_MAX}
            placeholder='口味、份量、和谁一起吃'
            value={remark}
            onInput={(event) => setRemark(event.detail.value)}
          />
        </View>
      </View>

      {isEdit ? (
        <View className='edit-delete' onClick={handleDelete}>
          删除这条记录
        </View>
      ) : null}


      <View className='edit-actionbar'>
        <Button
          className='fm-btn fm-btn--primary'
          disabled={submitting}
          loading={submitting}
          onClick={handleSubmit}
        >
          {submitting ? '保存中…' : isEdit ? '保存修改' : '记下这一笔'}
        </Button>
      </View>
    </View>
  )
}
