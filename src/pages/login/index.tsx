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

import { Button, Input, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'

import { ROUTES } from '@/constants/route'
import { NICKNAME_MAX } from '@/constants/validation'
import { GENDER_OPTIONS, genderByIndex } from '@/constants/user'
import { isFirstLogin, login } from '@/utils/auth'
import { toast, toastSuccess } from '@/utils/feedback'

import './index.scss'

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

  return (
    <View className='login-page'>
      {/* 头图：全仓唯一保留深绿渐变的页面（首屏没内容可遮，不担心大面积饱和色） */}
      <View className='login-hero'>
        <View className='login-hero__brand'>FM</View>
        <View className='login-hero__title'>FM 饮食记录</View>
        <View className='login-hero__desc'>每天记一笔，热量和餐次都留得住</View>
      </View>

      {/* 表单区：两项全部选填。不填则后端不写 nickname（实体可空无默认值），
          “我的”页会显示兜底文案「还没起名字」，登录后随时可改 */}
      <View className='login-body'>
        <View className='fm-card login-card'>
          <View className='fm-field'>
            <View className='fm-field__label'>昵称（选填，登录后也可修改）</View>
            <Input
              className='fm-input'
              maxlength={NICKNAME_MAX}
              placeholder='给自己起个名字'
              value={nickname}
              onInput={(event) => setNickname(event.detail.value)}
            />
          </View>

          <View className='fm-field'>
            <View className='fm-field__label'>性别（选填）</View>
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

        <Button
          className='fm-btn fm-btn--primary'
          disabled={submitting}
          loading={submitting}
          onClick={handleSubmit}
        >
          {submitting ? '登录中…' : '微信一键登录'}
        </Button>

        <View className='login-tip'>
          <Text className='login-tip__text'>
            登录仅用于创建你的饮食档案。本地联调需 FM 服务以 dev profile 启动，该环境已开启微信登录
            mock，没有真实 AppID 也能完整跑通。
          </Text>
        </View>
      </View>
    </View>
  )
}
