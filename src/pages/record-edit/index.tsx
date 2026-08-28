/**
 * 记录编辑页（新增 / 改一条共用）。
 *
 * 两种形态只靠路由上有无 ?id= 区分：
 * - 无 id → 新增，POST /api/diet，表单初值为空/今天
 * - 有 id → 编辑，PUT /api/diet/{id}，初值来自本地草稿
 *
 * 为什么原记录靠 storage 传而不是进页再查：后端**没有单条查询接口**（只有区间查询），
 * 所以由列表页整条写草稿、本页读后即清（链路见 utils/navigation.ts 与 utils/storage.ts）。
 * 这也带来本页最严重的一个防御：带 id 却没读到草稿时不能退化成新增，
 * 否则用户以为在改、实际 POST 出一条重复记录（见下面 draftMissing）。
 *
 * 表单校验逐条对齐后端 DTO 注解（constants/validation.ts ↔ @Size/@Min/@Max），
 * 只写在前端等于没有（Swagger / test-api.html 能绕过），但反过来前端也必须挡：
 * 后端对小数热量是静默截断而不是报错。
 *
 * 状态与触发链（本页没有“拉数据”，只有“读一次草稿 + 写一次”）：
 *   routeId / draft / draftMissing / isEdit / editId → 形态判定链，顺序读才能懂
 *   dateText / mealIndex / foodName / caloriesText / remark / initialRemark → 表单六值
 *     （mealIndex 存下标、caloriesText 存字符串，两个例外都不是随手写的，见各自注释）
 *   submitting → 新增/更新/删除 三个写操作共用一个闸门
 *   入口：useLoad（改导航标）、handleSubmit、handleDelete、addCaloriesStep（不提交，只改输入框）
 */
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
  /** yyyy-MM-dd；编辑态下后端不接受这个字段，所以只用于新增 */
  recordDate: string
  /** 餐次码 1-4 */
  mealType: number
  /** 已 trim，非空 */
  foodName: string
  /** 已保证是整数且在 [CALORIES_MIN, CALORIES_MAX] 内 */
  calories: number
  /** 已 trim；空备注在这里就是 undefined（不传），而不是 '' */
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

