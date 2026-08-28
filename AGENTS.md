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
| `constants/validation.ts` | DTO 上的 `@Size/@Min/@Max`（`CALORIES_MAX = 100000` ↔ `@Max(100000)`，两边同值） |

后端必须知道的几点（每条都靠本地跑后端实测确认过）：

1. `GET /api/diet/query` 返回的 `caloriesByMeal`，key 是**餐次中文名**，且只包含区间内出现过的餐次 —— 取值必须 `?? 0`。
2. `PUT /api/diet/{id}` 的请求体**没有 `recordDate`**，编辑态改日期无效，所以编辑页锁住日期字段并给出说明。
3. 后端**没有单条记录查询接口**，编辑页的原记录靠列表页写 storage 草稿（`utils/navigation.ts`），编辑页读后即清。
   草稿读不到时**不能**退化成新增：`record-edit` 以路由 `?id=` 为编辑态的权威信号，
   带 id 却没拿到草稿会进「数据已失效」兜底页（否则用户以为在改，实际 POST 出一条重复记录）。
4. `calories` 传小数时后端会**静默截断**（12.5 -> 12）并返回 200，不报错，所以 `record-edit` 页必须自己卡 `Number.isInteger`。
5. 「日均」在本项目里有**两套口径，而且是故意不同的**：
   - `avgCaloriesPerDay`（后端字段，statistics 页「日均 kcal」直接渲染）分母是**有记录的天数**（后端 2026-08-28 起，旧口径是区间总天数）。查整月只记 1 天时返回的是当天总量，而不是 `总量/31`。
   - 首页「本周日均 kcal」不走后端字段，是前端算的：`weekCalories / daysElapsedInWeek()`，分母是**本周已过天数**（周一=1…周日=7），用于「今日 vs 本周节奏」的进度条对比。
   别把首页也“顺手统一”成有记录天数 —— 记录少的日子会把日均顶得很高，今日对比和进度条直接失真。两个页面各自在 hero 底部用 `.fm-hero__note` 标了口径。
6. **部分更新的置空口径**（`PUT /api/diet/{id}`、`PUT /api/user/info`）：不传 / `null` = 不改；
   `remark` 传空串 `""` = 清空（库里存 NULL）；`foodName`/`nickname`/`avatarUrl` 传空串或纯空白 = 400。
   `JSON.stringify` 会丢掉值为 `undefined` 的键，所以「清空备注」必须显式发空串 ——
   实测省略键与传 `null` 都改不动原值，写错就是「备注永远清不掉」。
7. `POST /api/user/wx-login` 的初始资料：后端**只在自己本次真的新建账号时**才写 `nickname`/`avatarUrl`/`gender`，
   老用户重登一律忽略（微信现在只能给出固定默认昵称"微信用户"，照收会刷掉「我的」页里改的名字）。
   登录页仍用 `auth.isFirstLogin()`（必须在写入新 token **之前** 调用）上报 `isNewUser`，
   但它是**给后端对账用的提示，不是判据**（token 被清后老用户重登也会自报首登）；
   要改资料一律走 `PUT /api/user/info`。
8. `users.status = 1`（禁用）后端返回业务码 **1002**，`request` 层按重登码清 token 跳登录页；
   「我的」页是这条链路的主要触发点（`fetchUserInfo`）。
9. 未来日期分两种口径：`recordDate` 晚于今天 → 2002（写入错误必须拦）；查询的 `endDate` 晚于今天 →
   后端**收敛到今天**（不报错）。前端 `currentWeekRange()` / `currentMonthRange()` 也各自把末端夹到今天
   （`utils/date.ts` 的 `clampEndToToday`），否则统计页「区间天数」会显示 7 天而数据只覆盖 5 天。
   统计页结束日期 Picker 的 `end` 锁到 `todayStr()`，`DATE_MAX` 已删。
   ⚠️ 上一轮就是在这里踩坑：后端硬拦未来 `endDate` 时，周五查「本周」返回 2002，
   首页 `Promise.all` 整个 reject → 今日记录被清空并弹「结束日期不能晚于今天」。
   **预设区间的末端在未来是正常形态，不要再去后端把它改成报错。**
10. 查询跨度上限 **366 天**（`constants/validation.ts` 的 `MAX_QUERY_RANGE_DAYS` ↔
   后端 `DietRecordServiceImpl.MAX_QUERY_RANGE_DAYS`，超出返回 2003）：接口没有分页，
   跨度就是单次返回的行数。统计页开始日期 Picker 的 `start` 按结束日期倒推这个下界，
   用户选不出注定被拒的区间；提交前还有一道 `dayCount` 兜底（防"先选好再把结束日期往后拖"）。

## 鉴权

