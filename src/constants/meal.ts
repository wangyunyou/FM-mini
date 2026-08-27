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

/** 未知餐次的兜底文案，与后端 default 分支一致。 */
export const UNKNOWN_MEAL_NAME = '未知'

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
