/** 用户相关接口，对应后端 UserController（/api/user）。 */
import type {
  LoginResponse,
  UpdateUserRequest,
  UserInfoResponse,
  WxLoginRequest
} from '@/types/api'
import type { RequestOptions } from '@/utils/request'
import { request } from '@/utils/request'

/**
 * 微信登录换取 JWT。
 * 免鉴权接口（此时还没有 token），所以 withToken: false。
 *
 * @param options 透传 silent 等请求选项；静默登录时需要自己控提示，默认静默
 */
export function loginByWechat(
  payload: WxLoginRequest,
  options?: Pick<RequestOptions, 'silent' | 'withToken'>
): Promise<LoginResponse> {
  return request<LoginResponse>({
    url: '/api/user/wx-login',
    method: 'POST',
    data: { ...payload },
    ...options,
    // 登录接口永远不能带旧 token：过期 token 会让后端直接 401，陷入重登循环
    withToken: false
  })
}

/** 获取当前登录用户资料。 */
export function fetchUserInfo(): Promise<UserInfoResponse> {
  return request<UserInfoResponse>({ url: '/api/user/info' })
}

/** 更新用户资料，只传需要改的字段。 */
export function updateUserInfo(payload: UpdateUserRequest): Promise<void> {
  return request<void>({ url: '/api/user/info', method: 'PUT', data: { ...payload } })
}
