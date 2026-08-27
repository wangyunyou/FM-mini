/** 饮食记录相关接口，对应后端 DietRecordController（/api/diet）。 */
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

/** 更新指定记录，只传需要改的字段。 */
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

/** 删除指定记录。越权返回 1003，记录不存在返回 2001。 */
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
