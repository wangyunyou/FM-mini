/**
 * 餐次常量。
 *
 * 取值与后端 `DietRecordResponse.getMealTypeName()` 严格对齐（1 早餐 / 2 午餐 / 3 晚餐 / 4 加餐），
 * 改这里必须同时改后端，否则 caloriesByMeal 的中文 key 对不上。
 */

/** 餐次码。值是后端定义的合同，不是前端可自改的编号（背上的文件头写了为什么）。 */
export enum MealType {
  Breakfast = 1,
  Lunch = 2,
  Dinner = 3,
  /** 4 = 加餐（零食、饮料等），后端把不归类于一日三餐的都放这里 */
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

/**
 * 餐次码 -> 中文名，内容与后端 `getMealTypeName()` 保持一致。
 *
 * 两个用途：统计页拿它去取 `caloriesByMeal` 的 key（那边 key 就是中文）；
 * 以及后端 mealTypeName 缺失时的本地兜底文案。
 */
export const MEAL_NAME_BY_TYPE: Record<MealType, string> = {
  [MealType.Breakfast]: '早餐',
  [MealType.Lunch]: '午餐',
  [MealType.Dinner]: '晚餐',
  [MealType.Snack]: '加餐'
}

/**
 * 餐次配色：统计页分布条、首页餐次分组标题、记录行色条共用一套。
 *
 * 2026-08-28 第二版（界面换成薄荷翠绿后重排）。
 * 结构性约束：**界面一旦占住绿色，四类里就必须有一类让位**，躲不掉。
 * 让位的是「午餐」——给它青 #0e9aa7，而不是橄榄黄：
 * 橄榄 #8a9c17 与早餐橙在红盲模拟下 ΔE 只有 21，两对太挤。
 * - 早餐 #c97a1e（旧 #e08a2f 白底对比 2.68，低于图形 3.0 门槛）
 * - 午餐 #0e9aa7 青
 * - 晚餐 #4c7de0 蓝
 * - 加餐 #c25e96 玫红
 * 四类白底对比 3.34 / 3.39 / 3.95 / 3.94（门槛 3.0）；
 * 与界面绿最小 ΔE 53；绿盲最难分一对 48、红盲最难分一对 27。
 */
export const MEAL_COLOR: Record<MealType, string> = {
  [MealType.Breakfast]: '#c97a1e',
  [MealType.Lunch]: '#0e9aa7',
  [MealType.Dinner]: '#4c7de0',
  [MealType.Snack]: '#c25e96'
}

/** 取餐次色，未知餐次回落到中性灰而不是报错（与 --fm-text-tertiary 同值，保持一套中性色）。 */
export function mealColor(mealType: number | undefined | null): string {
  return MEAL_COLOR[mealType as MealType] ?? '#636f69'
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
