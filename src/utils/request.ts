/**
 * 统一请求层。
 *
 * 职责：拼 baseUrl、注入 JWT、拆后端 Result 壳、把业务失败变成可捕获的 ApiError，
 * 以及在登录态失效时清 token 并跳回登录页。页面里只处理 data，不碰 code。
 */
import Taro from '@tarojs/taro'

import { API_BASE_URL, IS_DEV, REQUEST_TIMEOUT, assertApiConfigured } from '@/config'
import { ERROR_CODE, NETWORK_ERROR, isReloginCode } from '@/constants/error-code'
import { ROUTES } from '@/constants/route'
import type { ApiResult } from '@/types/api'
import { toast } from '@/utils/feedback'
import { readStorage, removeStorage, STORAGE_KEYS } from '@/utils/storage'

/** HTTP 方法。四个接口全用到，多一个就要同步后端 controller 的新方法。 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

export interface RequestOptions {
  /** 以 / 开头的接口路径，不含域名 */
  url: string
  method?: HttpMethod
  /** GET 会拼成 query，其余作为 JSON body */
  data?: Record<string, unknown>
  /** 是否携带 Authorization，默认 true；登录接口传 false */
  withToken?: boolean
  /** 默认 false：失败自动 toast；需要自己展示错误（如表单局部提示）时传 true */
  silent?: boolean
}

/**
 * 业务失败（含网络失败）。
 *
 * 页面里不需要判断 code 做分支（文案统一用 message toast）；
 * 例外是登录态失效，那条路径不由页面判，在 request 层内部已处理完。
 */
export class ApiError extends Error {
  /** 后端 ErrorCode 里的值；网络层失败时是 NETWORK_ERROR(-1)，HTTP 异常而无业务码时是状态码 */
  readonly code: number

  constructor(code: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.code = code
  }
}

/**
 * 重登锁的 TTL。
 *
 * reLaunch 正常都会 settle，但万一没 settle，单纯靠 finally 复位会把标志位锁死，
 * 后续所有 401 就再也跳不了登录页。给个过期时间当兼底，且不需要定时器。
 */
const REDIRECT_LOCK_TTL = 5000
let redirectLockedAt = 0

function isRedirectLocked(): boolean {
  return Date.now() - redirectLockedAt < REDIRECT_LOCK_TTL
}

/**
 * Taro.request 成功回调里的响应体（只声明本层用到的字段）。
 * 不直接引用 Taro 内部类型名，避免升级时类型路径变动连带改业务代码。
 */
interface RawResponse<T> {
  statusCode: number
  data: T
}

/**
 * 取 token。
 *
 * 为什么不用 utils/auth.ts 里同名的 getToken：那会形成 request → auth → api/user → request
 * 的循环依赖（auth 要调 loginByWechat，而它走的就是本层）。
 * 所以本层直接读 storage，auth 层的 getToken 只给业务代码用。
 */
function getToken(): string {
  const token = readStorage<string>(STORAGE_KEYS.TOKEN, '')
  return typeof token === 'string' ? token : ''
}

/** 拼 header。withToken=false 用于登录接口（此时手里最多只有一个过期 token，带上反而适得其反）。 */
function buildHeader(withToken: boolean): Record<string, string> {
  const header: Record<string, string> = { 'content-type': 'application/json' }
  const token = withToken ? getToken() : ''
  // 后端 AuthInterceptor 要求格式：Authorization: Bearer {token}
  if (token) {
    header.Authorization = `Bearer ${token}`
  }
  return header
}

/** 取当前页路径（不带前导 /，用来和 ROUTES 对齐后做比较）。失败时返回空串，宁可不跳也不要误跳。 */
function currentRoute(): string {
  try {
    const pages = Taro.getCurrentPages()
    const route = pages[pages.length - 1]?.route ?? ''
    return route.replace(/^\//, '')
  } catch (error) {
    console.error('[request] 读取当前页面失败:', error)
    return ''
  }
}

/**
 * 清登录态并回登录页。
 *
 * 不报错也不提示：走到这里说明失败提示已由 request 层弹过，
 * 再叠一条只会让用户看到两个堆叠的弹窗。
 */
function redirectToLogin(): void {
  const loginRoute = ROUTES.LOGIN.replace(/^\//, '')
  if (isRedirectLocked() || currentRoute() === loginRoute) {
    return
  }
  redirectLockedAt = Date.now()
  removeStorage(STORAGE_KEYS.TOKEN)
  removeStorage(STORAGE_KEYS.USER_INFO)
  Taro.reLaunch({ url: ROUTES.LOGIN }).catch((error) => {
    console.error('[request] 跳转登录页失败:', error)
  })
}

/**
 * 后端 Result 的 code 与 HTTP 状态码并存（AuthInterceptor 会同时返回 401），
 * 判断顺序：先看业务码是否要求重新登录，再看 HTTP 状态兜底。
 */
function ensureNotAuthFailure(httpStatus: number, code: number): void {
  if (isReloginCode(code) || httpStatus === ERROR_CODE.UNAUTHORIZED) {
    redirectToLogin()
  }
}

/** 请求日志只在 IS_DEV 打：接口响应体里有用户资料，不该往生产环境的控制台里刷。 */
function debugLog(...args: unknown[]): void {
  if (IS_DEV) {
    console.log(...args)
  }
}

/**
 * 发起请求并返回已拆壳的 data。
 *
 * @throws ApiError 网络失败、HTTP 异常或业务 code 非 200
 */
export async function request<T>(options: RequestOptions): Promise<T> {
  const { url, method = 'GET', data, withToken = true, silent = false } = options

  if (!assertApiConfigured()) {
    throw new ApiError(NETWORK_ERROR, '接口地址未配置')
  }

  const fullUrl = `${API_BASE_URL}${url}`
  debugLog('[request]', method, fullUrl, data ?? {})

  let response: RawResponse<ApiResult<T>>
  try {
    response = await Taro.request<ApiResult<T>>({
      url: fullUrl,
      method,
      data,
      timeout: REQUEST_TIMEOUT,
      header: buildHeader(withToken)
    })
  } catch (error) {
    // 断网、超时、域名未在小程序后台配置都会走到这里
    const detail = (error as { errMsg?: string })?.errMsg ?? '未知原因'
    console.error('[request] 网络异常', method, fullUrl, detail)
    const apiError = new ApiError(NETWORK_ERROR, `网络异常：${detail}`)
    if (!silent) {
      toast(apiError.message)
    }
    throw apiError
  }

  const { statusCode, data: body } = response
  // 网关/代理异常时返回的可能不是 Result 结构，先判空再取字段
  const code = typeof body?.code === 'number' ? body.code : 0
  const message = body?.message ?? ''

  if (code === ERROR_CODE.SUCCESS && statusCode >= 200 && statusCode < 300) {
    return body.data
  }

  ensureNotAuthFailure(statusCode, code)

  const fallbackMessage = statusCode >= 500 ? '服务异常，请稍后再试' : '请求失败'
  const apiError = new ApiError(code || statusCode, message || fallbackMessage)
  debugLog('[request] 失败', fullUrl, apiError.code, apiError.message)
  if (!silent) {
    toast(apiError.message)
  }
  throw apiError
}
