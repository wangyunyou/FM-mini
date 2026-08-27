import { useState } from 'react'

import { Button, Input, Picker, View } from '@tarojs/components'
import Taro from '@tarojs/taro'

import { ROUTES } from '@/constants/route'
import { NICKNAME_MAX } from '@/constants/validation'
import { GENDER_OPTIONS, genderByIndex } from '@/constants/user'
import { login } from '@/utils/auth'
import { toast, toastSuccess } from '@/utils/feedback'

import './index.scss'

export default function LoginPage() {
  const [nickname, setNickname] = useState('')
  const [genderIndex, setGenderIndex] = useState(0)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit() {
    if (submitting) {
      // 微信登录接口会新建账号，重复提交会连点出多余请求，这里直接挡掉
      return
    }
    const trimmed = nickname.trim()
    if (trimmed.length > NICKNAME_MAX) {
      toast(`昵称最多 ${NICKNAME_MAX} 个字符`)
      return
    }

    setSubmitting(true)
    try {
      const result = await login({
        nickname: trimmed || undefined,
        gender: genderByIndex(genderIndex)
      })
      // 先跳转再提示，否则 reLaunch 会把手上的 toast 一起关掉
      await Taro.reLaunch({ url: ROUTES.HOME })
      toastSuccess(result?.isNewUser ? '欢迎加入 FM' : '登录成功')
    } catch (error) {
      const message = error instanceof Error ? error.message : '登录失败，请稍后再试'
      console.error('[login] 登录失败:', error)
      toast(message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <View className='fm-page login-page'>
      <View className='login-hero'>
        <View className='login-hero__title'>FM 饮食记录</View>
        <View className='login-hero__desc'>每天记一笔，热量和餐次都留得住</View>
      </View>

      <View className='fm-card'>
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
          <Picker
            mode='selector'
            range={GENDER_OPTIONS.map((option) => option.label)}
            value={genderIndex}
            onChange={(event) => setGenderIndex(Number(event.detail.value))}
          >
            <View className='fm-picker'>{GENDER_OPTIONS[genderIndex]?.label ?? '不填'}</View>
          </Picker>
        </View>
      </View>

      <Button
        className='fm-btn fm-btn--primary login-submit'
        disabled={submitting}
        loading={submitting}
        onClick={handleSubmit}
      >
        {submitting ? '登录中…' : '微信一键登录'}
      </Button>

      <View className='fm-weak login-tip'>
        登录仅用于创建你的饮食档案；本地联调需 FM 服务以 dev profile 启动（已开启微信登录 mock）。
      </View>
    </View>
  )
}
