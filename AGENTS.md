# FM-mini 项目指引

微信小程序前端，Taro 4.2.1 + React 18 + TypeScript，只面向 weapp 一个平台。后端是同级目录 `../FM-service`（Spring Boot 3.2.5）。

## 常用命令

```bash
pnpm install
pnpm dev:weapp     # watch 编译到 dist/；微信开发者工具**导入 `dist/` 目录**（不是仓库根目录）
pnpm build:weapp   # 生产编译
pnpm typecheck     # tsc --noEmit，改完 TS 必跑
pnpm lint          # eslint
```

`tsconfig.json` 开了 `noUnusedLocals` / `noUnusedParameters` / `strictNullChecks`，多余 import 和漏判空都会编译失败。

## 分层约定

- **页面不直接调 `Taro.request`**，一律经 `src/api/*.ts`（一个后端 controller 一个文件）。
- **页面不自己判业务 code**，`src/utils/request.ts` 已经把 `Result` 拆成 `data`，失败抛 `ApiError` 并 toast；页面只需 `try/catch` 收尾 loading。要自己控提示时传 `silent: true`。
- 魔法值全部进 `src/constants/`：餐次 `meal.ts`、性别 `user.ts`、错误码 `error-code.ts`、字段上限 `validation.ts`、路由 `route.ts`。页面里不允许出现裸的 `1/2/3/4` 餐次码或长度数字。
- 跨页复用的 UI 放 `src/components/`；跨页复用的样式放 `src/app.scss` 的 `fm-*` 类，页面 scss 只写本页特有的。
- `@/` 别名指向 `src/`（tsconfig paths + `tsconfig-paths-webpack-plugin` 已配）。

## 与后端契约的同步点（改任何一条都要同时看另一条）

| 前端位置 | 后端来源 |
|---|---|
| `types/api.ts` | `com.wyy.fm.dto.*` |
| `constants/meal.ts` | `DietRecordResponse.getMealTypeName()`（1 早餐 2 午餐 3 晚餐 4 加餐） |
| `constants/error-code.ts` | `com.wyy.fm.common.ErrorCode` |
| `constants/validation.ts` | DTO 上的 `@Size/@Min/@Max` |

后端必须知道的几点（每条都靠本地跑后端实测确认过）：

1. `GET /api/diet/query` 返回的 `caloriesByMeal`，key 是**餐次中文名**，且只包含区间内出现过的餐次 —— 取值必须 `?? 0`。
2. `PUT /api/diet/{id}` 的请求体**没有 `recordDate`**，编辑态改日期无效，所以编辑页锁住日期字段并给出说明。
3. 后端**没有单条记录查询接口**，编辑页的原记录靠列表页写 storage 草稿（`utils/navigation.ts`），编辑页读后即清。
4. `calories` 传小数时后端会**静默截断**（12.5 -> 12）并返回 200，不报错，所以 `record-edit` 页必须自己卡 `Number.isInteger`。
5. `avgCaloriesPerDay` 的分母是**「有记录的天数」**（后端 2026-08-28 起，旧口径是区间总天数），所以查整月只记 1 天时返回的是当天总量而不是 `总量/31`。展示文案统一说「日均按有记录天数计」。

## 鉴权

- token 存 storage（`STORAGE_KEYS.TOKEN`），`request` 层注入 `Authorization: Bearer {token}`。
- 失效不靠前端猜：后端 `AuthInterceptor` 会同时返回 HTTP 401 和 body `code: 401`，`request` 层清 token 并 `reLaunch` 登录页，且一次启动周期内只跳一次。
- app 启动时 `app.ts` 检查本地有无 token，没有就去登录页；页面 `useDidShow` 调 `ensureLoggedIn()` 兜住分享直达。

## 生命周期坑

Taro 的 `useDidShow` / `useLoad` 等生命周期钩子只在挂载时注册一次，**回调里读到的 state 是闭包旧值**。需要在页面显示时用当前状态（如统计页的自定义区间）时，用 `useRef` 存生效值，别直接读 state。

## 样式

当前是无设计稿情况下的中性实现。接入 Figma 后改 `src/app.scss` 里 `page` 块的 CSS 变量（`--fm-primary` 等）即可整体换肤，不要在页面 scss 里散写色值。数值按 `designWidth: 750` 书写，编译时 px 自动转 rpx。

## 不要做的事

- 不要把后端地址写进源码，只走 `.env.*` 里的 `TARO_APP_API_BASE_URL`。
- 不要往 `package.json` 加回其他平台插件（alipay/tt/swan/qq/jd/harmony）——`config/index.ts` 已删掉对应构建段，加回来只会让 `taro build` 报配置不一致。
- 不要引入需要额外构建链的 UI 库前先确认体积；小程序主包 2MB 限制。
