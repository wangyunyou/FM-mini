/**
 * 用户反馈封装：轻提示与确认弹窗。
 *
 * 规范要求「异常不吞」——所有失败路径都必须落到日志或用户提示之一，
 * 页面里不要各处手写 Taro.showToast，统一走这里。
 */
import Taro from '@tarojs/taro'

/** 短暂文字提示。 */
export function toast(title: string, icon: 'none' | 'success' | 'error' = 'none'): void {
  Taro.showToast({ title, icon, duration: 2000 }).catch((error) => {
    console.error('[feedback] 轻提示展示失败:', error)
  })
}

export function toastSuccess(title: string): void {
  toast(title, 'success')
}

/**
 * 二次确认。
 *
 * @param confirmText 确认按钮文案，破坏性操作用「删除」而不是「确定」
 */
export async function confirm(title: string, content: string, confirmText = '确定'): Promise<boolean> {
  try {
    const res = await Taro.showModal({ title, content, confirmText, confirmColor: '#e64340' })
    // 用户点取消或弹窗被系统关掉都算否，只有 confirm 为 true 才继续
    return Boolean(res?.confirm)
  } catch (error) {
    console.error('[feedback] 确认弹窗失败:', error)
    return false
  }
}
