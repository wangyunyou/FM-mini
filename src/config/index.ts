/**
 * 运行时配置。
 *
 * 后端地址不写死在代码里，统一从 Taro 环境变量读取（见 .env.development / .env.production），
 * 换环境只改 env 文件，不动源码。
 */
import Taro from '@tarojs/taro'

/** 单次请求超时（毫秒）。小程序网络请求默认不超时，不给限制就会一直挂着。 */
export const REQUEST_TIMEOUT = 15000

/** 当前构建环境，dev 下才输出调试日志。 */
export const IS_DEV = process.env.NODE_ENV === 'development'

/**
 * 去掉结尾多余的 `/`。
 *
 * env 里很容易写成 `http://localhost:8080/`，而本层拼 URL 是 `${API_BASE_URL}${url}`
 * 且 url 自带前导 `/`，不剪就会拼出 `http://host//api/diet` 这种带空路径段的地址。
 */
function normalizeBaseUrl(raw: string | undefined): string {
  // 去掉结尾多余的 /，避免拼出 `//api/xxx` 这种双斜杠路径
  return (raw ?? '').trim().replace(/\/+$/, '')
}

/** FM 后端 API 根地址；未配置时为空串，由 assertApiConfigured() 拦下。 */
export const API_BASE_URL = normalizeBaseUrl(process.env.TARO_APP_API_BASE_URL)

// 同一个启动周期内只提示一次，避免多个并发请求各弹一遍
let hasNotifiedMissingConfig = false

/**
 * 校验后端地址是否已配置。
 *
 * @returns 已配置返回 true；未配置弹一次提示并返回 false，调用方据此中断请求
 */
export function assertApiConfigured(): boolean {
  if (API_BASE_URL) {
    return true
  }
  if (!hasNotifiedMissingConfig) {
    hasNotifiedMissingConfig = true
    Taro.showModal({
      title: '接口地址未配置',
      content: '请在 .env.development 中填写 TARO_APP_API_BASE_URL，然后重新编译。',
      showCancel: false
    }).catch((error) => {
      // 无页面栈等场景弹窗会失败，降级为日志，保证不静默吞掉问题
      console.error('[config] 接口地址未配置，且提示弹窗失败:', error)
    })
  }
  return false
}
