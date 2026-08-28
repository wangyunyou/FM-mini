/**
 * 性别枚举与取位表。
 *
 * 取值与后端对齐：`WxLoginRequest.gender` / `UserInfoResponse.gender` 上的 `@Min(0)/@Max(2)`
 * （见 `com.wyy.fm.dto`），库里 users.gender 同一口径。
 * 两边必须同值：前端多一个选项 = 后端 400，后端改编号 = 前端标签全错位。
 */

export enum Gender {
  /** 0：未填。后端默认值，也是「不填」这个选项 */
  Unknown = 0,
  Male = 1,
  Female = 2
}

/** 枚举值 -> 展示文案。注意 Unknown 叫「不填」而不是「未知」：表单里它是默认态，不是一个性别。 */
export const GENDER_LABELS: Record<Gender, string> = {
  [Gender.Unknown]: '不填',
  [Gender.Male]: '男',
  [Gender.Female]: '女'
}

/**
 * 按枚举值升序排列，供 Picker / chips 按下标取值。
 *
 * 为什么额外需要一张表（枚举本身就能遍历）：登录页与「我的」页的 chips 都只能拿到
 * “第几个选项”，而 TS 的 enum 反查（`Gender[0]`）给的是名字不是文案，
 * 下标↔值的映射写进 JSX 就是魔法数字，所以统一回到这里。
 */
export const GENDER_OPTIONS: Array<{ value: Gender; label: string }> = [
  Gender.Unknown,
  Gender.Male,
  Gender.Female
].map((value) => ({ value, label: GENDER_LABELS[value] }))

/**
 * Picker 下标 -> 性别值，越界回落到「不填」。
 *
 * 不抛错只 fallback：下标来自 UI 状态，页面重进 / 数据缺字段都可能让它暂时越界，
 * 这里炸掉会把一个可选字段变成白屏。
 */
export function genderByIndex(index: number): Gender {
  return GENDER_OPTIONS[index]?.value ?? Gender.Unknown
}

/** 性别值 -> 文案，非法值回落到「不填」（同上：后端将来扩展枚举不能把前端打挂）。 */
export function genderLabel(gender: number | undefined | null): string {
  if (gender == null) {
    return GENDER_LABELS[Gender.Unknown]
  }
  return GENDER_LABELS[gender as Gender] ?? GENDER_LABELS[Gender.Unknown]
}
