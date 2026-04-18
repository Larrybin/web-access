# profile_link 批量执行清单（pdfreprinting 2026-03）

更新时间：2026-04-15

这份清单只收录 `pdfreprinting / 外链星球 / 2026-03` 里明确带有 `profile` 特征的攻略，目标是把“注册 / 登录 / 资料页补链接”这条链路批量化，而不是继续把发帖站、上传站和建站站混在一起推进。

## 通用执行模板
- 优先找站点自带的 `website / url / homepage / source` 字段，只有没有专用网址字段时才把链接写进 `bio / about / intro`。
- 资料字段遵循最小填写：`display_name`、`website`、`bio/about`、`location`，不要一上来把所有资料项填满。
- `bio/about` 默认使用两段式自然文本，不要机械堆关键词；如果站点对纯网址敏感，先只保留简介，把目标链接放到专用网址字段。
- `first_name` / `last_name` 这类强校验字段按真实可通过为准，当前可复用 `Bin` / `Ben`。
- 用户名和公开名优先保持品牌可读性，必要时允许后缀变体，不要为追求完全一致卡住注册。
- 注册默认先看 `Google` 授权入口；没有再走邮箱注册。
- 邮箱激活、CAPTCHA、短信/邮件验证码都视为人工检查点，不要在脚本里硬耗重试。
- 公开验收优先级固定为：公开资料页 -> member/about 页 -> 用户主页 -> 公开内容页。
- 成功标准固定为：公开可见页面里存在真实目标链接；`nofollow` 也算成功，但必须如实记录。

## 当前总表

| 攻略号 | 站点 | 攻略详情 | 攻略动作 | 当前状态 | 备注 |
| --- | --- | --- | --- | --- | --- |
| #92 | daily.dev | `45811241551855828` | `profile, 注册, 登录, 补充信息和链接` | 已落盘成功 | 已有站点经验和公开样本 |
| #88 | rctech.net | `14588128551212482` | `profile, 注册, 登录, 补充品牌信息和网站链接` | 已落盘成功 | CAPTCHA 需要人工介入 |
| #87 | kdpcommunity.com | `55188428114251244` | `Profile, 注册,登录, 补充信息和网站链接` | 已落盘成功 | 公开 profile 已验证 |
| #86 | joy.link | `45811242214255528` | `profile, 注册, 登录, 补充信息和链接` | 已落盘成功 | 公开页稳定 |
| #85 | triptipedia.com | `14588121182144252` | `profile, 注册, 登录, 补充消息, 加上链接` | 已落盘成功 | 邮箱激活后可走通 |
| #83 | gettogether.community | `55188424555428184` | `profile形式, 注册, 登录, 补充网站信息和链接` | 攻略失效 | 当前首页是域名停放页，不再是目标社区 |
| #77 | codesandbox.io | `45811245255482558` | `Profile, 注册, 登录, 补充内容和链接` | 已落盘成功 | 需要人工接码/授权 |
| #76 | noteflight.com | `55188425455228284` | `profile, 注册, 登录, 补充信息和链接` | 已落盘成功 | 公开 profile 已验证 |
| #75 | longisland.com | `82811452428114482` | `profile链接, 注册, 登录, 补充网站链接` | 已落盘成功 | 资料保存时会校验 first name |
| #74 | listchallenges.com | `14588124544458152` | `注册, 登录, 创建自己的profile, 创建list, 补充网站链接` | 已落盘成功 | 公开落点是 list 页面 |
| #73 | myminifactory.com | `55188425155512444` | `profile, 注册登录, 补充信息, 增加网站链接` | 已落盘成功 | 设置页路径已固定 |
| #72 | subscribe.ru | `82811452822254282` | `profile, 注册登录, 补充信息, 添加网站链接` | 已落盘成功 | 俄语站，公开作者页可验收 |
| #70 | wakelet.com | `82811214455822252` | `profile形式, 注册登录, 补充信息到profile` | 已落盘成功 | 已有短路逻辑 |
| #69 | weddingbee.com | `22811214455884181` | `注册, 登录, 补充资料到profile, 放置网站url` | 待人工校验 | 当前浏览器态先落到 Cloudflare challenge |

## 推荐优先级

### P1
- `weddingbee.com`
- 原因：`gettogether.community` 已证实失效后，这批剩下唯一还能继续验证的 profile 站点就是它；但第一步不是注册，而是先过 Cloudflare challenge。

### P2
- 这批 `2026-03 profile_link` 已基本清空
- 原因：除 `weddingbee.com` 外，其余要么已成功落盘，要么攻略目标已不再存在。

## 已有基线样本
- 这批攻略里已经跑通并沉淀过的资料型站点，可以直接当字段映射基线使用。
- `community.cbr.com`
- `daily.dev`
- `joy.link`
- `codesandbox.io`
- `noteflight.com`
- `longisland.com`
- `listchallenges.com`
- `myminifactory.com`
- `subscribe.ru`
- `wakelet.com`
- `rctech.net`
- `kdpcommunity.com`
- `triptipedia.com`

## 下一步建议
- 让用户先在当前 Chrome 中完成 `weddingbee.com` 的 Cloudflare challenge。
- challenge 过完后，再继续验证注册入口、资料页入口和公开资料页是否还存在。
- 如果 challenge 后仍然没有稳定资料链路，就可以认定这批 `2026-03 profile_link` 已经扫完，下一步切去别的链接类型。
