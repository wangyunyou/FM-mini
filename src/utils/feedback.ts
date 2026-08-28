/**
 * 用户反馈封装：轻提示与确认弹窗。
 *
 * 规范要求「异常不吞」——所有失败路径都必须落到日志或用户提示之一，
 * 页面里不要各处手写 Taro.showToast，统一走这里。
 */
import Taro from '@tarojs/taro'

/**
 * 轻提示。icon 默认 'none'：本项目的提示绝大多数是错误/提醒，
 * 绿打对钩会把“昵称太长了”看起来像成功了。
 */
export function toast(title: string, icon: 'none' | 'success' | 'error' = 'none'): void {
  Taro.showToast({ title, icon, duration: 2000 }).catch((error) => {
    // toast 自己失败只能记日志：已经是最后一道提示了，再弹一个 toast 报“弹不了 toast”没有意义
    console.error('[feedback] 轻提示展示失败:', error)
  })
}

/** 成功提示。与 toast 分开存在是为了让调用点的意图可读（toastSuccess vs toast）。 */
export function toastSuccess(title: string): void {
  toast(title, 'success')
}

/**
 * 二次确认。
 *
 * @param confirmText 确认按钮文案，破坏性操作用「删除」而不是「确定」
 * @returns 用户是否点了确认；**弹窗弹不起来时也算否**（宁可让用户多点一次，
 *          不可在异常路径上替用户做肯定回答）
 */
export async function confirm(title: string, content: string, confirmText = '确定'): Promise<boolean> {
  try {
    // confirmColor 写死红：本项目的确认框只用在删除与退出两类操作上，
    // 将来若出现「非破坏性确认」需把颜色改成参数，不要在这里直接复用
    const res = await Taro.showModal({ title, content, confirmText, confirmColor: '#e64340' })
    // 用户点取消或弹窗被系统关掉都算否，只有 confirm 为 true 才继续
    return Boolean(res?.confirm)
  } catch (error) {
    console.error('[feedback] 确认弹窗失败:', error)
    return false
  }
}
