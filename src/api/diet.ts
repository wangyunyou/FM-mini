/** 饮食记录相关接口，对应后端 DietRecordController（/api/diet）。
 *
 * 本文件只做三件事：给路径、给方法、声明出入参类型；
 * 拆 Result 壳、注 token、错码转 toast 全在 utils/request.ts，这里不重复实做。
 *
 * ❕ 为什么四处 `data:` 都写成 `{ ...payload }` 而不是直接传 payload：
 * `RequestOptions.data` 是 `Record<string, unknown>`，而 interface 没有索引签名，
 * 直传会报 TS2322 “Index signature for type 'string' is missing”（实测）。
 * 展开一次就变成普通对象字面量，能接。type 别名不会报，但 DTO 镜像用 interface 更合适，
 * 所以统一在调用处展开。
 */
import type {
  CreateDietRecordRequest,
  DietRecordResponse,
  DietStatisticsResponse,
  QueryDietRecordRequest,
  UpdateDietRecordRequest
} from '@/types/api'
import { request } from '@/utils/request'

/** 新增一条打卡记录。 */
export function createDietRecord(payload: CreateDietRecordRequest): Promise<DietRecordResponse> {
  return request<DietRecordResponse>({ url: '/api/diet', method: 'POST', data: { ...payload } })
}

/**
 * 更新指定记录，只传需要改的字段（后端是部分更新，全量提交会把没动的字段刷一遍）。
 *
 * 置空口径很挑：remark 传空串 = 清空，不传 = 不改，所“清空备注”必须显式发 ''，
 * 细节见 types/api.ts 的 UpdateDietRecordRequest 注释。
 */
export function updateDietRecord(
  id: number,
  payload: UpdateDietRecordRequest
): Promise<DietRecordResponse> {
  return request<DietRecordResponse>({
    url: `/api/diet/${id}`,
    method: 'PUT',
    data: { ...payload }
  })
}

/**
 * 删除指定记录。
 *
 * 错误码都是“不可能从本地恢复”那一类，所以调用方（首页/编辑页）只需刷列表，不必分支：
 * 越权 1003（记录属于别人）、不存在 2001（列表是旧的，刷一下就好了）。
 */
export function deleteDietRecord(id: number): Promise<void> {
  return request<void>({ url: `/api/diet/${id}`, method: 'DELETE' })
}

/**
 * 按日期区间查询记录 + 统计。
 * 后端 startDate 晚于 endDate 会返回 2002，调用方需保证区间合法。
 */
export function queryDietRecords(params: QueryDietRecordRequest): Promise<DietStatisticsResponse> {
  return request<DietStatisticsResponse>({
    url: '/api/diet/query',
    method: 'GET',
    data: { ...params }
  })
}
