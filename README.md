# FM 小程序前端

FM 的微信小程序端，对接 [`FM-service`](../FM) 后端，覆盖三个模块：微信登录、饮食打卡增删改查、日期区间统计。

## 技术栈

- **Taro 4.2.1** + **React 18** + **TypeScript**
- **构建**：Webpack5（只保留微信小程序平台，h5 / 支付宝 / 字节等平台的插件与配置已移除）
- **样式**：Sass，全局 CSS 变量 + `fm-*` 基础类
- **包管理**：pnpm

## 快速开始

```bash
# 1. 装依赖
pnpm install

# 2. 确认后端地址（默认已指向本地 8080）
cat .env.development

# 3. 编译到 dist/，watch 模式
pnpm dev:weapp
```

然后用**微信开发者工具**导入 **`dist/` 目录**（Taro 会在 `dist/` 里生成自己的 `project.config.json`，`miniprogramRoot` 为 `"./"`）。

> 仓库根目录也有一份 `project.config.json`，它只作为构建时的模板输入；**不要把根目录导入开发者工具**，否则工具会把个人设置写回这份入库文件。导入后工具在 `dist/` 下生成的 `project.private.config.json` 已被 `.gitignore` 忽略。

后端需以 dev profile 启动，且开启微信登录 mock：

```bash
cd ../FM-service
mvn spring-boot:run -Dspring-boot.run.profiles=dev
```

dev profile 下 `wx.miniapp.mock-enabled=true`，任意 `wx.login` 的 code 都能换到有效 token，因此**没有真实小程序 AppID 也能完整联调**。

## 环境变量

Taro 按 `.env` → `.env.<mode>` → `.env.local` → `.env.<mode>.local` 的顺序叠加，后者覆盖前者：

| 文件 | 是否入库 | 放什么 |
|---|---|---|
| `.env.development` | 是（模板） | 本地默认值 `http://localhost:8080`、空 AppID |
| `.env.production` | 是（模板） | 占位域名，不写真实值 |
| `.env.development.local` | 否（被 `*.local` 忽略） | 真机联调的局域网 IP、开发者 AppID |
| `.env.production.local` | 否 | 线上真实域名与 AppID（或改由 CI 注入） |

两个模板文件里不得出现密钥；后端的 `JWT_SECRET` / `WX_SECRET` 属于 `../FM-service` 的 `.env`，已被那边忽略。

## 本地联调的两个必要条件

| 条件 | 位置 | 说明 |
|---|---|---|
| 关闭域名校验 | 已在 `project.config.json` 里设 `setting.urlCheck: false` | 否则开发者工具会拦 `http://localhost:8080`；导入 `dist/` 后工具会另存一份到 `dist/project.private.config.json`，两处任一为 false 即可 |
| 后端 CORS | FM 服务 `CORS_ALLOWED_ORIGIN_PATTERNS` | 小程序原生请求不走浏览器跨域，留空即可；只有 h5 调试才需要配 |

真机预览时手机访问不到开发机的 localhost，需要把地址换成开发机的局域网 IP（写进 `.env.development.local`，不要改模板）并重新编译。

## 目录结构

```
src/
├── api/            # 后端接口的类型化封装，一个 controller 一个文件
├── components/     # 跨页复用的组件（record-item）
├── config/         # 运行时配置：后端地址、超时
├── constants/      # 餐次/性别/错误码/字段上限/路由常量，与后端契约对齐
├── pages/
│   ├── index/          # 打卡页（tabBar）：今日概览 + 今日记录列表
│   ├── statistics/     # 统计页（tabBar）：区间概览 + 餐次分布 + 明细
│   ├── profile/        # 我的（tabBar）：资料查看与编辑、退出登录
│   ├── record-edit/    # 新增/编辑一条记录
│   └── login/          # 微信一键登录
├── types/api.ts    # 接口出入参类型，镜像后端 DTO
└── utils/          # request / auth / storage / date / feedback / navigation
```

## 页面与后端接口对照

