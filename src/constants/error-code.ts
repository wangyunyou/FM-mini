/**
 * 后端业务错误码，镜像 `com.wyy.fm.common.ErrorCode`。
 *
 * 这里只列前端会分支处理的码；文案以后端返回的 message 为准，
 * 避免同一条错误在两处各写一遍、改一处漏一处。
 */
export const ERROR_CODE = {
  /* 以下六项是 HTTP 状态码同名的码，与后端 ErrorCode 里的业务码分属两套编号。
     为什么两套要放在一张表里：`AuthInterceptor` 会**同时**返回 HTTP 401 与 body `code: 401`，
     request 层两边都要判（见 utils/request.ts 的 ensureNotAuthFailure）。 */
  SUCCESS: 200,
  BAD_REQUEST: 400,
  /** 未登录 / token 失效：后端会返 HTTP 401 + body 401，前端清 token 重登 */
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  /** 服务端异常（包括参数转换失败没被接住的 500） */
  INTERNAL_ERROR: 500,
  /** 用户不存在 */
  USER_NOT_FOUND: 1001,
  /** 账号已被禁用 */
  USER_DISABLED: 1002,
  /** 无权操作该记录 */
  NO_PERMISSION: 1003,
  /** 饮食记录不存在 */
  DIET_RECORD_NOT_FOUND: 2001,
  /** 日期范围不合法（开始日期晚于结束日期 / 结束日期在未来） */
  DIET_DATE_INVALID: 2002,
  /** 查询跨度超限（接口无分页，跨度 = 一次返回的行数上限） */
  DIET_DATE_RANGE_TOO_LONG: 2003,
  /** 微信登录失败 */
  WX_LOGIN_FAILED: 3001,
  /** 微信接口调用异常 */
  WX_API_ERROR: 3002
} as const

/**
 * 需要重新登录的错误码集合，后续扩展只改这里。
 *
 * 为什么 1001/1002 也算重登：JWT 无状态，签发后拦不住，所以后端只能在**读时**校验
 * `users.status`；账号被禁用或删除后，手里的旧 token 依旧能过拦截器，
 * 到 Service 层才被挡下。对前端来说这跟 token 失效是同一件事：清登录态、回登录页。
 */
const RELOGIN_CODES: number[] = [
  ERROR_CODE.UNAUTHORIZED,
  ERROR_CODE.USER_NOT_FOUND,
  ERROR_CODE.USER_DISABLED
]

/** 网络层失败（断网/超时/域名未白名单），后端不会返回这个码，仅前端内部使用。 */
export const NETWORK_ERROR = -1

/**
 * 是否属于「该重新登录了」。
 *
 * 注意参数可以是 undefined：后端异常返回时 body 可能没 code，
 * 这里不能把 undefined 当 0 去查表，否则网络错误会被误判成登录失效。
 */
export function isReloginCode(code: number | undefined): boolean {
  return code != null && RELOGIN_CODES.includes(code)
}
