/**
 * 页面跳转。
 *
 * 把「带草稿跳编辑页」这件事收在一个函数里：打卡页和统计页都要打开编辑页，
 * 逻辑写两遍容易漏掉落草稿那一步，导致编辑页读到空记录。
 */
import Taro from '@tarojs/taro'

import { ROUTES } from '@/constants/route'
import type { DietRecordResponse } from '@/types/api'
import { removeStorage, STORAGE_KEYS, writeStorage } from '@/utils/storage'

/**
 * 打开打卡记录编辑页。
 *
 * @param record 传入则为编辑，先把整条记录落到本地草稿
 *               （后端只有区间查询，没有单条查询接口，编辑页无法自己拉取）
 */
export function openRecordEditor(record?: DietRecordResponse): void {
  if (!record) {
    Taro.navigateTo({ url: ROUTES.RECORD_EDIT }).catch((error) => {
      console.error('[nav] 打开记录新增页失败:', error)
    })
    return
  }

  writeStorage(STORAGE_KEYS.EDITING_RECORD, record)
  Taro.navigateTo({ url: `${ROUTES.RECORD_EDIT}?id=${record.id}` }).catch((error) => {
    console.error('[nav] 打开记录编辑页失败:', error)
    // 跳不过去（页面栈满、被拦截等）就把草稿清掉：
    // 留在本地的话，编辑页「读后即清」的时序可能赶不上这次写入，
    // 于是下一次进别的记录会读到一条 id 不匹配的脏草稿。
    removeStorage(STORAGE_KEYS.EDITING_RECORD)
  })
}
