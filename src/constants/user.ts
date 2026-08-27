/**
 * 性别枚举，取值与后端 WxLoginRequest 的 @Min(0)/@Max(2) 对齐。
 */

export enum Gender {
  Unknown = 0,
  Male = 1,
  Female = 2
}

export const GENDER_LABELS: Record<Gender, string> = {
  [Gender.Unknown]: '不填',
  [Gender.Male]: '男',
  [Gender.Female]: '女'
}

/** 按枚举值升序排列，供 Picker 按下标取值。 */
export const GENDER_OPTIONS: Array<{ value: Gender; label: string }> = [
  Gender.Unknown,
  Gender.Male,
  Gender.Female
].map((value) => ({ value, label: GENDER_LABELS[value] }))

/** Picker 下标 -> 性别值，越界回落到「不填」。 */
export function genderByIndex(index: number): Gender {
  return GENDER_OPTIONS[index]?.value ?? Gender.Unknown
}

/** 性别值 -> 文案，非法值回落到「不填」。 */
export function genderLabel(gender: number | undefined | null): string {
  if (gender == null) {
    return GENDER_LABELS[Gender.Unknown]
  }
  return GENDER_LABELS[gender as Gender] ?? GENDER_LABELS[Gender.Unknown]
}
