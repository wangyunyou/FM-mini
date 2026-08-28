/**
 * 「我的」页（tabBar 第三项）。
 *
 * 职责：GET/PUT /api/user/info 与退出登录。
 * 它是禁用链路（1002）的主要触发点：进页就拉资料，账号被封时正好在这里被踢回登录页。
 *
 * 三个不显眼的约定：
 * 1. 只提交改过的字段（handleSave 里的 payload）——后端是部分更新，
 *    全量提交会把没动的字段也刷一遍，并且把“空串=清空”这类语义错发出去；
 * 2. 缓存先出再网络覆盖（load 里的 getCachedUserInfo）——切 tab 等一个 RTT 很像页面坏了；
 *    代价是可能短暂展示旧值；
 * 3. 没做真实头像上传——小程序没有免费图床，wx.chooseMedia 拿到的临时路径会过期，
 *    要落地得自己加文件存储。avatarUrl 字段两边都留着，现在只用来判“有没有”以决定显图还是显字。
 *
 * 状态与触发链（本页最容易搞混的是“服务端值”与“表单值”各一套）：
 *   info           → 服务端当前值（渲染 + 差异比较的基准）
 *   nickname / genderIndex → 表单里正在编辑的值，仅靠 dirtyRef 决定要不要被回填覆盖
 *   dirtyRef       → 用户动过表单；load 完成后的 syncForm 靠它避开覆盖
 *   saving         → 同时给保存按钮与退出入口当闸门（两者互斥）
 *   requestSeqRef  → 只用于丢弃过期响应
 *   触发 load 的两个入口：useDidShow（含 ensureLoggedIn 补登）、handleSave 成功后
 */
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
  // 兼不到名字时用 F（项目首字母）而不是留空：空的圆形头像位看起来像图加载失败
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

  /**
   * 加载资料：缓存先出 + 网络覆盖。
   *
   * 为何不只要网络数据：切到一个 tab 要空一个 RTT，体感像页面坏了。
   * 缓存优先代价是可能短暂展示旧值（他在另一台设备改过昵称），
   * 所以缓存只做初始值，拿到网络数据后一律覆盖并写回。
   */
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

    /**
     * 只提交真正改过的字段。
     *
     * 为什么不能全量提交：后端 PUT /api/user/info 是部分更新，“没传”与“传了”语义不同；
     * 全量提交会把没动的字段也刷一遗，而且碰上“空串=清空”类字段会直接清掉数据
     * （同一个坑在备注上踩过，见 record-edit 的 remark）。
     * 比较基准是 info（服务端当前值）而不是进页时的快照：用户改完不保存又改回来时，
     * 应该得出“没得可提交”而不是“把原值再发一遍”。
     */
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
      // 保存成功后丢弃 dirty 标记再重拉：不丢的话下一次进页的晚到回填会被
      // dirtyRef 挡住，表单就永远停在“用户改过”的状态不跟服务端对齐了
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

  /**
   * 退出登录。
   *
   * 只清本地（见 utils/auth.ts 的 logout），后端无会话所以没有登出接口。
   * 与保存共用一个 saving 闸门：避免一边在 PUT 一边把 token 清了，请求会变成 401 重登循环。
   */
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

  /** 保存按钮是否可用：真有待提交差异才允许点，避免发一次空 PUT */
  const trimmedName = nickname.trim()
  const hasChanges =
    !!info &&
    ((trimmedName !== '' && trimmedName !== (info.nickname ?? '')) ||
      genderByIndex(genderIndex) !== (info.gender ?? 0))

  return (
    <View className='fm-page profile-page'>
      <View className='fm-hero profile-hero'>
        {/* 头像位两种形态：有 avatarUrl 显图，没有显首字。后者是常态（无上传链路），
            所以 Image 加载失败不需要另做兜底——fallback 就是下面那个分支 */}
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
          {/* phone 没入口能写（后端总是返回 null），所以有值才渲染，不留一行空的 */}
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

      {/* 资料卡：昵称 + 性别 chips + 保存。头像不在此卡内是因为只能看不能改 */}
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
          // 两个条件各挡一类无效提交：saving 挡重入，hasChanges 挡“一次空 PUT”
          disabled={saving || !hasChanges}
          loading={saving}
          onClick={handleSave}
        >
          {saving ? '保存中…' : '保存修改'}
        </Button>
      </View>

      {/* 退出入口：整行可点而不是只有一块按钮，因为这页唯一的其他操作（保存）已经在上面了 */}
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
