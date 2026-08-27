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

export interface DateRange {
  startDate: string
  endDate: string
}

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

export function todayStr(): string {
  return formatDate(new Date())
}

/** 相对今天偏移 offset 天的日期串，负数往前，给「今天/昨天/前天」快捷项用。 */
export function dayOffsetStr(offset: number): string {
  return formatDate(addDays(new Date(), offset))
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
}

export function startOfWeek(date: Date): Date {
  const offset = (date.getDay() - WEEK_START_DAY + 7) % 7
  return addDays(date, -offset)
}

export function endOfWeek(date: Date): Date {
  return addDays(startOfWeek(date), 6)
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

export function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0)
}

/** 包含今天的一周（周一起始）。 */
export function currentWeekRange(): DateRange {
  const now = new Date()
  return { startDate: formatDate(startOfWeek(now)), endDate: formatDate(endOfWeek(now)) }
}

/** 今天所在的月。 */
export function currentMonthRange(): DateRange {
  const now = new Date()
  return { startDate: formatDate(startOfMonth(now)), endDate: formatDate(endOfMonth(now)) }
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
  date: string
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
