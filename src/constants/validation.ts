/**
 * 字段长度与取值上限，镜像后端 DTO 上的校验注解。
 *
 * 后端位置：src/main/java/com/wyy/fm/dto/
 * 前端先按同一套规则挡一遍，避免把注定 400 的请求发出去；改后端上限时必须同步这里。
 *
 * 边界（重要）：本文件只镜像**前端真正会拦的那几条**，不是后端注解的全量清单。
 * 后端有约束但这里没列的三项，约束由别的机制保证，不靠常量：
 * - avatarUrl 长度 512：本页没有头像上传入口（理由见 pages/profile/index.tsx 文件头）
 * - 餐次 1-4：值只能从 MEAL_ORDER 按下标取，天然越不了界
 * - 性别 0-2：走 genderByIndex，越界已回落「不填」
 * 历史上这三项也建过镜像常量，但全仓零引用（只写不读），已删；
 * 真的出现需要它们的入口时，再连着校验逻辑一起加，不要只加常量。
 */

/** 昵称最长 64（WxLoginRequest / UpdateUserRequest 的 @Size(max = 64)）。 */
export const NICKNAME_MAX = 64

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
