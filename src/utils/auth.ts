/**
 * 登录态管理。
 *
 * token 只存本地 storage，失效判断交给后端：任何接口返回 401 时由 request 层统一清 token 并跳登录。
 */
import Taro from '@tarojs/taro'

import { loginByWechat } from '@/api/user'
import { ROUTES } from '@/constants/route'
import type { LoginResponse, UserInfoResponse } from '@/types/api'
import { toast } from '@/utils/feedback'
import { readStorage, removeStorage, STORAGE_KEYS, writeStorage } from '@/utils/storage'

/** 从 storage 取 token，取不到返回空串。 */
export function getToken(): string {
  const token = readStorage<string>(STORAGE_KEYS.TOKEN, '')
  return typeof token === 'string' ? token : ''
}

/**
 * 本地是否已有登录态。
 *
 * 只代表「存过 token」，不代表 token 仍有效——有效性由后端 401 判定。
 */
export function hasLocalSession(): boolean {
  return Boolean(getToken())
}

export function getCachedUserInfo(): UserInfoResponse | null {
  const info = readStorage<UserInfoResponse | ''>(STORAGE_KEYS.USER_INFO, '')
  return info ? info : null
}

export function cacheUserInfo(info: UserInfoResponse): void {
  writeStorage(STORAGE_KEYS.USER_INFO, info)
}

/** 取微信临时凭证 code；失败（用户拒绝、无网络）时抛错交给调用方提示。 */
async function fetchWxCode(): Promise<string> {
  const res = await Taro.login()
  const code = res?.code ?? ''
  if (!code) {
    throw new Error('微信未返回登录凭证，请稍后重试')
  }
  return code
}

/**
 * 完整登录流程：wx.login 取 code → 后端换 JWT → 落盘。
 *
 * @param profile 可选的初始昵称/性别，登录时一并提交，省一次编辑请求
 */
export async function login(profile?: {
  nickname?: string
  gender?: number
}): Promise<LoginResponse> {
  const code = await fetchWxCode()
  const data = await loginByWechat({ code, ...profile }, { silent: true })
  if (!data?.token) {
    // 后端异常返回空 token 时不能当成功处理，否则后续请求全部 401
    throw new Error('登录失败：服务端未返回 token')
  }
  writeStorage(STORAGE_KEYS.TOKEN, data.token)
  return data
}

/**
 * 保证处于登录态：已有 token 直接放行，否则走一次静默登录。
 *
 * @returns 是否已登录，false 时错误提示已在本函数内弹出
 */
export async function ensureLoggedIn(): Promise<boolean> {
  if (hasLocalSession()) {
    return true
  }
  try {
    await login()
    return true
  } catch (error) {
    const message = error instanceof Error ? error.message : '登录失败'
    console.error('[auth] 静默登录失败:', error)
    toast(message)
    return false
  }
}

/** 清本地登录态并回到登录页（后端无状态，不需要调登出接口）。 */
export function logout(): void {
  removeStorage(STORAGE_KEYS.TOKEN)
  removeStorage(STORAGE_KEYS.USER_INFO)
  removeStorage(STORAGE_KEYS.EDITING_RECORD)
  Taro.reLaunch({ url: ROUTES.LOGIN }).catch((error) => {
    console.error('[auth] 退出后跳转登录页失败:', error)
  })
}
