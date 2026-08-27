import { useCallback, useRef, useState } from 'react'

import { Button, Image, Input, Text, View } from '@tarojs/components'
import { useDidShow } from '@tarojs/taro'

import { fetchUserInfo, updateUserInfo } from '@/api/user'
import { GENDER_OPTIONS, genderByIndex, genderLabel } from '@/constants/user'
import { NICKNAME_MAX } from '@/constants/validation'
import type { UserInfoResponse } from '@/types/api'
import { cacheUserInfo, ensureLoggedIn, getCachedUserInfo, logout } from '@/utils/auth'
import { confirm, toast, toastSuccess } from '@/utils/feedback'

import './index.scss'

/** 昵称兜底文案（后端 nickname 可为 null：首登没填昵称时就是空的）。 */
const NICKNAME_PLACEHOLDER = '还没起名字'

/**
 * 由昵称派生一个头像占位字。
 *
 * 为什么不做真实头像上传：小程序没有免费的图床，`wx.chooseMedia` 拿到的临时路径
 * 会过期，要落地必须自己加文件存储；这一步先用首字占位，字段（avatarUrl）后端已留好。
 */
function avatarLetter(nickname: string | undefined | null): string {
  const name = (nickname ?? '').trim()
  return name ? name.slice(0, 1).toUpperCase() : 'F'
}

