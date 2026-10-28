# Squeek Race

把 Squeekchain 的链上算力变成一场实时仓鼠赛跑的单页应用。

- 顶部：LIVE 状态灯、当前区块号与完成度进度条、累计 work 大数字，转轮按 rpm 旋转
- 赛道：5 只仓鼠，位置由各自分到的 24 小时 work 决定，刷新时用 CSS transform 平滑移动
- 今日排行榜：名次 / 跑者 / work / 增速，前三名金银铜奖牌
- 底部：canvas 手写的 24 小时 work 柱状图（悬停或方向键查看每小时数值）和最近结算列表
- 每 10 秒自动刷新，也可以点「立即刷新」；拉取失败时显示「数据拉取失败，10 秒后重试」，保留上一次的数字，不会白屏

整个应用就是根目录的一个 `index.html`：原生 HTML/CSS/JS，零运行时依赖、零构建，没有 React、Vue 或图表库。
页面只读公开接口，不接钱包、不发交易、没有后端、没有登录。页脚署名 @Despite_zmw。

## 数据源

| 接口 | 字段路径 | 页面用途 |
| --- | --- | --- |
| `GET https://api.squeekchain.com/v1/status` | `measurement.cumulativeWorkUnits` | 累计 work 大数字、「打开页面后新增」 |
| 同上 | `measurement.rpmMilli` ÷ 1000 | 转速 rpm；转轮动画周期 = 60 / rpm 秒（限制在 0.4–20 秒） |
| 同上 | `measurement.speedMmPerSecond` | 线速度 mm/s |
| 同上 | `measurement.coreStatus` | `SPINNING` 显示「转轮转动中」并让转轮转动，`IDLE` 显示「转轮空闲」并停转 |
| 同上 | `measurement.receivedAt`（可选） | 「测量于 x 分钟前」 |
| 同上 | `builder.anchor.blockHeight` | 当前区块号 |
| 同上 | `builder.anchor.blockProgress` | 0–1e9；÷ 1e9 得到比例，显示 `Math.floor(比例 × 100)` 的整数百分比，与参考首页一致；进度条保留精确比例 |
| `GET https://api.squeekchain.com/v1/settlements?range=24h` | `buckets[].workAdded` | 柱状图；按随机权重拆给跑者 |
| 同上 | `buckets[].startAt` | 小时桶的源时间；缓存跨小时仍保持原来的标签和相对时间 |
| 同上 | `buckets[].settlementCount`、`buckets[].completedBlockCount` | 柱状图说明、最近结算列表 |
| 同上 | `summary.settlementCount`、`summary.workAdded` | 24 小时合计 |
| 同上 | `recentSettlements[].settledThroughRound`、`workAdded`、`completedBlockCount`、`blockTimestamp` | 最近逐条结算的轮次、新增 work、完成区块数和相对时间；按时间倒序显示最近 6 条 |
| `GET https://api.squeekchain.com/v1/economy/state` | `supply.totalMintedBaseUnits` ÷ 1e18 | 已铸造 SQK（BigInt 计算，两位小数） |
| 同上 | `mining.processedThroughRound` | 已处理轮次 |

每个字段在 `index.html` 的解析函数 `parseStatus` / `parseSettlements` / `parseEconomy` 里都有注释写明来源接口和路径。

接口兼容与失败处理：

- 小时桶优先读取真实接口的 `startAt`，再尝试旧别名 `startsAt`、`start`、`bucketStart`、`startTime`、`hourStart`、`from`、`timestamp`、`time`、`at`、`hour`；没有可用时间时只推算缺失的桶，不覆盖已有源时间。
- 「最近结算」优先读取真实接口的 `recentSettlements`，兼容 `settlements` / `recent` / `items` / `events` / `latest` 数组。只有没有逐条记录时才列出有结算的小时桶。
- 三个接口的必填数值、计数、状态枚举和区块进度范围先通过校验，再分别更新缓存。HTTP 200 但返回 `{}`、缺字段或错误类型，也会显示「数据拉取失败，10 秒后重试」，保留该接口上次的数字、榜单和图表。其他有效接口可以独立更新。
- `buckets: []` 配合有效的零值 summary 是合法空数据，会清除旧图表说明和选择状态；缺少 `buckets` 则是失败，不能当成没有活动。

