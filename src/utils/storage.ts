/**
 * 本地存储读写。集中管理 key，避免各处手写字符串打错。
 */
import Taro from '@tarojs/taro'

/** 所有本地键名共用前缀，改一处就能整体改名，也不会与同小程序内其他项目的键撞车。 */
const STORAGE_KEY_PREFIX = 'fm'

export const STORAGE_KEYS = {
  /** 后端签发的 JWT 存放位（只存位名，不存任何凭证值） */
  TOKEN: `${STORAGE_KEY_PREFIX}_auth_session`,
  /** 用户资料缓存，用于头像昵称秒出 */
  USER_INFO: `${STORAGE_KEY_PREFIX}_user_profile`,
  /**
   * 编辑记录时传递草稿。
   * 后端没有单条查询接口（只有区间查询），编辑页拿不到原记录，
   * 所以由列表页整条写入、编辑页读出后立即清除。
   */
  EDITING_RECORD: `${STORAGE_KEY_PREFIX}_record_draft`
} as const

export function readStorage<T>(key: string, fallback: T): T {
  try {
    const value = Taro.getStorageSync(key)
    // getStorageSync 未命中时返回 ''，这里统一按“无值”处理
    if (value === '' || value == null) {
      return fallback
    }
    return value as T
  } catch (error) {
    console.error(`[storage] 读取 ${key} 失败:`, error)
    return fallback
  }
}

export function writeStorage(key: string, value: unknown): void {
  try {
    Taro.setStorageSync(key, value)
  } catch (error) {
    console.error(`[storage] 写入 ${key} 失败:`, error)
  }
}

export function removeStorage(key: string): void {
  try {
    Taro.removeStorageSync(key)
  } catch (error) {
    console.error(`[storage] 删除 ${key} 失败:`, error)
  }
}