/**
 * 关闭编辑页：正常回上一页；分享直达没有上一页时回首页。
 *
 * 为什么不只用 navigateBack：本页可以从分享链接直达，页面栈里没有上一页时
 * navigateBack 会失败，用户点「保存」后就停在原地，看起来像没保存。
 */
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
  // （不用 Number.isNaN 判断而用 isFinite：?id=abc 这类脏入参会给出 NaN 以外的垃圾，
  //   干脆只接受有限数字，剩下的统一当「新增」）
  const expectedId = Number(router.params.id)
  const routeId = Number.isFinite(expectedId) ? expectedId : null
  /**
   * 编辑态的原记录，来自列表页写下的本地草稿。
   *
   * ❕ 为什么要把取草稿包成 lazy initializer（传给 useState 的是一个函数），而不是直接把调用结果传进去：
   * takeDraft 不是个纯函数，它读 storage 后**顺手删掉**（读后即清）。
   * 不包成箭头函数时每次渲染都会执行一遍，除了白白删一次，
   * 更坑的是 React 只用第一次的返回值，后面的执行结果直接被丢弃。
   * 这里用 lazy initializer，让它在本页生命周期内只跑一次。
   */
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
  /**
   * 是不是编辑态。
   *
   * 注意它只表示「草稿真拿到了」，而 draftMissing 表示「本该拿到却没拿到」；
   * 两者合起来才是完整判定，只看 draft 是否为空会把后者当成新增。
   */
  const isEdit = typeof draft?.id === 'number'
  /** 提交 PUT 时用的 id：优先草稿里的，它才是真正被读到的那条 */
  const editId = isEdit ? (draft as DietRecordResponse).id : routeId
  const [dateText, setDateText] = useState(draft?.recordDate ?? todayStr())
  const [mealIndex, setMealIndex] = useState(() => {
    const index = MEAL_ORDER.indexOf(draft?.mealType as MealType)
    // 草稿里的餐次缺失或越界时回到第一项，而不是让 Picker 显示空
    return index >= 0 ? index : 0
  })
  const [foodName, setFoodName] = useState(draft?.foodName ?? '')
  /**
   * 热量在表单里是**字符串** state，不是 number。
   *
   * 三个原因：
   * 1. Input 的 value 只能是字符串，存 number 就得每次渲染再转；
   * 2. 输入框清空是合法操作，而 number 表达不了“空”（存 0 会把用户的清空当成填了 0）；
   * 3. 输入中途的 `12.` 、`0` 这类临时态也不应该被丢掉精度，统一在 buildValues 里一次转完。
   */
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

  /**
   * 表单值 + 逐条对齐后端校验规则，任一不合法就提示并返回 null。
   *
   * 为什么返回 null 而不是抛异常：校验不通过是**日常路径**，不是异常；
   * 抛异常会让调用方多包一层 catch，没必要；
   * 提示也统一在这里发，调用点判空后直接返回即可，不必各自拼文案。
   *
   * 校验顺序与后端一致：非空 → 长度 → 数值 → 上下限 → 枚举，
   * 先报用户一看就懂的那个错，而不是把五条一起弹。
   */
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

  /**
   * 保存（新增或更新）。
   *
   * 两条分支的请求体不同不是冗余：创建接口除备注外全字段必填，更新接口只受理传了的字段。
   * 共用一份 payload 会把更新变成“全量覆盖”，并把 recordDate 错发给不支持它的 PUT。
   */
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
          // 备注是全页最绕的一个表达式，值得逐块读：
          //   !values.remark    —— 用户在表单里把备注清空了（buildValues 已 trim）
          //   && initialRemark  —— 而且进来的时候本来有内容
          //   ? ''              → 两条同时成立才是「清空」，显式发空串
          //   : values.remark   → 否则原样发（undefined 就是「不改」）
          // 不能用 undefined 表“清空”：JSON.stringify 会丢该键，后端当成「不改」，
          // 于是备注永远清不掉（实测省略键与传 null 都改不动原值）。
          // 反方向也错：没改过却发 '' 会真把备注抹掉，所以必须拿 initialRemark 对一次。
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

  /**
   * 删除当前记录（仅编辑态有这个入口）。
   *
   * 为什么复用 submitting 而不是另开一个 deleting：删除与保存是互斥的两个写操作，
   * 共用一个闸门既挡住「保存请求还在飞就点删除」，也让底部按钮与删除行同时置灰。
   * 多一个 state 只会多一组「两个都是 true 怎么办」的分支。
   */
  async function handleDelete() {
    if (submitting || editId == null) {
      // editId == null 说明这是新增页，没东西可删；不能只靠「不渲染删除行」兼容
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

  /**
   * 快捷加数只改输入框内容，整数与上下限仍走 buildValues 那一套校验。
   *
   * 为什么这里不夹 CALORIES_MAX：把夹偷逻辑分在两处，以后上限只改一处就会不一致；
   * 而且用户还没提交，当场静默改写输入比提交后给一句原因不明的提示更让人困惑。
   * 非数字输入（比如粘贴了字母）回落到从 0 开始加，而不是让 NaN 一路传下去。
   */
  function addCaloriesStep(step: number) {
    const current = Number(caloriesText.trim())
    const base = Number.isFinite(current) && current > 0 ? current : 0
    setCaloriesText(String(base + step))
  }

  // 兜底页先 return，不在表单上叠 disabled：下面的 JSX 就可以假定
  // 「能走到这里就要么拿到了草稿、要么本来就是新增」，不用再处处判 draft
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
      {/* 主表单卡：餐次/日期/名称/热量/备注。顺序与后端实体字段一致，
          餐次放最前因为它是用户每天真正在选的东西 */}
      <View className='fm-card'>
        <View className='fm-field'>
          <View className='fm-field__label'>餐次</View>
          {/* 用 chips 而不是 Picker：餐次只有 4 个固定值，全部可见比滚一轮体验好。
              值只能从 MEAL_ORDER 里按下标取，所以用户选不出 1-4 以外的餐次码 */}
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
          {/* 两种形态不是美观差异，是后端能力差异：PUT 不受理 recordDate，
              所以编辑态只能锁住并给出说明，而不能只把 Picker 隐了不提示 */}
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
                // end 锁到今天：后端对 recordDate 晚于今天是硬拒 2002（写入必须拦，
                // 与查询的 endDate 收敛不同口径，见 AGENTS.md 同步点第 9 条）
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
          {/* maxlength 与后端 @Size(max=200) / 实体 VARCHAR(200) 同一个值：
              在输入框上挡住的长度，用户根本遇不到 400；只靠后端挡会看到截断后的内容 */}
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
              // type='number' 只决定键盘样式，不保证值合法也不保证是整数，
              // 所以 buildValues 里的 Number.isInteger 与上下限一道都不能省
              type='number'
              value={caloriesText}
              onInput={(event) => setCaloriesText(event.detail.value)}
            />
            {caloriesText ? (
              // 清空按钮只在有内容时出现：空框旁边放一个「清空」是噪声
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
            {/* 实时字数而不是只在超长时报：remark 是全页唯一允许“清空”的字段，
                用户需要看得见边界在哪（REMARK_MAX ↔ 后端 @Size(max = 500)） */}
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

      {/* 删除只在编辑态出现：新增还没存进库，没有可删的东西 */}
      {isEdit ? (
        <View className='edit-delete' onClick={handleDelete}>
          删除这条记录
        </View>
      ) : null}


      {/* 提交区：按钮文案跟形态变，形态又跟路由上的 id 变，三处必须一致 */}
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