### 跑者怎么分 work

跑者是虚构的，页面上也写明了。每个小时桶的 `workAdded` 按随机权重分给 5 只仓鼠：
每只仓鼠当天有一个按日期做种子的「体力」系数，每个小时再乘一个按桶时间做种子的随机数，所以过去的小时刷新后不变；
最新一个小时桶每次刷新重新抽一次权重，跑者因此会前后移动，排行榜显示名次升降。
位置 = 自己的 24 小时 work ÷ 领跑者的 work，领跑者停在终点线前。「增速」是最新一小时分到的 work。

## 本地运行

不需要安装任何东西：直接用浏览器打开 `index.html`（或 `dist/index.html`）即可。

用本地静态服务器预览构建产物：

```bash
npm ci               # 按锁文件安装开发工具：typescript（类型检查）和 playwright（交互测试）
npm run build        # 生成 dist/
npm run preview      # http://localhost:4173/
```

## 重新构建与检查

| 命令 | 做什么 |
| --- | --- |
| `npm run build` | `scripts/build.mjs`：把 `index.html` 和 `og-image.png` 复制到 `dist/`，并检查所有 URL 都是相对路径、引用的文件都在 |
| `npm run typecheck` | `scripts/typecheck.mjs`：抽出 `index.html` 的内联脚本，用 `tsc --noEmit --checkJs` 检查（报错行号与 `index.html` 对齐） |
| `npm test` | Playwright（Chromium）打开 `dist/`，执行原有交互检查与 `tests/regressions.mjs` 的四项反馈回归；真实接口裁剪样本在 `tests/fixtures/public-data.json` |
| `npm run check` | 依次执行以上三步 |

`npm test` 需要 Playwright 的 Chromium（`npx playwright install chromium`）。

## 部署

产物是纯静态文件，`dist/` 里只有 `index.html` 和 `og-image.png`，所有地址都是相对路径，可以放在任意静态托管的任意子路径下
（IPFS 网关、ENS、GitHub Pages、Vercel、Netlify、Nginx 等）：把 `dist/` 目录原样上传即可，不需要服务端重写规则。
在这次交付里，`dist/` 已经提交到仓库，发布方直接使用这份产物，不需要重新构建。

`og:image` 是相对地址 `./og-image.png`；部署到固定域名后，如果希望所有社交平台都能抓到图，可以改成绝对地址。

## 验证结果（本次交付实际运行）

详细记录见 [`artifacts/validation.md`](artifacts/validation.md)。

| 命令 | 结果 |
| --- | --- |
| `npm run typecheck` | 通过 |
| `npm run build` | 通过，`dist/` 写入 `index.html`、`og-image.png` |
| `npm test`（Chromium 1248，Playwright 1.64.1） | 原有交互 22/22、新增回归 16/16 项通过；包括 17 种必填字段异常 |
| design-critic taste@1 探针（320 / 390 / 1440） | 16/16 项通过 |
| 真实接口与参考首页对照 | 三个 GET 返回 200；最近结算显示第 243 轮、+70 work、6 个区块；进度 `753319164` 显示 `75%`，与参考首页一致 |

已知限制：

- 真实接口会持续变化，也可能暂时请求失败；可重复回归使用公开响应的裁剪样本，不把样本作为页面运行时兜底数据。
- WebKit（Safari）启动检查仍因缺少系统库而失败，未完成 Safari 行为验证。没有做读屏软件和真机测试。

## 目录

```
index.html          应用本体（源文件，单文件）
og-image.png        分享卡片图片
dist/               构建产物（提交到仓库）
scripts/            build / typecheck / preview 脚本
tests/              原有交互测试、反馈回归测试及公开响应裁剪样本
DESIGN.md           设计系统说明
artifacts/validation.md  设计审查与验证记录
```

`.gitignore` 保持原样，忽略 `node_modules/`、`.typecheck/`（类型检查的临时文件）和 `test/scratch/`。开发依赖和缓存不属于交付内容；最终文件体积检查见验证记录，低于 8 MiB 上限。
