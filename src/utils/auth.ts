/**
 * 登录态管理。
 *
 * token 只存本地 storage，失效判断交给后端：任何接口返回 401 时由 request 层统一清 token 并跳登录。
 *
 * 仍保留本文件而不是把逻辑放进 api/：登录这条链上有三个互相纠缠的约定
 * （首登判据、静默登录、缓存秒开），收在一处才看得完。
 */
import Taro from '@tarojs/taro'

import { loginByWechat } from '@/api/user'
import { ROUTES } from '@/constants/route'
import type { LoginResponse, UserInfoResponse, WxLoginRequest } from '@/types/api'

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

/**
 * 是否首次登录（本地从未存过 token）。
 *
 * 为什么要把这个判断收在这里：后端的 nickname/avatarUrl/gender 只在首次注册时受理，
 * 而微信现在只能拿到固定默认昵称（"微信用户"）。如果每次登录都当作新用户上报，
 * 用户自己在「我的」页改过的名字会被刷回默认值（实测复现过）。
 * 必须在写入新 token 之前调用，否则永远返回 false。
 */
export function isFirstLogin(): boolean {
  return !hasLocalSession()
}

/**
 * 读缓存里的用户资料（没缓存返回 null，不抛错）。
 *
 * 作用是秒开：「我的」页直接渲染缓存再等网络覆盖，
 * 否则切过去要空一个 RTT，体感像页面坏了。
 * 代价是可能短暂展示旧值（他在另一台设备上改过昵称），所以缓存只做初始值。
 */
export function getCachedUserInfo(): UserInfoResponse | null {
  const info = readStorage<UserInfoResponse | ''>(STORAGE_KEYS.USER_INFO, '')
  return info ? info : null
}

/** 写用户资料缓存。调用时机只有一个：fetchUserInfo 拿到新数据后。 */
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
 * @param profile 可选的初始资料（昵称/头像/性别）与 isNewUser 标记，登录时一并提交，省一次编辑请求。
 *   类型直接复用后端的 WxLoginRequest（去掉 code），避免这里另写一份字段清单跟 DTO 走偏。
 */
export async function login(
  profile?: Omit<WxLoginRequest, 'code'>
): Promise<LoginResponse> {
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
