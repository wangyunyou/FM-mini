/**
 * 登录页。
 *
 * 职责：拿微信临时凭证 code 换 JWT（POST /api/user/wx-login）。
 * 进页途径只有两种：app.ts 启动时本地无 token 卡进来，或 request 层遇到 401/1002 清完登录态踢回来。
 *
 * 为什么昵称与性别放在这里而不是登录后再填：微信拿不到真实昵称（只有默认值“微信用户”），
 * 想要真实名字只能让用户自己填；一步做完比开一个引导流程便宜，而且后端只在本次真的建号时才受理这些字段。
 * 所以：选填、可跳过，之后在「我的」页改。
 *
 * 两个容易改坏的地方：
 * 1. isFirstLogin() 必须在 login() 写入新 token **之前**调（否则永远是 false）；
 * 2. 先 reLaunch 再 toast，反过来会被跳转关掉。
 *
 * 状态与触发链（本页是唯一不依赖已登录态的页面）：
 *   nickname / genderIndex → 表单两项，全选填；genderIndex 是 chips 下标而不是性别值
 *   submitting → 重入闸门（微信登录会建号，连点就是多余请求）
 *   入口：只有一个 handleSubmit → auth.login() → POST /api/user/wx-login
 *   成功后 reLaunch HOME：reLaunch 会关掉所有页面再打开目标，页面栈里只剩首页，
 *   不存在“划一下又回到登录页”的残留（本页自己也是被 reLaunch 送进来的）
 */
import { useState } from 'react'

