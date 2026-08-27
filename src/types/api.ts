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

/**
 * POST /api/user/wx-login 请求体。除 code 外均为可选的初始化资料。
 *
 * 后端口径（见 FM-service README「几个容易踩的接口口径」）：
 * nickname / avatarUrl / gender 只在**服务端本次真的新建账号**时被写入；
 * 老用户重登一律忽略（微信现在只能给出固定默认昵称"微信用户"，照收会刷掉「我的」页里改的名字）。
 * 所以下面的 isNewUser 只是给后端对账的提示，不是判据；改资料请走 UpdateUserRequest。
 */
export interface WxLoginRequest {
  /** wx.login 换取的临时凭证，最长 256 */
  code: string
  nickname?: string
  avatarUrl?: string
  /** 0 未知 / 1 男 / 2 女 */
  gender?: number
  /** 客户端自报「本次是否首次注册」；后端不采信，仅与自己算的结果对账。响应体里的才是权威值 */
  isNewUser?: boolean
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
  /** 0 正常 / 1 禁用。后端已拦住禁用账号，这里主要用于前端兜底判定 */
  status?: number
}

/**
 * PUT /api/user/info 请求体，字段全部可选，只更新传了的。
 *
 * 置空口径：不传 / null = 不改；nickname / avatarUrl 传空串会被后端 @NotBlankIfPresent 拒成 400，
 * 所以昵称只能用新值覆盖，不能刷成空。
 */
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

/**
 * PUT /api/diet/{id} 请求体，字段可选，只更新传了的。
 *
 * 置空口径（与后端 UpdateDietRecordRequest 注释一一对应）：
 * - 不传 / null  → 不改该字段
 * - remark 传 ""  → 清空备注（库里归一存 NULL）
 * - foodName 传 ""/纯空白 → 400
 * 注意：JSON.stringify 会丢掉值为 undefined 的键，所以「清空」必须显式发空串。
 */
export interface UpdateDietRecordRequest {
  /** 后端更新接口不接受 recordDate，改日期只能删除重建 */
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
