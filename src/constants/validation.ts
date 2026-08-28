/**
 * 字段长度与取值上限，镜像后端 DTO 上的校验注解。
 *
 * 后端位置：src/main/java/com/wyy/fm/dto/
 * 前端先按同一套规则挡一遍，避免把注定 400 的请求发出去；改后端上限时必须同步这里。
 */

/** 昵称最长 64（WxLoginRequest / UpdateUserRequest 的 @Size(max = 64)）。 */
export const NICKNAME_MAX = 64

/**
 * 头像 URL 最长 512。
 *
 * ⚠️ 目前**无代码引用**：本页没有头像上传（理由见 pages/profile/index.tsx 文件头），
 * 留着是因为本文件的定位是「后端校验注解的镜像清单」，删了反而看不出 DTO 上有什么。
 * 真要启用上传时记得把这里接进校验，否则只能靠后端 400 接住。
 */
export const AVATAR_URL_MAX = 512

/**
 * 食物名称最长 200，且不能为空（后端对齐 diet_records.food_name 的 VARCHAR(200)）。
 * 为什么不用 `@Size` 而是对齐实体列：不先拦住会在写库时变 500，而不是 400。
 */
export const FOOD_NAME_MAX = 200

/** 备注最长 500。 */
export const REMARK_MAX = 500

/** 热量下限 0（整数，后端字段是 Integer）。 */
export const CALORIES_MIN = 0

/**
 * 热量上限，挡掉误输入的六位数量级。
 * 与后端 Create/UpdateDietRecordRequest 的 @Max(100000) 是一对，改一处必须同步另一处。
 */
export const CALORIES_MAX = 100000

/**
 * 餐次取值 1-4。
 *
 * ⚠️ 目前**无代码引用**：餐次都从 MEAL_ORDER 里按下标取，天然不会越界，所以没地方需要它们。
 * 留着当后端 `@Min(1)/@Max(4)` 的镜像；改动时两边一起动。
 */
export const MEAL_TYPE_MIN = 1
export const MEAL_TYPE_MAX = 4

/**
 * 性别取值 0-2。
 *
 * ⚠️ 同 MEAL_TYPE_*：无引用（性别走 genderByIndex，越界已回落「不填」），仅作后端契约镜像。
 */
export const GENDER_MIN = 0
export const GENDER_MAX = 2

/**
 * 日期选择器可选下界（服务上线前的日期不受理）。
 *
 * 上界不再放常量：后端已拒绝 recordDate / endDate 晚于今天（返回 2002），
 * 所以两个页面的 Picker 都用 todayStr() 动态给出 end，
 * 以前写死 DATE_MAX = '2099-12-31' 会让用户查出「区间天数 29000 天」这种无意义结果。
 */
export const DATE_MIN = '2020-01-01'

/**
 * 单次查询允许的最大跨度（天，含首尾），镜像后端 DietRecordServiceImpl.MAX_QUERY_RANGE_DAYS。
 *
 * 为什么要同步到前端：后端接口没有分页，跨度直接等于一次返回的行数，
 * 超过会返回 2003。前端先在 Picker 上把开始日期的下界按结束日期倒推，
 * 用户就选不出注定被拒的区间，不必等一次网络往返再吃一个错误提示。
 */
export const MAX_QUERY_RANGE_DAYS = 366
