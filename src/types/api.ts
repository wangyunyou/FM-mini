/**
 * 接口出入参类型，字段与 FM 后端 DTO 一一对应（均为全字符串/全数字，不做隐式转换）。
 *
 * 后端源码位置：src/main/java/com/wyy/fm/dto/
 * 日期字段后端是 java.time.LocalDate，序列化为 'yyyy-MM-dd' 字符串。
 */

/** 后端统一响应壳 `com.wyy.fm.common.Result`。 */
export interface ApiResult<T> {
  /** 业务码，200 为成功；失败时为 ErrorCode 里的值 */
  code: number
  message: string
  data: T
}

/** POST /api/user/wx-login 请求体。除 code 外均为可选的初始化资料。 */
export interface WxLoginRequest {
  /** wx.login 换取的临时凭证，最长 256 */
  code: string
  nickname?: string
  avatarUrl?: string
  /** 0 未知 / 1 男 / 2 女 */
  gender?: number
}

/** POST /api/user/wx-login 响应 data。 */
export interface LoginResponse {
  token: string
  userId: number
  nickname: string
  avatarUrl: string
  /** true 表示本次登录新建了账号 */
  isNewUser: boolean
}

/** GET /api/user/info 响应 data。 */
export interface UserInfoResponse {
  id: number
  nickname: string
  avatarUrl: string
  phone: string
  gender: number
}

/** PUT /api/user/info 请求体，字段全部可选，只更新传了的。 */
export interface UpdateUserRequest {
  nickname?: string
  avatarUrl?: string
  gender?: number
}

/** POST /api/diet 请求体。 */
export interface CreateDietRecordRequest {
  /** yyyy-MM-dd */
  recordDate: string
  /** 1-4，见 constants/meal.ts */
  mealType: number
  /** 必填，最长 200 */
  foodName: string
  /** 必填，>= 0 */
  calories: number
  /** 最长 500 */
  remark?: string
}

/** PUT /api/diet/{id} 请求体，字段可选，只更新传了的。 */
export interface UpdateDietRecordRequest {
  mealType?: number
  foodName?: string
  calories?: number
  remark?: string
}

/** GET /api/diet/query 查询参数。 */
export interface QueryDietRecordRequest {
  /** yyyy-MM-dd，必填 */
  startDate: string
  /** yyyy-MM-dd，必填且不早于 startDate */
  endDate: string
}

/** 饮食记录，POST/PUT/GET 响应里的同一种结构。 */
export interface DietRecordResponse {
  id: number
  recordDate: string
  mealType: number
  /** 后端已翻译好的餐次中文名 */
  mealTypeName: string
  foodName: string
  calories: number
  remark: string
  /** yyyy-MM-ddTHH:mm:ss */
  createdAt: string
}

/**
 * GET /api/diet/query 响应 data。
 *
 * caloriesByMeal 的 key 是餐次中文名（后端 DietRecordResponse.getMealTypeName），
 * 且只包含区间内出现过的餐次，取值前必须判空。
 */
export interface DietStatisticsResponse {
  totalCalories: number
  caloriesByMeal: Record<string, number>
  recordCount: number
  avgCaloriesPerDay: number
  records: DietRecordResponse[]
}
