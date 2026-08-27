/**
 * 后端业务错误码，镜像 `com.wyy.fm.common.ErrorCode`。
 *
 * 这里只列前端会分支处理的码；文案以后端返回的 message 为准，
 * 避免同一条错误在两处各写一遍、改一处漏一处。
 */
export const ERROR_CODE = {
  SUCCESS: 200,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INTERNAL_ERROR: 500,
  /** 用户不存在 */
  USER_NOT_FOUND: 1001,
  /** 账号已被禁用 */
  USER_DISABLED: 1002,
  /** 无权操作该记录 */
  NO_PERMISSION: 1003,
  /** 饮食记录不存在 */
  DIET_RECORD_NOT_FOUND: 2001,
  /** 日期范围不合法（开始日期晚于结束日期） */
  DIET_DATE_INVALID: 2002,
  /** 微信登录失败 */
  WX_LOGIN_FAILED: 3001,
  /** 微信接口调用异常 */
  WX_API_ERROR: 3002
} as const

/** 需要重新登录的错误码集合，后续扩展只改这里。 */
const RELOGIN_CODES: number[] = [
  ERROR_CODE.UNAUTHORIZED,
  ERROR_CODE.USER_NOT_FOUND,
  ERROR_CODE.USER_DISABLED
]

/** 网络层失败（断网/超时/域名未白名单），后端不会返回这个码，仅前端内部使用。 */
export const NETWORK_ERROR = -1

export function isReloginCode(code: number | undefined): boolean {
  return code != null && RELOGIN_CODES.includes(code)
}
