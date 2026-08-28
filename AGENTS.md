# FM-mini 项目指引

微信小程序前端，Taro 4.2.1 + React 18 + TypeScript，只面向 weapp 一个平台。后端是同级目录 `../FM`（GitHub 仓库名 `FM-service`，Spring Boot 3.2.5）。

## 常用命令

```bash
pnpm install
pnpm dev:weapp     # watch 编译到 dist/；微信开发者工具**导入 `dist/` 目录**（不是仓库根目录）
pnpm build:weapp   # 生产编译
pnpm typecheck     # tsc --noEmit，改完 TS 必跑
pnpm lint          # eslint
```

`tsconfig.json` 开了 `noUnusedLocals` / `noUnusedParameters` / `strictNullChecks`，多余 import 和漏判空都会编译失败。

## 注释规范

本项目与后端 `../FM` 一样是**学习项目 + 生产代码**，注释按后端同一标准写（见 `FM/AGENTS.md`「注释规范」）。

- **文件头注释**：每个 `ts` / `tsx` 顶部一段 JSDoc，说明这个文件负责什么、数据从哪来到哪去、对应后端哪个类或接口、有没有跨端契约要遵守
- **导出符号**：`export` 的函数、类、常量、类型都要有 JSDoc，写**输入输出与为什么这样设计**，不复述代码在做什么
- **interface 字段**：逐字段说明业务含义、枚举值含义、可否为 null、后端来源。样板见 `types/api.ts`
- **关键逻辑**：分支判断、边界处理、并发与时序、设计取舍必须解释原因；踩过的坑写清「以前是什么、为什么会坏」。样板见 `utils/date.ts` 的 `clampEndToToday`、`pages/statistics/index.tsx` 的 `activeRange`
- **React / Taro 概念要展开讲**：生命周期钩子只注册一次导致闭包旧值、`useRef` 与 `state` 成对提交、请求序号守卫——这些是本项目最容易看不懂的写法，出现一处就讲一处，别假设读者知道
- **JSX 分区**：页面 `return` 里每个视觉区块给一行说明（hero / 卡片 / 空态 / 悬浮按钮），复杂三元要说清两种形态的差别

判据是**删掉这条注释后，下一个人会不会少知道一件事**。写「取数据」「渲染列表」「遍历循环」这种复述型注释不算达标；宁可少写也不要灌水。

密度参考（2026-08-28 补齐后实测，口径为注释行 / 非空行）：后端 `FM/src` 52.6%；本仓库 37.5%，其中非 pages 46.5%、pages 28.3%。

**别拿 52.6% 当目标，也不要硬凑**：后端那个均值被 DTO 与接口小文件抬高了（`dto` 包 9 个文件均值 71.5%，`UserService.java` 是 10 行代码配 56 行注释），真正可比的大逻辑文件只有 38~44%（`DietRecordServiceImpl` 44%、`UserServiceImpl` 38%）。剩下的 pages 差距是结构性的：Java 一个 public 类一个文件（39 个文件平均 44 行代码），每个文件天然要一份类级 Javadoc；前端页面文件动辄 300 行且大半是 JSX 声明，靠文件头 + 状态与触发链一览 + 分区块注释覆盖同一件事。

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

### 当前色板（2026-08-28 第二版：薄荷翠绿，参照主流健康类 app）

第一版「松烟墨」被否掉了：指标全绿但不好看 —— 为了压对比度把所有颜色往暗里压，
结果界面带洗不掉的绿味、还把「午餐」的绿抢走了。**教训：指标是约束，不是审美目标。**

第二版先去查了真实用色（薄荷健康 `#37D786`、Keep `#2AA527`、知乎 `#1772F6`、
MyFitnessPal `#0066EE`、Noom `#FB513B`、Apple/Fitbit `#0071E3`/`#1967D2`），
三条规律直接改变了方案：

1. 主流是「大面积白/冷灰白 + 近黑文字 + **小面积**强调色」，**没有一家用整屏饱和渐变 hero**
   → 首页/统计页 hero 从深绿渐变块改成浅薄荷面板 `--fm-hero-panel`；深色块只留给登录页。
2. 薄荷绿太亮，白字对比只有 3.07，**连 AA 都不到**（薄荷健康、Keep 的按钮白字其实都不达标）
   → 绿色分两层：`--fm-primary #00873c`（文字 / CTA / tabBar / 导航栏，白字 4.63）、
   `--fm-primary-bright #00a338`（只用于图形：大数字、进度条）。
3. **界面占住绿，四类里就必须有一类让位** → 午餐给青 `#0e9aa7`，不是橄榄黄
   （橄榄与早餐橙在红盲下 ΔE 只有 21，太挤）。

| 约束 | 门槛 | 现值 |
|---|---|---|
| 文字（CTA 白字、text 三级、danger） | ≥4.5 | 4.63 ／ 16.5 ／ 7.96 ／ 5.24 ／ 4.77 |
| 图形（鲜绿大数字/进度条、餐次色点与分布条） | ≥3.0 | 3.13 ／ 早餐 3.34 · 午餐 3.39 · 晚餐 3.95 · 加餐 3.94 |
| 四类餐次色彼此 | 绿盲、红盲 ΔE ≥20 | 最难分一对 27（红盲 晚餐×加餐） |
| 餐次色 vs 界面色 | ΔE ≥25 | 最小 53 |

**这些数字不由手算保证，由 `scripts/check-theme.js` 常驻校验：`pnpm check:theme`。**
它解析 app.scss / theme.ts / meal.ts 的真实值，46 项断言，失败退出码 1。
改任何颜色都要跑它；**新增一处文字/图形用法时，把它的 fg / bg / 门槛补进断言列表**，
否则那条路径没人管。门槛按字号定：≥18.66px 粗体或 ≥24px 属「大文字」可用 3.0，其余 4.5；
纯图形（色点、条、描边）用 3.0（WCAG 1.4.11）。

改色时注意五条踩过的坑：

- **先看界面色有没有吃掉内容色，再管好看不好看。** 旧 primary `#1f6f54` 与旧午餐色 `#2f8f6c`
  色相只差 2°，而 `--fm-primary-bright` 与午餐色是**同一个 hex** —— 统计页 hero 和「午餐」分布条糊成一片。
- **rgba 会绕过按 hex 的 grep。** 统计页曾散写 `rgba(31, 111, 84, .28)`（旧 primary 的 rgba 形式）。
  自查用 `grep -rnE "#[0-9a-f]{3,8}|rgba\(" src/pages src/components`，或直接 `pnpm check:theme`
  （它会把页面/组件 scss 里的散写色值全部列出来；深色块上的 `rgba(255,255,255,x)` 是既定写法，放过）。
- **自定义属性嵌不进 `rgba()`**（`rgba(var(--x), .3)` 在小程序渲染层不稳），所以带 alpha 的整条阴影/渐隐
  要作为 token 定义在 app.scss：`--fm-glow`、`--fm-fade-to-bg`。
- **浅底会把对比度吃掉**：`--fm-primary-bright` 在白上是 3.05，放到浅薄荷面板 `#f1faf4` 上只剩 2.76。
  验算必须用**实际底色**，不能一律拿纯白算 —— check-theme.js 里每条断言都显式写了 bg。
- **「浅绿底 + 绿字」与薄荷绿天生不兼容**：能在浅绿底上站住 4.5 的绿最深只到 `#008214`，
  那是草坪绿，薄荷味全没。解法不是换色而是改写法 —— 选中态用
  「浅绿底 + 绿描边 + **主文本色**字」（`.fm-chip--active`、`.fm-tag` 已这么改）：
  描边负责品牌感，文字负责可读。

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
