/**
 * 餐次常量。
 *
 * 取值与后端 `DietRecordResponse.getMealTypeName()` 严格对齐（1 早餐 / 2 午餐 / 3 晚餐 / 4 加餐），
 * 改这里必须同时改后端，否则 caloriesByMeal 的中文 key 对不上。
 */

export enum MealType {
  Breakfast = 1,
  Lunch = 2,
  Dinner = 3,
  Snack = 4
}

/** 未知餐次的兜底文案，与后端 getMealTypeName 的 default 分支一致；仅供本文件的 mealTypeLabel 使用。 */
const UNKNOWN_MEAL_NAME = '未知'

/** 用于表单选择器与统计图表的固定展示顺序。 */
export const MEAL_ORDER: MealType[] = [
  MealType.Breakfast,
  MealType.Lunch,
  MealType.Dinner,
  MealType.Snack
]

export const MEAL_NAME_BY_TYPE: Record<MealType, string> = {
  [MealType.Breakfast]: '早餐',
  [MealType.Lunch]: '午餐',
  [MealType.Dinner]: '晚餐',
  [MealType.Snack]: '加餐'
}

/**
 * 餐次配色：统计页分布条、首页餐次分组标题、记录行色条共用一套。
 *
 * 2026-08-28 随主题一起调整，原则是「内容色与界面色不撞、四类彼此不撞」：
 * - 旧午餐色 #2f8f6c 与旧界面主色 #1f6f54 色相差只有 2°，且与 --fm-primary-bright 同 hex，
 *   在统计页会和 hero 渐变糊成一片 → 移到草绿 #64a20c（色相 99°）。
 * - 旧早餐色 #e08a2f 白底对比 2.68，低于图形 3.0 的门槛 → 提到 #c97a1e（3.34）。
 * - 加餐 #c2679f → #b0548c，与晚餐蓝在红盲模拟下拉长距离。
 * 四类色相 19° / 99° / 228° / 330°，绿盲、红盲模拟下最难分的一对 ΔE≥25，全部 ≥3.0 对比。
 */
export const MEAL_COLOR: Record<MealType, string> = {
  [MealType.Breakfast]: '#c97a1e',
  [MealType.Lunch]: '#64a20c',
  [MealType.Dinner]: '#4f7cd8',
  [MealType.Snack]: '#b0548c'
}

/** 取餐次色，未知餐次回落到中性灰而不是报错（与 --fm-text-tertiary 同值，保持一套中性色）。 */
export function mealColor(mealType: number | undefined | null): string {
  return MEAL_COLOR[mealType as MealType] ?? '#697a74'
}

/**
 * 餐次码转中文名。
 *
 * 后端列表接口已返回 mealTypeName，优先用它；
 * 只在缺失或越界时回落到本地映射，避免前后端文案不一致时直接白屏。
 */
export function mealTypeLabel(mealType: number | undefined | null, fromServer?: string): string {
  if (fromServer) {
    return fromServer
  }
  if (mealType == null) {
    return UNKNOWN_MEAL_NAME
  }
  return MEAL_NAME_BY_TYPE[mealType as MealType] ?? UNKNOWN_MEAL_NAME
}
