/**
 * 日期工具。
 *
 * 后端的 recordDate / startDate / endDate 都是 yyyy-MM-dd 无时区日期串，
 * 因此本文件一律按「本地零点」构造 Date：直接把日期串交给 Date 构造函数会按 UTC 解析，
 * 在东八区整体偏一天，实测过才这么定。
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000

/** 一周的起始日，1 = 周一，符合国内习惯。 */
const WEEK_START_DAY = 1

const WEEKDAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

/**
 * 一个日期区间，直接对应后端 GET /api/diet/query 的 startDate / endDate 两个查询参数。
 *
 * 都是含头含尾的自然日（dayCount 算的是 endDate - startDate + 1），
 * 与后端 DietRecordServiceImpl 的 between 语义一致。
 */
export interface DateRange {
  /** yyyy-MM-dd */
  startDate: string
  /** yyyy-MM-dd，不保证早于今天（预设区间天生会落在未来，由 clampEndToToday 夹回来） */
  endDate: string
}

/** 补零，专给 yyyy-MM-dd 用（Date 的 month 从 0 起、日/月/时都是数字，不补零拼出来不是后端要的格式）。 */
function pad(value: number): string {
  return value < 10 ? `0${value}` : `${value}`
}

/** Date -> 'yyyy-MM-dd'。 */
export function formatDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** 'yyyy-MM-dd' -> 本地零点 Date；格式非法返回 null，由调用方判空。 */
export function parseDate(text: string | undefined | null): Date | null {
  if (!text) {
    return null
  }
  const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text.trim())
  if (!matched) {
    return null
  }
  const year = Number(matched[1])
  const month = Number(matched[2])
  const day = Number(matched[3])
  const date = new Date(year, month - 1, day)
  // Date 会把 2026-02-31 这类溢出日期自动进位，回读校验挡掉脏数据
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null
  }
  return date
}

/** 今天的日期串。每次调用都现取，不做成模块常量：小程序可能整夜不关，常驻值过了凌晨就会错一天。 */
export function todayStr(): string {
  return formatDate(new Date())
}

/** 相对今天偏移 offset 天的日期串，负数往前，给「今天/昨天/前天」快捷项用。 */
export function dayOffsetStr(offset: number): string {
  return formatDate(addDays(new Date(), offset))
}

/**
 * 在原日期上加 days 天（负数往前），返回新的 Date。
 *
 * 为什么不用 `date.setDate(n)` 或时间戳加减：
 * 前者会原地改入参（调用方手里的 Date 被偷偷推后），后者的 86400*1000 在有
 * 夏令时的地区会差一小时。这里走 (年, 月, 日) 构造，天数溢出由 Date 自己进位。
 */
export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
}

/**
 * 所在周的周一零点。
 *
 * `+ 7` 是为了把 JS 取模的负数结果转成正数：周日 getDay()=0，
 * 0 - WEEK_START_DAY = -1，-1 % 7 在 JS 里是 -1 而不是 6，不补就会把周日算到下周去。
 */
export function startOfWeek(date: Date): Date {
  const offset = (date.getDay() - WEEK_START_DAY + 7) % 7
  return addDays(date, -offset)
}

/** 所在周的周日（自然末端，可能在未来，用作区间时还要过 clampEndToToday）。 */
export function endOfWeek(date: Date): Date {
  return addDays(startOfWeek(date), 6)
}

/** 所在月第一天。 */
export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

/**
 * 所在月最后一天。
 *
 * 月末天数担心不得（28/29/30/31），而 Date 构造对 day=0 的定义就是「上个月最后一天」，
 * 所以下个月 0 号 = 本月最后一天，一行兼平闰年与大小组。
 */
export function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0)
}

/**
 * 把区间末端夹回今天。
 *
 * 为什么必须夹：「本周 / 本月」的自然末端天然落在未来（周五查本周，周日还没到）。
 * 上一轮后端加了「endDate 不得在未来」的硬校验，实测直接把首页整个 Promise.all 打挂 ——
 * 今日记录被清空，还弹一条「结束日期不能晚于今天」。后端现在改成收敛，
 * 但前端仍然自己夹一遍：统计页的「区间天数」要与实际覆盖的天数一致，
 * 否则周五的「本周」会显示 7 天，而数据只可能有 5 天。
 */