import { Button, Image, Input, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'

import { ROUTES } from '@/constants/route'
import { NICKNAME_MAX } from '@/constants/validation'
import { GENDER_OPTIONS, genderByIndex } from '@/constants/user'
import { isFirstLogin, login } from '@/utils/auth'
import { toast, toastSuccess } from '@/utils/feedback'

import './index.scss'

/** 微信官方双气泡 Logo（SVG Data URI，高清矢量无网络请求）。 */
const WECHAT_ICON_SVG =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="%23ffffff"><path d="M9.5 3C5.36 3 2 5.91 2 9.5c0 1.98.98 3.75 2.53 4.95L3.8 17.5l3.4-1.7c.73.2 1.5.3 2.3.3.4 0 .78-.03 1.16-.08A6.87 6.87 0 0 1 10.5 14c0-3.87 3.36-7 7.5-7 .34 0 .67.02 1 .07C17.75 4.7 13.9 3 9.5 3zm-2.5 4.5a1 1 0 1 1 0 2 1 1 0 0 1 0-2zm4.5 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2zm6.5 2.5c-3.31 0-6 2.46-6 5.5s2.69 5.5 6 5.5c.62 0 1.22-.09 1.78-.25l2.72 1.36-.61-2.43C22.21 18.68 23 17.18 23 15.5c0-3.04-2.69-5.5-6-5.5zm-2 3.5a.8.8 0 1 1 0 1.6.8.8 0 0 1 0-1.6zm3.8 0a.8.8 0 1 1 0 1.6.8.8 0 0 1 0-1.6z"/></svg>'


export default function LoginPage() {
  /** 昵称输入框当前值（未经 trim） */
  const [nickname, setNickname] = useState('')
  /** chips 的下标，不是性别值；提交时由 genderByIndex 转（区别见 constants/user.ts） */
  const [genderIndex, setGenderIndex] = useState(0)
  /** 提交中：同时用作按钮 disabled/loading 与重复提交闸门 */
  const [submitting, setSubmitting] = useState(false)

  /**
   * 提交登录。
   *
   * 失败不弹“登录失败”了事：后端给什么 message 就展示什么（封号、微信接口异常、
   * mock 未开都长得不一样），拿不到可读文案时才回落到默认提示。
   */
  async function handleSubmit() {
    if (submitting) {
      // 微信登录接口会新建账号，重复提交会连点出多余请求，这里直接挡掉
      return
    }
    const trimmed = nickname.trim()
    // 本地先卡长度：Input 已有 maxlength，但粘贴与 mock 接口能绕过，写一半再被后端 400 很难看
    if (trimmed.length > NICKNAME_MAX) {
      toast(`昵称最多 ${NICKNAME_MAX} 个字符`)
      return
    }

    setSubmitting(true)
    try {
      // 必须在 login() 写入新 token 之前问「是不是首登」，否则永远是 false。
      // 注意这只是给后端对账的提示：后端以「自己有没有真的建号」为准决定是否写入昵称，
      // 因为 token 被清（401/1002/退出登录）后，老用户重登时这里也会是 true。
      const isNewUser = isFirstLogin()
      const result = await login({
        // 空昵称不发。后端对这个字段只有 @Size(max=64)，Service 层又走 trimToNull，
        // 所以传 '' 与不传结果一样（都是不写）；不发只是少传一个没意义的值，
        // 顺便让日志里的请求体干净一点
        nickname: trimmed || undefined,
        gender: genderByIndex(genderIndex),
        isNewUser
      })
      // 先跳转再提示，否则 reLaunch 会把手上的 toast 一起关掉
      await Taro.reLaunch({ url: ROUTES.HOME })
      toastSuccess(result?.isNewUser ? '欢迎加入 FM' : '登录成功')
    } catch (error) {
      // ApiError 带 message（后端给的可读文案）；非 ApiError 的异常（wx.login 被拒）
      // 的 message 是英文技术词，给用户看只能回落到默认提示
      const message = error instanceof Error ? error.message : '登录失败，请稍后再试'
      console.error('[login] 登录失败:', error)
      toast(message)
    } finally {
      setSubmitting(false)
    }
  }

  /** 点击用户协议展示合规说明 */
  function handleShowAgreement() {
    toast('FM 严格保障您的个人健康档案与数据安全')
  }

  /** 点击隐私政策展示合规说明 */
  function handleShowPrivacy() {
    toast('饮食记录仅在云端独立加密存储，绝不泄露')
  }

  return (
    <View className='login-page'>
      {/* 顶部柔和的健康绿微光氛围 */}
      <View className='login-glow' />

      <View className='login-container'>
        {/* 品牌标识区：清新图标 + 标题 + 品牌 Slogan */}
        <View className='login-brand'>
          <View className='login-brand__logo'>
            <Text className='login-brand__icon'>🥗</Text>
          </View>
          <View className='login-brand__title'>FM 饮食记录</View>
          <View className='login-brand__desc'>轻简记录每一餐，遇见更健康的自己</View>
        </View>

        {/* 选填资料卡片：设计轻量温和，用户可填可不填 */}
        <View className='login-card'>
          <View className='login-card__header'>
            <Text className='login-card__title'>个人资料预设</Text>
            <Text className='login-card__subtitle'>选填 · 随时可在「我的」页面修改</Text>
          </View>

          <View className='login-field'>
            <View className='login-field__label'>昵称</View>
            <Input
              className='login-input'
              maxlength={NICKNAME_MAX}
              placeholder='微信用户（点击可自定义）'
              placeholderClass='login-input__placeholder'
              value={nickname}
              onInput={(event) => setNickname(event.detail.value)}
            />
          </View>

          <View className='login-field'>
            <View className='login-field__label'>性别</View>
            <View className='fm-chips'>
              {/* 用下标而不是 value 做选中态：chips 本身是 GENDER_OPTIONS 遍历出来的，
                  下标就是“第几个”，与 state 的存法一致；存 value 反而多一道换算 */}
              {GENDER_OPTIONS.map((option, index) => (
                <View
                  key={option.value}
                  className={`fm-chip${index === genderIndex ? ' fm-chip--active' : ''}`}
                  onClick={() => setGenderIndex(index)}
                >
                  {option.label}
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* 主操作区：高质感微信一键登录按钮 */}
        <View className='login-action'>
          <Button
            className='login-btn-wechat'
            disabled={submitting}
            loading={submitting}
            onClick={handleSubmit}
          >
            {!submitting && (
              <Image className='login-btn-wechat__icon' src={WECHAT_ICON_SVG} />
            )}
            <Text className='login-btn-wechat__text'>
              {submitting ? '安全登录中…' : '微信一键快捷登录'}
            </Text>
          </Button>
        </View>

        {/* 底部协议与保障声明 */}
        <View className='login-footer'>
          <Text className='login-footer__text'>登录即代表同意</Text>
          <Text className='login-footer__link' onClick={handleShowAgreement}>
            《用户服务协议》
          </Text>
          <Text className='login-footer__text'>与</Text>
          <Text className='login-footer__link' onClick={handleShowPrivacy}>
            《隐私保护政策》
          </Text>
        </View>
      </View>
    </View>
  )
}