export default function ProfilePage() {
  /** 服务端资料（渲染用） */
  const [info, setInfo] = useState<UserInfoResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  /** 表单值 */
  const [nickname, setNickname] = useState('')
  const [genderIndex, setGenderIndex] = useState(0)
  /**
   * 表单是否已被用户动过。
   *
   * 为什么需要：load() 是异步的，拉完才回填表单。若用户已经改到一半，
   * 晚到的回填会把输入覆盖掉，所以「动过就不回填」。
   */
  const dirtyRef = useRef(false)

  /**
   * 请求序号：切 tab 反复触发 useDidShow 时，只接受最后一次的结果。
   * 与首页/统计页同一套做法，避免旧请求把新数据盖回去。
   */
  const requestSeqRef = useRef(0)

  /** 把服务端资料落到表单（未被编辑过时才回填）。 */
  const syncForm = useCallback((data: UserInfoResponse) => {
    if (!dirtyRef.current) {
      setNickname(data.nickname ?? '')
      const index = GENDER_OPTIONS.findIndex((option) => option.value === data.gender)
      setGenderIndex(index >= 0 ? index : 0)
    }
  }, [])

  const load = useCallback(async () => {
    const seq = ++requestSeqRef.current
    // 先出缓存再拉网络：切到「我的」要等一个 RTT 才显示名字，体感很像没加载出来
    const cached = getCachedUserInfo()
    if (cached) {
      setInfo(cached)
      syncForm(cached)
    }
    setLoading(true)
    try {
      const data = await fetchUserInfo()
      if (seq !== requestSeqRef.current || !data) {
        return
      }
      setInfo(data)
      cacheUserInfo(data)
      syncForm(data)
    } catch (error) {
      // 401/1002 已由 request 层清 token 并跳登录页，这里只需保证不崩
      if (seq !== requestSeqRef.current) {
        return
      }
      console.error('[profile] 加载用户信息失败:', error)
      if (!cached) {
        setInfo(null)
      }
    } finally {
      if (seq === requestSeqRef.current) {
        setLoading(false)
      }
    }
  }, [syncForm])

  useDidShow(() => {
    // 分享直达 / 未登录时先补一次静默登录，否则 /api/user/info 一定 401
    void (async () => {
      if (await ensureLoggedIn()) {
        await load()
      }
    })()
  })

  /** 只提交真正改过的字段（后端是部分更新，全量提交会把没动的字段刷成同值）。 */
  async function handleSave() {
    if (saving) {
      return
    }
    const name = nickname.trim()
    if (name.length > NICKNAME_MAX) {
      toast(`昵称最多 ${NICKNAME_MAX} 个字符`)
      return
    }
    const gender = genderByIndex(genderIndex)

    const payload: { nickname?: string; gender?: number } = {}
    if (name && name !== (info?.nickname ?? '')) {
      payload.nickname = name
    }
    if (gender !== (info?.gender ?? 0)) {
      payload.gender = gender
    }
    if (Object.keys(payload).length === 0) {
      toast('没有需要保存的修改')
      return
    }

    setSaving(true)
    try {
      await updateUserInfo(payload)
      dirtyRef.current = false
      await load()
      toastSuccess('已保存')
    } catch (error) {
      // 具体文案由 request 层提示
      console.error('[profile] 保存资料失败:', error)
    } finally {
      setSaving(false)
    }
  }

  async function handleLogout() {
    if (saving) {
      return
    }
    const confirmed = await confirm(
      '退出登录',
      '退出后需要重新登录才能查看记录，确定退出吗？',
      '退出'
    )
    if (confirmed) {
      logout()
    }
  }

  const trimmedName = nickname.trim()
  const hasChanges =
    !!info &&
    ((trimmedName !== '' && trimmedName !== (info.nickname ?? '')) ||
      genderByIndex(genderIndex) !== (info.gender ?? 0))

  return (
    <View className='fm-page profile-page'>
      <View className='fm-hero profile-hero'>
        <View className='profile-hero__avatar'>
          {info?.avatarUrl ? (
            <Image className='profile-hero__avatar-img' src={info.avatarUrl} mode='aspectFill' />
          ) : (
            <Text className='profile-hero__avatar-text'>{avatarLetter(info?.nickname)}</Text>
          )}
        </View>
        <View className='profile-hero__name'>{info?.nickname?.trim() || NICKNAME_PLACEHOLDER}</View>
        <View className='profile-hero__meta'>
          <Text className='profile-hero__meta-item'>{genderLabel(info?.gender)}</Text>
          {info?.phone ? (
            <Text className='profile-hero__meta-item'>{info.phone}</Text>
          ) : null}
        </View>
        {/* 口径说明：这里的「账号 ID」是 users.id，不是 openid（后端刻意不返回 openid 等敏感字段）。
            不显示"登录态有效"之类的话：token 有效性只能由后端判定，前端说了不算。 */}
        <Text className='fm-hero__note'>
          {loading ? '正在同步…' : `账号 ID ${info?.id ?? '--'}`}
        </Text>
      </View>

      <View className='fm-card'>
        <View className='fm-row fm-row--between fm-section-head'>
          <Text className='fm-title'>资料</Text>
          <Text className='fm-tertiary'>改完记得保存</Text>
        </View>

        <View className='fm-field'>
          <View className='fm-field__label'>昵称</View>
          <Input
            className='fm-input'
            maxlength={NICKNAME_MAX}
            placeholder='想让别人怎么称呼你'
            value={nickname}
            onInput={(event) => {
              dirtyRef.current = true
              setNickname(event.detail.value)
            }}
          />
        </View>

        <View className='fm-field'>
          <View className='fm-field__label'>性别</View>
          <View className='fm-chips fm-chips--grid'>
            {GENDER_OPTIONS.map((option, index) => (
              <View
                key={option.value}
                className={`fm-chip profile-chip${index === genderIndex ? ' fm-chip--active' : ''}`}
                onClick={() => {
                  dirtyRef.current = true
                  setGenderIndex(index)
                }}
              >
                {option.label}
              </View>
            ))}
          </View>
        </View>

        <Button
          className='fm-btn fm-btn--primary profile-save'
          disabled={saving || !hasChanges}
          loading={saving}
          onClick={handleSave}
        >
          {saving ? '保存中…' : '保存修改'}
        </Button>
      </View>

      <View className='fm-card fm-card--flush'>
        <View className='profile-row' onClick={handleLogout}>
          <Text className='profile-row__label'>退出登录</Text>
          <Text className='profile-row__value profile-row__value--danger'>清本地登录态</Text>
        </View>
      </View>

      <View className='profile-tip'>
        <Text className='fm-tertiary'>
          退出只清掉本机 token 与缓存，记录仍在服务端；重新登录即可看回来。
          若账号被禁用（后端返回 1002），任意接口都会自动清登录态并退回登录页。
        </Text>
      </View>
    </View>
  )
}
