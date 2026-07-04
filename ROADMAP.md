# 优化评估与路线图

> 2026-07-04 · 对标主流游戏地图工具（MapGenie、IGN Interactive Maps、米游社原神大地图、
> Zelda Dungeon、宝可梦系 wiki 地图）的差距评估。
> 性能专项（标记规模化：视口剔除 → Canvas）已有结论，见 [README「Performance roadmap」](README.md#performance-roadmap-marker-scaling)，本文不重复。

## 0. 对标对象一句话画像

| 工具 | 核心强项 |
| --- | --- |
| **MapGenie** | 自定义标记 + 笔记、分类进度追踪、楼层切换（floors）、URL 分享 |
| **IGN Interactive Maps** | 区域名标签叠加、低缩放信息分层、嵌入 wiki 攻略正文 |
| **米游社大地图（原神）** | 路线绘制、标记点位含图文攻略、云同步进度 |
| **Zelda Dungeon / ZeldaMaps** | 极简但检索极快、物品图标即标记 |
| **宝可梦系 wiki 地图** | 每条道路的野生遭遇表、训练家队伍卡（我们刚做完的就是这个模式） |

## 1. 现状盘点

已经站住的能力：像素级渲染（CRS.Simple + 最近邻）、触发区跳图 + 面包屑/历史栈、
瓦片金字塔（type=tiles，HGSS 在用）、渐进加载（缩略图先行）、POI 体系
（宝箱/训练家/告示牌/飞行点/HM 障碍 + **通用队伍卡片**）、已收集/已击败标记（增量渲染）、
分类图例、全收集清单、全局搜索、三语 UI、本地多用户 + JSON 导入导出、触发区编辑器、
URL 深链、3D 演示页。数据端由 `nes_decoder` 从 ROM 全自动导出（契约见 CONTRACT.md）。

**这套架构的定位**：无后端、纯静态、localStorage 持久化——对标工具的"账号云同步"
不是我们的赛道，但除此之外的单机体验都可以够到。

## 2. 差距与机会

规模：S ≤ 半天 · M ≈ 1-3 天 · L ≥ 1 周。每项标注对标来源与落地入口。

### A. 标记与进度

| # | 事项 | 对标 | 落地 | 规模 | 价值 |
| --- | --- | --- | --- | --- | --- |
| A1 | **自定义标记 + 笔记**：用户在任意位置放置个人 pin、写备注，随用户档案导出 | MapGenie 招牌（付费功能） | 新 `UserPinStorage` + PoiLayer 渲染管线复用；交互仿 TriggerEditor 的拖放模式 | M | ★★★ |
| A2 | ✅ **图例显示进度**（2026-07-04）：可标记分类显示 `n/total`，集齐变绿 | MapGenie 分类进度 | [PoiFilter.ts](src/ui/PoiFilter.ts) | S | ★★ |
| A3 | ✅ 训练家纳入全收集清单（2026-07-04） | — | [Checklist.ts](src/ui/Checklist.ts) 过滤放宽到 isMarkable | S | ★★ |
| A4 | 剧透控制：`hidden` 隐藏物品类默认折叠 | wiki 惯例 | 图例默认态 + Prefs | S | ★ |

### B. 检索与导航

| # | 事项 | 对标 | 落地 | 规模 | 价值 |
| --- | --- | --- | --- | --- | --- |
| B1 | ✅ **搜索覆盖队伍成员名**（2026-07-04）：搜「火爆猴」→ 列出所有带它的训练家（侧栏搜索 + 清单搜索） | 宝可梦 wiki 的"谁有这只" | [PoiIndex.searchPois](src/core/PoiIndex.ts) | S | ★★★ |
| B2 | **楼层/内景分组**：道馆 1F/2F、洞窟层级在地图内切换而非退回侧栏 | MapGenie floors | 导出端已有 mapsec + floor 信息；按 (mapsec, floor) 分组生成切换控件 | M-L | ★★★ |
| B3 | **区域名标签叠加**：世界地图低缩放时显示地名（トキワシティ…），放大后淡出 | IGN 地图 | 契约加可选 `labels[]`（导出端已知每张图的 sec 归属与拼接偏移）；viewer 按 zoom 显隐 | M | ★★ |
| B4 | 拼音/罗马字模糊搜索 | — | 搜索层加转换表 | M | ★ |
| B5 | 小地图 (minimap inset) | 通用 | Leaflet-MiniMap 或自绘缩略图 + 视口框 | S-M | ★ |

### C. 信息密度（tooltip / 数据层）

| # | 事项 | 对标 | 落地 | 规模 | 价值 |
| --- | --- | --- | --- | --- | --- |
| C1 | **宝箱 tooltip 带物品图标**：复用队伍卡片的行模板 | ZeldaMaps 物品即图标 | FRLG `gItemIconTable`（24×24）提取方式同 mon_icons.py；契约无需新字段（POI 级 `icon` 语义复用或加 `itemIcon`） | M | ★★ |
| C2 | **野生遭遇表**：每条道路的草丛/水面/钓鱼出现率，宝可梦攻略站标配 | 宝可梦 wiki | ROM 有 encounter tables；契约加 map 级可选 `encounters[]`，UI 复用卡片列表（图标·名称·Lv 区间·几率） | M-L | ★★★（宝可梦系） |
| C3 | ✅ **训练家赏金**（2026-07-04）：卡片头部显示 ¥（4×职业基数×末位等级，双打×2；基数表转录自 pret/pokefirered）；契约新增通用 `pois[*].reward` | 宝可梦 wiki | 导出端 + [PoiTooltip.ts](src/core/PoiTooltip.ts) | S | ★ |
| C4 | **wiki 互链**：POI 可选 `link` 字段 → tooltip 点击跳 wiki 条目（与 d:/Code/wiki 生态打通） | IGN 嵌入攻略正文 | 契约加 `pois[*].link`；viewer 端 S；数据端按 wiki URL 规则生成 | S+ | ★★★（生态） |

### D. 移动端与分发

| # | 事项 | 对标 | 落地 | 规模 | 价值 |
| --- | --- | --- | --- | --- | --- |
| D1 | 响应式布局：侧栏/图例/清单目前是桌面固定像素，手机上不可用 | 全部对标工具 | main.css 断点 + 面板抽屉化；Leaflet 触屏本身没问题 | M | ★★ |
| D2 | PWA 离线：Service Worker 缓存 game.json + 瓦片/图片（NAS 局域网部署场景很实用） | — | manifest + SW；配合 DEPLOY.md 的 nginx | M | ★★ |
| D3 | 当前视图导出 PNG（分享攻略截图） | 社区需求 | canvas 合成 image overlay + 标记层 | S-M | ★ |

### E. 数据与工程

| # | 事项 | 落地 | 规模 |
| --- | --- | --- | --- |
| E1 | ~~README/CONTRACT 的「tiles 未实现」说明过时~~（2026-07-04 已修正） | — | 已完成 |
| E2 | ✅ 契约顶层 `version` 字段（2026-07-04，当前 1） | schema + types，FRLG 已输出 | 已完成 |
| E3 | 队伍模型推广到既有游戏：吞食天地敌将（value=兵力, unit=兵）、重装机兵赏金首 | 各游戏导出器，viewer 零改动 | 每游戏 M |
| E4 | e2e 覆盖移动视口 | playwright projects 加 viewport | S |

## 3. 优先级建议

- **Quick wins**：~~B1 搜索队伍成员、A2 图例进度、A3 清单纳入训练家、C3 赏金、E2 version 字段~~ ✅ 全部完成（2026-07-04）
- **下一个里程碑（中期）**：A1 自定义标记、B3 区域标签、C4 wiki 互链、C1 物品图标、B2 楼层分组
- **看到需求再动（远期）**：C2 遭遇表、D1+D2 移动端与 PWA、B4/B5/D3
- **每加一个游戏都做**：E3（party 模型已通用，成本只在数据端）

## 4. 明确不做（非目标）

- **Marker clustering** — 攻略地图要的是精确位置，聚合反而有害；规模问题用视口剔除解决（见 README 性能路线图）。
- **账号系统 / 后端同步** — 纯静态 + localStorage + JSON 导入导出是本项目的部署哲学（NAS 直挂），不引入服务端状态。
- **通用 GIS / 经纬度支持** — CRS.Simple 像素坐标是契约根基，不做真实地理坐标。
- **UI 框架迁移** — 零框架 plain DOM 是特性不是欠账；Leaflet 保持唯一运行时依赖。