function clampEndToToday(range: DateRange): DateRange {
  const dateText = todayStr()
  return range.endDate > dateText ? { ...range, endDate: dateText } : range
}

/** 包含今天的一周（周一起始，末端不超过今天）。 */
export function currentWeekRange(): DateRange {
  const now = new Date()
  return clampEndToToday({
    startDate: formatDate(startOfWeek(now)),
    endDate: formatDate(endOfWeek(now))
  })
}

/** 今天所在的月（月初到今天，末端不超过今天）。 */
export function currentMonthRange(): DateRange {
  const now = new Date()
  return clampEndToToday({
    startDate: formatDate(startOfMonth(now)),
    endDate: formatDate(endOfMonth(now))
  })
}

/** 最近 n 天（含今天）。 */
export function recentDaysRange(days: number): DateRange {
  const end = new Date()
  return { startDate: formatDate(addDays(end, -(Math.max(days, 1) - 1))), endDate: formatDate(end) }
}

/** 本周已经过了几天（周一计为第 1 天），用作「本周日均」的分母：除以整 7 天会把日均算小。 */
export function daysElapsedInWeek(now: Date = new Date()): number {
  return ((now.getDay() + 6) % 7) + 1
}

/**
 * 以某个日期串为基准偏移 days 天（负数往前），返回 'yyyy-MM-dd'。
 * 基准串非法时原样返回，交给调用方判空。
 */
export function shiftDate(dateText: string, days: number): string {
  const base = parseDate(dateText)
  if (!base) {
    return dateText
  }
  return formatDate(addDays(base, days))
}

/** 单天区间。 */
export function singleDayRange(dateText: string): DateRange {
  return { startDate: dateText, endDate: dateText }
}

/** 区间是否合法：两端可解析且开始不晚于结束（对应后端 2002 校验）。 */
export function isValidRange(range: DateRange): boolean {
  const start = parseDate(range.startDate)
  const end = parseDate(range.endDate)
  return Boolean(start && end && start.getTime() <= end.getTime())
}

/** 区间天数（含首尾），用于核对「平均每天」的口径。 */
export function dayCount(range: DateRange): number {
  const start = parseDate(range.startDate)
  const end = parseDate(range.endDate)
  if (!start || !end) {
    return 0
  }
  return Math.round((end.getTime() - start.getTime()) / MS_PER_DAY) + 1
}

/** 'yyyy-MM-dd' -> '今天' / '昨天' / '08-27 周四'。 */
export function formatDateLabel(dateText: string): string {
  const date = parseDate(dateText)
  if (!date) {
    return dateText || '--'
  }
  const today = new Date()
  const diffDays = Math.round((new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() - date.getTime()) / MS_PER_DAY)
  if (diffDays === 0) {
    return '今天'
  }
  if (diffDays === 1) {
    return '昨天'
  }
  const monthDay = `${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  // 跨年时补上年份，否则只显示 MM-DD 会看不出是哪一年
  return date.getFullYear() === today.getFullYear()
    ? `${monthDay} ${WEEKDAY_LABELS[date.getDay()]}`
    : `${date.getFullYear()}-${monthDay} ${WEEKDAY_LABELS[date.getDay()]}`
}

export interface DateGroup<T> {
  /** yyyy-MM-dd，取自记录的 recordDate */
  date: string
  /** 同一天的记录，保持接口返回的原始顺序 */
  items: T[]
}

/** 按 recordDate 分组，组内保持原顺序，组间按日期倒序（新记录在前）。用 Map 索引，避免整表 find 的平方复杂度。 */
export function groupByRecordDate<T extends { recordDate: string }>(records: T[]): DateGroup<T>[] {
  const grouped = new Map<string, DateGroup<T>>()
  records.forEach((record) => {
    const date = record.recordDate ?? ''
    const existed = grouped.get(date)
    if (existed) {
      existed.items.push(record)
      return
    }
    grouped.set(date, { date, items: [record] })
  })
  return Array.from(grouped.values()).sort((a, b) => (a.date < b.date ? 1 : -1))
}