- token 存 storage（`STORAGE_KEYS.TOKEN`），`request` 层注入 `Authorization: Bearer {token}`。
- 失效不靠前端猜：后端 `AuthInterceptor` 会同时返回 HTTP 401 和 body `code: 401`，`request` 层清 token 并 `reLaunch` 登录页，且一次启动周期内只跳一次。
- 「我的」页（`pages/profile`）是第三个 tabBar 页，负责 `GET/PUT /api/user/info` 与退出登录；
  `utils/auth.ts` 的 `getCachedUserInfo`/`cacheUserInfo` 给它做秒开，`logout()` 是它唯一的退出入口。
- 所有列表加载都带**请求序号守卫**（`requestSeqRef`）：只接受最后一次请求的结果，
  并发（连点区间 tab、下拉刷新撞 useDidShow）时先发的后返回不会盖掉新数据。
- app 启动时 `app.ts` 检查本地有无 token，没有就去登录页；页面 `useDidShow` 调 `ensureLoggedIn()` 兜住分享直达。

## 生命周期坑

Taro 的 `useDidShow` / `useLoad` 等生命周期钩子只在挂载时注册一次，**回调里读到的 state 是闭包旧值**。需要在页面显示时用当前状态（如统计页的自定义区间）时，用 `useRef` 存生效值，别直接读 state。

## 样式

当前是无设计稿情况下的中性实现。**换肤只改两处**，缺一不可（色值有两份来源）：

1. `src/app.scss` 的 `page` 块 —— 样式侧唯一来源，页面 scss 一律引用 `--fm-*`，不许散写色值
2. `src/constants/theme.ts` —— 配置侧唯一来源，`app.config.ts` 与页面 `index.config.ts` 不支持 CSS 变量，导航栏/tabBar 只能写字面 hex

两处必须同值，否则导航栏和页面内容会露出色差。数值按 `designWidth: 750` 书写，编译时 px 自动转 rpx。

### 当前色板（2026-08-28 定色：界面退「松烟墨」，饱和色只留给餐次）

| 约束 | 门槛 | 现值 |
|---|---|---|
| 文字色（primary、text 三级、danger） | 白底对比 ≥4.5 | 8.98 ／ 17.2 ／ 6.58 ／ 4.53 ／ 5.44 |
| 图形色（餐次点、分布条、记录行色条） | 白底对比 ≥3.0 | 早餐 3.34 ／ 午餐 3.13 ／ 晚餐 4.03 ／ 加餐 4.67 |
| 四类餐次色彼此 | 绿盲、红盲模拟下 Lab ΔE ≥20 | 最难分的一对 25 |
| 餐次色 vs 界面色 | ΔE ≥25 | 最小 61 |

改色时注意三条踩过的坑：

- **先看界面色有没有吃掉内容色，再管好看不好看。** 旧 primary `#1f6f54` 与旧午餐色 `#2f8f6c` 色相只差 2°，
  而 `--fm-primary-bright` 与午餐色是**同一个 hex** —— 统计页 hero 和「午餐」分布条糊成一片。
- **rgba 会绕过按 hex 的 grep。** 统计页曾散写 `rgba(31, 111, 84, .28)`（旧 primary 的 rgba 形式）。
  自查用 `grep -rnE "#[0-9a-f]{3,8}|rgba\(" src/pages src/components`；
  hero 上的白色透明层 `rgba(255, 255, 255, x)` 是既定写法可放过，其余一律收进 token。
- **自定义属性嵌不进 `rgba()`**（`rgba(var(--x), .3)` 在小程序渲染层不稳），所以带 alpha 的整条阴影/渐隐
  要作为 token 定义在 app.scss：`--fm-glow`、`--fm-fade-to-bg`。

`app.scss` 里 `fm-tag` / `fm-gap-sm` / `fm-row--wrap` / `fm-btn--danger` / `fm-progress--on-light`
暂无页面引用，是**刻意保留的系统原语**（不是遗漏），新页面直接复用即可。

## 不要做的事

- 不要把后端地址写进源码，只走 `.env.*` 里的 `TARO_APP_API_BASE_URL`。
- 不要在开发者工具 UI 里填 AppID。工具会把值写进 `dist/project.config.json`，而那是**构建产物** ——
  每次 `taro build` 都用「仓库根 `project.config.json` + `TARO_APP_ID`」重新生成它，手填的值必被刷掉
  （表现就是每次重开工具都“没有 appid”）。当前真实 AppID 写死在仓库根 `project.config.json` 的 `appid`，
  两个 `.env` 里的 `TARO_APP_ID` 留空以沿用它；换号时改根目录那个字段，或用 `TARO_APP_ID` 覆盖。
- 不要往 `package.json` 加回其他平台插件（alipay/tt/swan/qq/jd/harmony）——`config/index.ts` 已删掉对应构建段，加回来只会让 `taro build` 报配置不一致。
- 不要引入需要额外构建链的 UI 库前先确认体积；小程序主包 2MB 限制。
