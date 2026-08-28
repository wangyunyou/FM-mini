/**
 * 接口出入参类型，字段与 FM 后端 DTO 一一对应（均为全字符串/全数字，不做隐式转换）。
 *
 * 后端源码位置：`../FM/src/main/java/com/wyy/fm/dto/`
 * 日期字段后端是 java.time.LocalDate，序列化为 'yyyy-MM-dd' 字符串。
 *
 * 本文件是全仓注释密度最高的地方（约 44%），因为它在后端有直接同构物：
 * 那边一个 DTO 字段一份 Javadoc，这边就要一个字段一行说明。
 * 新增字段时两边同改，并保留「哪个接口、后端类叫什么」这两条坐标。
 */

/** 后端统一响应壳 `com.wyy.fm.common.Result`。 */
export interface ApiResult<T> {
  /** 业务码，200 为成功；失败时为 ErrorCode 里的值 */
  code: number
  /** 后端写给用户看的文案。前端直接 toast 它，不再自己拼（见 constants/error-code.ts 的文件头） */
  message: string
  /** 真正的载荷。失败时后端给 null，所以拆壳后要判空再用 */
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

/**
 * POST /api/user/wx-login 响应 data（后端 LoginResponse）。
 *
 * 登录后续请求要用的是 token，其余字段只是顺手返回来让登录页少调一次 /api/user/info。
 */
export interface LoginResponse {
  /** JWT。后端异常时可能缺失，auth.login() 会卡掉这种“成功但没 token”的响应 */
  token: string
  userId: number
  nickname: string
  avatarUrl: string
  /** true 表示本次登录新建了账号——这个值才是权威的（请求里那个 isNewUser 只是对账提示） */
  isNewUser: boolean
}

/**
 * GET /api/user/info 响应 data（后端 UserInfoResponse）。
 *
 * 后端刻意不返回 openid 等敏感字段，所以页面上能展示的只有这里有的东西；
 * 「我的」页拿的 id 就是 users.id（不是 openid，见 pages/profile/index.tsx 的注）。
 */
export interface UserInfoResponse {
  /** users.id，自增主键 */
  id: number
  /** 可为 null：首登没填昵称时后端就是空的，渲染前要兜底文案 */
  nickname: string
  avatarUrl: string
  /** 目前没有任何入口能写这个字段，后端总是返回 null，所以页面只在有值时才渲染它 */
  phone: string
  /** 0 未知 / 1 男 / 2 女，见 constants/user.ts */
  gender: number
  /** 0 正常 / 1 禁用。后端已拦住禁用账号（返回 1002），这里主要用于前端兜底判定 */
  status?: number
}

/**
 * PUT /api/user/info 请求体，字段全部可选，只更新传了的。
 *
 * 置空口径：不传 / null = 不改；nickname / avatarUrl 传空串会被后端 @NotBlankIfPresent 拒成 400，
 * 所以昵称只能用新值覆盖，不能刷成空。
 */
export interface UpdateUserRequest {
  /** 只能新值覆盖，传空串会 400（见上方置空口径） */
  nickname?: string
  avatarUrl?: string
  /** 0 / 1 / 2 */
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
 *
 * 没得 recordDate 这个字段不是漏写：后端更新接口不接受改日期，
 * 所以编辑页把日期锁住（见 pages/record-edit/index.tsx 的 fm-picker--locked）。
 */
export interface UpdateDietRecordRequest {
  /** 1-4，见 constants/meal.ts */
  mealType?: number
  /** 不允许刷成空，传空串或纯空白都是 400 */
  foodName?: string
  /** 整数；传小数后端会静默截断（见 CreateDietRecordRequest 同名字段的说明） */
  calories?: number
  /** 空串 = 清空，不传 = 不改；这是备注唯一的区分办法 */
  remark?: string
}

/**
 * GET /api/diet/query 查询参数。
 *
 * 这一个接口同时养着首页、统计页与 “本周/本月/近 7 天/自定义” 全部查询，
 * 跨度上限 MAX_QUERY_RANGE_DAYS 天且**无分页**，所以区间给大了不会变慢、只会直接被拒（2003）。
 */
export interface QueryDietRecordRequest {
  /** yyyy-MM-dd，必填。晚于 endDate 会 2002 */
  startDate: string
  /**
   * yyyy-MM-dd，必填且不早于 startDate。
   *
   * 晚于今天**不报错**：后端收敛到今天再查（历史上这里硬拦过，
   * 周五查「本周」直接 2002 → 首页整个 Promise.all reject、今日记录被清空）。
   * 前端 utils/date.ts 的 clampEndToToday 也各自夹一道，让「区间天数」与实际覆盖天数对上。
   */
  endDate: string
}

/**
 * 一条饮食记录（POST/PUT/GET 响应里都是这个结构，后端 DietRecordResponse）。
 *
 * 类型上这批字段都声明为必传（非 ?），但真实接口对老数据/异常分支可能给 null，
 * 所以消费处一律还带 `?? []` / `?? 0` / 判空——这不是多余，是上一轮真实修过的 NPE。
 */
export interface DietRecordResponse {
  /** 自增主键，也是 PUT/DELETE 的路径参数 */
  id: number
  /** yyyy-MM-dd */
  recordDate: string
  /** 1 早餐 / 2 午餐 / 3 晚餐 / 4 加餐，见 constants/meal.ts */
  mealType: number
  /** 后端已翻译好的餐次中文名；mealType 越界时给「未知」，所以展示优先用它 */
  mealTypeName: string
  foodName: string
  /** 整数 kcal（后端是 Integer） */
  calories: number
  /** 备注。库里归一存 NULL（空串与纯空白都写不进去），所以这里是 null 而不是 '' */
  remark: string
  /** yyyy-MM-ddTHH:mm:ss（java.time.LocalDateTime 的默认序列化，与 recordDate 不同构） */
  createdAt: string
}

/**
 * GET /api/diet/query 响应 data。
 *
 * caloriesByMeal 的 key 是餐次中文名（后端 DietRecordResponse.getMealTypeName），
 * 且只包含区间内出现过的餐次，取值前必须判空。
 */
export interface DietStatisticsResponse {
  /** 区间内所有记录热量求和 */
  totalCalories: number
  /** key 是**餐次中文名**（不是 1/2/3/4），且只含区间内出现过的餐次 → 取值必须 `?? 0` */
  caloriesByMeal: Record<string, number>
  /** 区间内的记录条数 */
  recordCount: number
  /**
   * 日均 kcal，分母是**有记录的天数**（不是区间总天数）。
   *
   * 与首页「本周日均」是两套故意不同的口径（那边的分母是本周已过天数，
   * 见 AGENTS.md 同步点第 5 条），不要把两边“顺手统一”。
   */
  avgCaloriesPerDay: number
  /** 明细列表，无分页（所以跨度受 MAX_QUERY_RANGE_DAYS 约束） */
  records: DietRecordResponse[]
}
