/**
 * 页面跳转。
 *
 * 把「带草稿跳编辑页」这件事收在一个函数里：打卡页和统计页都要打开编辑页，
 * 逻辑写两遍容易漏掉落草稿那一步，导致编辑页读到空记录。
 */
import Taro from '@tarojs/taro'

import { ROUTES } from '@/constants/route'
import type { DietRecordResponse } from '@/types/api'
import { STORAGE_KEYS, writeStorage } from '@/utils/storage'

/**
 * 打开打卡记录编辑页。
 *
 * @param record 传入则为编辑，先把整条记录落到本地草稿
 *               （后端只有区间查询，没有单条查询接口，编辑页无法自己拉取）
 */
export function openRecordEditor(record?: DietRecordResponse): void {
  if (record) {
    writeStorage(STORAGE_KEYS.EDITING_RECORD, record)
  }
  const url = record ? `${ROUTES.RECORD_EDIT}?id=${record.id}` : ROUTES.RECORD_EDIT
  Taro.navigateTo({ url }).catch((error) => {
    console.error('[nav] 打开记录编辑页失败:', error)
  })
}
