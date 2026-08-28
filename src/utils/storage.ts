/**
 * 本地存储读写。集中管理 key，避免各处手写字符串打错。
 *
 * 本地只存三类东西：JWT、用户资料缓存、编辑页草稿。
 * 业务数据（饮食记录）一律不落本地：后端是唯一数据源，
 * 做离线缓存就要面对增量同步与脏数据，本项目没这个需求。
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

/**
 * 读一个键：失败或缺失都回落到 fallback，不抛错。
 *
 * 为什么不让调用方自己 catch：storage 在小程序里是同步 API，但会因配额满、
 * 键不存在、平台差异报错；一个读缓存的动作不该导致页面白屏。脏活包在这一层，
 * 调用方只需面对「有值 / 没值」两种情况。
 */
export function readStorage<T>(key: string, fallback: T): T {
  try {
    const value = Taro.getStorageSync(key)
    // getStorageSync 未命中时返回 ''，这里统一按“无值”处理
    // 推论：不要把 '' 当合法值写入，否则“存了空串”与“没存过”分不开
    if (value === '' || value == null) {
      return fallback
    }
    return value as T
  } catch (error) {
    console.error(`[storage] 读取 ${key} 失败:`, error)
    return fallback
  }
}

/**
 * 写一个键。失败（配额满）只记日志不抛。
 *
 * 三个键里只有 EDITING_RECORD 丢了真的会坏事，而那条链路在编辑页有
 * 「数据已失效」兜底页（见 pages/record-edit/index.tsx 的 draftMissing），
 * 所以不需要把异常透到 UI 层。
 */
export function writeStorage(key: string, value: unknown): void {
  try {
    Taro.setStorageSync(key, value)
  } catch (error) {
    console.error(`[storage] 写入 ${key} 失败:`, error)
  }
}

/** 删一个键（幂等：键不存在也不报错）。 */
export function removeStorage(key: string): void {
  try {
    Taro.removeStorageSync(key)
  } catch (error) {
    console.error(`[storage] 删除 ${key} 失败:`, error)
  }
}