| 页面 | 动作 | 接口 |
|---|---|---|
| 登录页 | 微信一键登录 | `POST /api/user/wx-login` |
| 打卡页 | 今日概览 + 列表 | `GET /api/diet/query?startDate&endDate`（区间=今天） |
| 打卡页 | 本周累计 | 同上（区间=本周一~本周日） |
| 打卡页 | 删除记录 | `DELETE /api/diet/{id}` |
| 编辑页 | 保存 | `POST /api/diet` / `PUT /api/diet/{id}` |
| 统计页 | 区间统计 | `GET /api/diet/query?startDate&endDate` |
| 我的页 | 拉资料（先读本地缓存秒开） | `GET /api/user/info` |
| 我的页 | 保存昵称/性别（只提交改过的字段） | `PUT /api/user/info` |
| 我的页 | 退出登录 | 无接口，清本地 token 后 `reLaunch` 登录页 |

请求统一走 `src/utils/request.ts`：注入 `Authorization: Bearer {token}`、拆后端 `Result` 壳、失败提示，并在 401/1001/1002 时清 token 回登录页。

## 契约要点（改动前先看）

- **餐次**：1 早餐 / 2 午餐 / 3 晚餐 / 4 加餐，`src/constants/meal.ts` 与后端 `DietRecordResponse.getMealTypeName()` 必须同步。
- **`caloriesByMeal` 的 key 是餐次中文名**（后端直接放的 `mealTypeName`），不是数字，取值前判空——区间内没出现过的餐次不会有 key。
- **字段上限**集中在 `src/constants/validation.ts`，镜像后端 DTO 的 `@Size/@Min/@Max`；后端放宽时同步这里。
- **`calories` 后端不卡小数**：实测传 `12.5` 会被 Jackson 静默截断成 `12` 并返回 200，不报错。因此编辑页强制要求整数（`Number.isInteger`），否则用户的输入会被悄悄改掉。
- **编辑不能改日期**：后端 `PUT /api/diet/{id}` 的请求体没有 `recordDate`，所以编辑页把日期锁死并给了说明，需要换日期只能删了重记。
- **编辑记录靠本地草稿传递**：后端没有单条查询接口，列表页跳转前把整条记录写入 storage，编辑页读出后立即清除（`utils/navigation.ts` + `utils/storage.ts`）。
  草稿读不到时编辑页进「数据已失效」兜底页，**不会**退化成新增（否则点保存会 POST 出一条重复记录）。
- **部分更新的置空**：`remark` 要清空必须显式传空串 `""`（后端 `null`/缺键 = 不改）；`nickname`/`avatarUrl`/`foodName` 传空串是 400。
- **昵称/性别只能通过「我的」页改**：后端只在服务端本次真的新建账号时才写入登录带上去的昵称/头像/性别，
  老用户重登一律忽略（否则会被微信默认昵称"微信用户"刷掉）。登录页的 `isNewUser` 只是给后端对账的提示，不是判据。
- **未来日期分两种口径**：写入的 `recordDate` 晚于今天返回 2002；查询的 `endDate` 晚于今天由后端**收敛到今天**
  （「本周 / 本月」预设区间的末端天然在未来，硬拦会把首页请求整个打挂）。
  前端 `currentWeekRange()` / `currentMonthRange()` 也自己把末端夹到今天（`clampEndToToday`），
  这样统计页「区间天数」与实际覆盖天数一致；自定义区间的结束 Picker 已锁 `todayStr()`。
- **列表加载都带请求序号守卫**：并发时只接受最后一次结果，避免"新区间表头 + 旧数据"。

## 已知的占位内容

- **样式是中性实现，没有设计稿依据**。当前配色/间距是我按常见小程序布局定的，接入 Figma 后需整体替换（全局变量集中在 `src/app.scss` 的 `page` 块）。
- **头像不能真实上传**：小程序没有自带图床，`wx.chooseMedia` 的临时路径会过期，
  要落地得先加文件存储。当前「我的」页有 `avatarUrl` 就显示图，没有就用昵称首字占位（后端字段已留）。
- **列表无分页**：`GET /api/diet/query` 一次返回区间内全部记录，统计页也是全量渲染。
  日常量级（一年千余条）没问题。作为兜底，后端把单次跨度限制在 366 天（超出返回 2003），
  统计页的开始日期 Picker 也按结束日期倒推同样的下界，选不出注定被拒的区间；
  真要放开长区间，得先给接口加分页并同步这里。
- 生产域名与 AppID 填在 `.env.production.local`（不入库），并在小程序后台配置 request 合法域名。

## 常用命令

```bash
pnpm dev:weapp    # watch 编译，改代码自动重编
pnpm build:weapp  # 一次性生产编译
pnpm typecheck    # tsc --noEmit
pnpm lint         # eslint src config
```
