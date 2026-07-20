# DailyFlow AI-Native 产品与开发总规格

> 文档版本:1.0
> 状态:后续产品与开发的主规范(Source of Truth)
> 适用范围:DailyFlow 下一代完整产品,不仅限于 MVP
> 面向读者:产品设计者、开发者、测试者,以及接手实现的 AI Agent
> 最后更新:2026-07-19

界面实现必须同时遵守 [`docs/AI_NATIVE_UI_UX_SPEC.md`](./AI_NATIVE_UI_UX_SPEC.md)。产品规范决定“做什么”,UI / UX 规范决定“如何让用户自然地使用”;两者具有同等实施约束。

---

## 0. 如何使用这份文档

这份文档同时承担 PRD、交互规格、领域模型、技术架构、实施路线图和验收规范的职责。

后续 AI Agent 开发时,按以下优先级处理冲突:

1. 当前用户在对话中明确提出的新要求。
2. 本文档。
3. 当前代码和测试所表达的既有行为。
4. `docs/PRODUCT.md`、`docs/MVP_SPEC.md`、`docs/ROADMAP.md` 等历史文档。

历史文档保留为背景材料,但其中"自动迁移 Todo 是核心价值""AI Chat 是主要入口""Task 是最核心对象"等判断,不再作为下一代产品方向。

AI Agent 每次实现前必须:

1. 标出要完成的本文档需求编号。
2. 涉及界面时完整阅读 `docs/AI_NATIVE_UI_UX_SPEC.md`,不得只凭现有组件延续旧视觉。
3. 检查当前代码、相关测试和未提交修改。
4. 只实现一个可验证的纵向闭环,不同时铺开多个半成品入口。
5. 对数据模型、文件格式或 API 的变更先提供兼容迁移。
6. 完成代码、单元测试、集成测试和用户可见状态。
7. 不得用 mock、固定文本或隐藏失败伪装成真实 AI 能力。
8. 更新本文档末尾的实施状态表。

本文中的"必须 / MUST"是发布门槛;"应该 / SHOULD"是默认方案,偏离时需要在代码或变更说明中记录理由。

---

## 1. 产品结论

### 1.1 一句话定义

**DailyFlow 是一个本地优先的 AI 工作助理:它把用户散落在会议、笔记和临时输入中的承诺识别出来,经过用户确认后持续规划、追踪并推动闭环。**

英文表述:

> DailyFlow is a local-first AI chief of staff that turns fragmented work context into traceable commitments and helps users close the loop.

### 1.2 它不是什么

DailyFlow 不是:

- 在普通 Todo List 上增加一个聊天框。
- 帮用户从几十个任务中随机挑三个的排序器。
- 自动把昨天未完成任务不断复制到今天的迁移工具。
- 以"接入很多模型"为卖点的 AI 壳。
- 会议录音、日历、Markdown、区块链、Git 和知识库功能的拼盘。
- 声称知道用户全部工作、实际却没有数据来源的"全知助理"。

### 1.3 用户购买的结果

用户不是为了管理更多任务而使用 DailyFlow。用户要得到的结果是:

- 不再忘记自己答应了谁什么。
- 打开应用后迅速知道今天真正要推进什么,以及原因。
- 做一件事时,不必重新翻找会议、笔记和历史决策。
- 事项卡住时,知道在等谁、下一步是什么、何时应该再次检查。
- 完成后留下结果和后续,而不是只打一个勾。
- 混乱的输入逐渐变成可信、可搜索、可继续使用的工作记忆。

### 1.4 北极星

**不是"记录了多少任务",而是"有多少真实承诺被可靠地推进并闭环"。**

---

## 2. 为什么此前的产品不够吸引人

### 2.1 核心问题

旧版提供了大量功能,但用户第一次打开时仍需自己完成最困难的工作:

- 自己判断什么重要。
- 自己把会议结论转成任务。
- 自己补充任务上下文。
- 自己维护截止时间和优先级。
- 自己处理反复迁移的陈旧事项。
- 自己记住在等待谁。

AI 主要做总结和聊天,没有承担"理解变化-提出行动-观察结果-更新计划"的闭环。因此用户感受到的仍是传统工具,只是多了 AI 按钮。

### 2.2 失败模式

| 失败模式 | 用户感受 | 下一代修正 |
|---|---|---|
| 功能很多,首要任务不清楚 | "我应该先点哪里?" | Today 只呈现当前决策和行动 |
| Task 没有出处 | "为什么它在这里?" | 每个承诺保留 Evidence |
| 自动迁移制造任务债务 | "列表越来越长" | 迁移改为 AI Triage |
| 通用 AI Chat 与业务对象分离 | "聊完还得自己操作" | AI 直接生成可审阅的 Proposal |
| 会议纪要只停留在总结 | "看完还是没跟进" | 决策、承诺、等待项进入闭环 |
| 本地优先变成技术卖点 | "和我的工作有什么关系?" | 本地优先用于信任、证据和长期记忆 |
| 同时强调 Git、模型、IPFS、钱包 | "这是给谁的产品?" | 从主路径降级为设置或移除 |

---

## 3. 目标用户与首要场景

### 3.1 首要用户

第一目标用户是每周有大量非结构化工作输入、并对外作出承诺的知识工作者:

- 创业者和业务负责人。
- 产品经理、项目负责人。
- 投资、咨询、研究和 BD 从业者。
- 同时推进多个客户或项目的独立工作者。

他们的共同特征:

- 每周多次会议。
- 信息分散在笔记、聊天、邮件、日历和脑中。
- 真正的问题不是"不会创建 Todo",而是承诺容易丢失、上下文容易断裂。
- 愿意为了隐私、可控和长期数据所有权使用桌面端与本地文件。

### 3.2 暂不优先服务

- 只需要购物清单或简单提醒的轻度用户。
- 需要复杂多人审批、资源排班和企业权限矩阵的团队。
- 以共享项目看板为主要需求的工程团队。
- 期待 AI 在未授权情况下完全自动发送邮件、修改日历的用户。

### 3.3 核心 Jobs to Be Done

#### JTBD-01:输入变承诺

当我刚结束会议、收到一段消息或脑中突然想到一件事时,我希望把内容快速交给 DailyFlow,由它识别真正需要跟进的承诺,让我不用再次手工整理。

#### JTBD-02:早晨形成可信计划

当我开始一天工作时,我希望在一分钟内得到一个符合今天时间、精力、截止日期和项目目标的计划,并理解 AI 为什么这样取舍。

#### JTBD-03:进入执行状态

当我开始推进某个承诺时,我希望立刻看到相关原文、上次决定、阻塞和建议的下一步,而不是重新搜索所有信息。

#### JTBD-04:等待与复查

当一件事暂时依赖别人时,我希望它从今日执行列表中离开,但不会消失,并在应该跟进时重新出现。

#### JTBD-05:完成真正闭环

当我完成一项工作时,我希望记录实际结果、产生的新承诺和需要通知的人,使系统记住发生了什么。

---

## 4. 产品原则

### P-01:先有证据,再有判断

AI 提出的承诺、截止时间、负责人和决策必须尽可能关联原始来源。无法找到来源时必须标记为用户输入或 AI 建议,不得伪造引用。

### P-02:承诺优先于任务

Task 只是一个可执行动作;Commitment 表达的是"谁承诺为谁达成什么结果"。产品主模型必须围绕 Commitment。

### P-03:AI 产出行动,不只产出文字

AI 输出应优先成为结构化 Proposal:创建承诺、调整计划、生成下一步、进入等待、安排复查或起草内容。通用长对话不是默认入口。

### P-04:高风险动作必须确认

删除数据、批量改期、创建外部事件、发送消息、改变负责人等动作必须预览和确认。所有外部写操作默认禁止自动执行。

### P-05:渐进式授权

没有外部连接时产品必须完整可用;连接数据源后能力逐步增强。界面必须明确区分"已连接""需要授权""仅手动输入"。

### P-06:本地优先不是本地孤岛

用户可只使用本地 Markdown,也可选择连接日历、会议和消息服务。连接器按最小权限工作,用户能看到同步范围并随时撤销。

### P-07:减少维护,而非制造维护

字段只在系统能自动推断或对决策真正有价值时出现。标签、优先级和文件组织不能成为用户的额外工作。

### P-08:不确定性必须可见

AI 的推断需要置信度和原因。低置信度信息进入 Inbox 等待确认,不应静默进入 Today。

### P-09:用户可以纠正,系统需要学习

用户修改 owner、due、project、next action 或忽略建议后,系统记录 correction signal,用于同一工作区后续决策。

### P-10:可恢复、可导出、可审计

任何 AI 修改都要能查看来源、变更内容和执行者,并支持撤销。用户数据必须能以可读 Markdown 和结构化 JSON 导出。

---

## 5. 核心概念

### 5.1 Source Item(来源项)

用户交给 DailyFlow 的原始材料,例如:

- 一段快速输入。
- 粘贴的会议纪要。
- 本地 Markdown 文件。
- 会议转录。
- 日历事件。
- 经用户授权同步的邮件或消息。

Source Item 只负责"发生了什么",不等于承诺。

### 5.2 Note Document(笔记文档)

Note 是用户主动思考、记录和组织工作的主要空间,也是 DailyFlow 最重要的数据来源之一。它不是附件、Task 的评论区,也不是 AI 输出的垃圾桶。

Note 与普通 Source Item 的区别:

- Source Item 更接近外部事实或未经整理的输入。
- Note 是用户持续编辑、表达判断和形成思路的工作文档。
- Note 可以引用 Source Item,也可以产生 Evidence、Decision、Commitment 和 Outcome。
- AI 能理解 Note,但不能把 Note 擅自拆散或用结构化对象替代原文。
- Note 即使没有产生任何任务,也仍然有独立价值。

Note 的常见模式包括 Quick Note、Daily Note、Meeting Note、Project Note 和 Reference Note。类型应尽量由系统推断或由模板决定,不要求用户每次新建时先选择。

### 5.3 Evidence(证据)

支持某个推断的可定位片段,包括 source ID、note ID、原文片段、block ID、时间范围或行号。Evidence 是 AI 判断与原始事实之间的桥。

### 5.4 Commitment(承诺)

产品最核心的对象。它描述:

> 某个 owner 对某个 beneficiary 承诺,在某个时间预期前,产生一个可判断的 outcome。

一个 Commitment 可以有多个 Next Action、多个 Evidence,也可以处于 Waiting 状态。

### 5.5 Next Action(下一步)

能够在当前条件下直接执行的最小动作。标题应以动词开头,尽量在一个工作时段内完成。

错误示例:"融资""官网""客户 A"。
正确示例:"给投资人 A 发出更新后的财务预测表"。

### 5.6 Outcome(结果)

完成承诺后真实发生的结果,不等于 checkbox。结果可以是交付、决定、发送、确认、失败或取消,并可能产生新的承诺。

### 5.7 Waiting(等待)

当前无法由用户继续推进、正在等待某人或某事件的状态。必须包含 `waitingOn` 和 `reviewAt`,否则不能进入 Waiting。

### 5.8 Project(项目)

一组围绕同一目标的承诺、资料、人员、决定和进展。Project 不是文件夹,也不应要求每个承诺必须属于项目。

### 5.9 Person / Organization(人物 / 组织)

用于连接承诺、会议、等待和关系历史。初期允许名称实体,后续接入外部服务时再绑定稳定外部 ID。

### 5.10 Daily Plan(每日计划)

AI 针对某一天给出的有理由、有容量约束、可由用户调整的计划。它是 Commitment 和 Next Action 的视图,不复制原始对象。

### 5.11 Proposal(建议变更)

AI 想对系统执行的一组结构化操作。Proposal 必须能预览、逐项接受或拒绝,并记录最终结果。

---

## 6. 完整产品闭环

```text
Capture
  原始输入进入 Inbox
    ↓
Interpret
  AI 提取事实、承诺、决定、等待和问题,并附证据
    ↓
Confirm
  用户确认、修改或拒绝 Proposal
    ↓
Plan
  AI 根据时间、截止、影响、依赖和历史生成 Daily Plan
    ↓
Execute
  用户进入一项承诺,系统组织上下文并建议下一步
    ↓
Observe
  系统记录完成、阻塞、新信息和外部变化
    ↓
Close / Re-plan
  写入 Outcome、产生后续承诺、进入等待或重新计划
    ↓
Memory
  经过确认的事实沉淀为可检索、可引用的工作记忆
```

任何功能都必须明确自己位于闭环的哪一段。如果一个功能不能降低 Capture、Interpret、Plan、Execute 或 Close 的摩擦,应从核心产品中删除或降级。

---

## 7. 信息架构

### 7.1 顶级导航

正式版主导航只有:

1. **Today**
2. **Notes**
3. **Memory**

设置通过账户/工作区菜单进入,不作为持续占据注意力的主导航。

三个入口分别对应用户熟悉的行为:Today 负责做事,Notes 负责思考与记录,Memory 负责回忆与关联。AI-native 不意味着取消熟悉的笔记体验,而是让自由书写能够产生可确认的结构、行动和长期记忆。

### 7.2 Today

Today 回答四个问题:

1. 今天最值得推进什么?
2. 为什么是这些?
3. 现在第一步做什么?
4. 有什么变化需要我重新决定?

组成:

- Morning Brief。
- Focus Plan(默认 1-3 个核心推进项)。
- 时间和容量提示。
- Waiting / At Risk 提醒。
- 继续执行区域。
- 当日收尾。

Today 不展示完整积压列表。用户需要写作、采集或整理输入时进入 Notes,需要回看已确认关系时进入 Memory。

### 7.3 Notes

Notes 是完整的写作与思考空间,默认包含:

- Inbox:快速输入、外部导入和尚未整理的内容。
- Recent:最近编辑。
- Daily:每日笔记。
- Meetings:会议笔记。
- Projects:按项目聚合的笔记。
- Favorites:用户固定的重要文档。

Inbox 是 Notes 的一个智能视图,承接所有未解释、未确认或需要重新决策的内容:

- 快速输入。
- 粘贴文本。
- 导入的会议或笔记。
- 新同步的日历/邮件/消息。
- AI 低置信度提取。
- 超期且多次未推进的承诺。
- 连接器冲突和数据变更。

每个 Inbox Item 必须有一个明确的处理动作:

- 接受为 Commitment。
- 合并到已有 Commitment。
- 记为参考资料。
- 整理为正式 Note。
- 进入 Waiting。
- 安排到未来。
- 删除 / 忽略。

Notes 不使用按日期堆叠的卡片墙作为主要体验。默认优先展示标题、正文摘要、最后编辑时间、关联项目/人物和待确认建议。标签、类型和参与人是搜索条件,不是新建 Note 前必须填写的表单。

Note 编辑器必须 document-first:

- 打开即写,标题可为空,正文自动保存。
- 新建时不先要求类型、日期、标签、参与人或关联任务。
- 阅读和编辑共享同一文档空间,不制造割裂的表单/预览模式。
- AI 建议出现在行内或审阅侧栏,不覆盖正文。
- 选中文本后可以解释、改写、提取承诺、形成决定或创建下一步。
- AI 从全文发现的 Commitment、Decision、Waiting 和 Question 进入 Proposal。
- 接受 Proposal 后原文仍保留,结构化对象通过 Evidence 回到对应段落。
- 离开、刷新和应用重启后草稿必须恢复。

### 7.4 Memory

Memory 是经过确认的长期工作上下文,不是文件浏览器。默认聚合:

- Commitments。
- Projects。
- Meetings / Sources。
- People / Organizations。
- Decisions。
- Outcomes。

Memory 可以检索 Note,但不能取代 Notes 的书写与组织体验。

搜索结果必须给出答案、相关对象和原始证据,而不是只返回文件名。

### 7.5 上下文页

Commitment、Project、Person 和 Meeting 使用统一详情结构:

- 当前状态。
- 下一步。
- 为什么重要。
- 相关证据。
- 历史变化。
- AI 建议。
- 可执行动作。

---

## 8. 关键用户流程

### F-01:首次使用

目标:5 分钟内体验到一次真实的"输入变承诺"。

流程:

1. 选择本地工作区。
2. 明确解释:数据默认保存在本地;AI 只在用户配置后工作。
3. 用户选择一种开始方式:
   - 粘贴一段会议纪要。
   - 写下一段最近在推进的事情。
   - 导入已有 Markdown 文件夹。
4. AI 生成首个 Proposal。
5. 用户确认 1-3 个 Commitment。
6. Today 生成首份简短计划。

不得在首次使用时要求:

- 配置 Git。
- 选择十几个模型参数。
- 创建复杂标签系统。
- 连接钱包或 IPFS。
- 先创建多个项目分类。

### F-02:快速采集

入口:

- 全局输入框。
- 系统快捷键。
- 粘贴。
- 拖入 Markdown / 文本 / 音频文件。
- 系统分享菜单(后续桌面能力)。

用户只需输入自然语言。系统异步处理并展示状态:

`已保存 → 正在理解 → 等待确认 → 已处理`

AI 不得阻塞保存。即使 AI 不可用,原始内容也必须可靠留在 Notes 的 Inbox。

### F-02A:写一篇 Note

目标:用户从产生想法到开始书写不超过一次主要操作。

流程:

1. 用户点击 New Note 或使用快捷键。
2. 立即进入空白正文,系统创建稳定 ID 的本地草稿。
3. 用户持续书写,正文自动保存。
4. AI 在后台增量理解,但不阻塞输入。
5. 当发现明确决定、承诺、等待或开放问题时,在审阅侧栏显示少量建议。
6. 用户逐项接受、修改、忽略或暂时隐藏。
7. 接受后生成结构化对象,并保留指向 Note 原文的 Evidence。
8. 用户回到 Note 时,能看到相关事项后续状态,无需手工维护双向链接。

体验要求:

- 第一屏优先是正文,不是元数据。
- 默认不要求标题,离开时可采用首行或 AI 建议标题。
- 自动保存不依赖 AI 和网络。
- AI 不得自动重写整篇 Note。
- 文本改写必须显示 diff,允许局部接受。
- 新 Commitment 必须经过 Proposal,不能直接写进 Today。
- Note 可以一直只是 Note,不强迫“转任务”。

### F-03:会议内容进入系统

支持三种模式:

1. **粘贴纪要**:完整正式能力,第一优先。
2. **导入转录或音频**:用户主动选择文件。
3. **本地录音捕获**:桌面端增强能力。

处理步骤:

1. 保存原始材料。
2. 转录(若需要)。
3. 生成结构化会议记忆。
4. 提取 Decisions、Commitments、Waiting、Open Questions。
5. 每一项附 Evidence。
6. 展示 Proposal。
7. 用户确认后创建或更新对象。

重要约束:

- 录音前必须明确提示并由用户确认其有权录制。
- 负责人不明确时使用 `owner: unknown`,不得默认都是用户。
- "讨论到""建议""可能"不能自动提取为承诺。
- 日期表达无法可靠解析时保留原文,并要求确认。

### F-04:早晨计划

输入信号:

- 用户可用时间。
- 日历中的忙碌时段(连接后)。
- 截止日期和风险。
- Commitment 的影响、年龄、依赖和等待状态。
- 上次推进时间。
- 用户输入的精力或现实限制。
- 当前项目目标。

输出不是简单排名,而是:

- 今天要推进的 1-3 项。
- 每项建议的 Outcome 或 Next Action。
- 选择理由。
- 大致用时。
- 哪些事项可以安心不做。
- 需要用户确认的不确定信息。

用户可以用自然语言调整,例如:

- "下午只有两小时。"
- "这个今天不做,客户那件必须先出结果。"
- "我在等 Alex,不要再排给我。"

AI 将语言转换为 Proposal,预览后应用。

### F-05:执行模式

用户打开一个 Focus Item 后,页面应提供:

- Outcome:这次要产生什么结果。
- Next Action:现在直接做什么。
- Relevant Context:最多 3-5 条最相关证据。
- Last Decision:最近一次相关决定。
- Blocker / Waiting:是否存在依赖。
- Start、Mark blocked、Ask AI、Complete。

"Ask AI"必须带入该 Commitment 的限定上下文,并优先提供具体产物:

- 起草跟进消息。
- 生成文档大纲。
- 比较两个方案。
- 把模糊事项拆成下一步。
- 总结相关会议并指出未解决问题。

不得默认把整个工作区无差别发送给模型。

### F-06:完成与闭环

点击 Complete 后,不立即只打勾。根据事项复杂度显示轻量闭环:

- 实际结果是什么?可直接采用 AI 根据操作推断的草稿。
- 是否产生新承诺?
- 是否需要通知某人?
- 是否需要留下决定?

简单动作允许"一键完成";对外承诺、关键项目和会议 Action Item 应提示 Outcome。

### F-07:等待

进入 Waiting 时必须填写或确认:

- 在等谁 / 什么。
- 从何时开始等待。
- 何时复查。
- 复查时建议采取什么动作。

到 `reviewAt` 后,系统放入 Today 的提醒或 Inbox,而不是自动改回 Active。

### F-08:陈旧事项整理

取消传统"每天自动迁移所有未完成任务"。

当事项长期未推进时,AI 给出 Triage Proposal:

- 今天推进。
- 安排具体日期。
- 进入 Waiting。
- 放入 Someday。
- 合并到其他 Commitment。
- 删除。

每个建议要说明原因。批量删除必须确认并可撤销。

### F-09:每日收尾

收尾应控制在 60 秒左右:

- 今天完成了什么结果?
- 哪些事项卡住了?
- 哪些新承诺需要确认?
- 明天最值得继续哪一件?

系统随后更新 Memory 和第二天计划候选。

### F-10:每周回顾

输出:

- 本周闭环的关键 Outcomes。
- 仍未闭环的对外承诺。
- 等待过久的事项。
- 多次改期的事项。
- 项目风险与关键决定。
- 建议停止或降级的工作。

回顾必须可执行,不能只是 AI 生成的泛泛总结。

---

## 9. 数据从哪里来

### 9.1 数据源优先级

#### Level 0:用户直接输入(首发必须完整)

- 快速输入。
- 粘贴文本。
- 创建或编辑 Markdown。
- 拖入文本、Markdown 和转录文件。

#### Level 1:本地数据(首发必须完整)

- 用户授权的 DailyFlow / Obsidian Markdown 工作区。
- 本地会议录音和转录。
- 本地附件的元数据和可提取文本。

#### Level 2:桌面快捷能力

- 系统分享菜单。
- 剪贴板导入(必须由用户触发)。
- 全局快捷采集。
- 文件夹监听。

#### Level 3:外部只读连接

- Google Calendar / Outlook Calendar / 飞书日历。
- Gmail / Outlook Email。
- Slack / Teams / 飞书消息。
- Zoom / Meet / 飞书妙记等会议来源。

先做读取和生成 Proposal,不做外部写回。

#### Level 4:外部写操作

- 创建或修改日历事件。
- 发送邮件、消息。
- 更新外部任务系统。

外部写操作必须逐项授权、预览和审计,不得成为早期核心依赖。

### 9.2 来源状态必须可见

每个连接器必须展示:

- 是否连接。
- 最后同步时间。
- 读取范围。
- 写入权限。
- 同步错误。
- 暂停和撤销入口。

没有连接日历时,DailyFlow 只能说"你告诉我今天有两小时",不能说"我看过你的日历"。

### 9.3 去重策略

来源项采用以下组合进行去重:

- 外部稳定 ID(优先)。
- 内容 hash + source type + 时间窗口。
- 用户确认合并。

AI 只能提出"可能重复",不能静默删除或合并用户数据。

---

## 10. AI-Native 交互模型

### 10.1 AI 的五种职责

1. **Extractor**:从原始输入提取事实和候选对象。
2. **Resolver**:连接人物、项目、已有承诺和重复事项。
3. **Planner**:在约束下提出取舍和计划。
4. **Copilot**:围绕当前对象生成下一步或具体产物。
5. **Reviewer**:观察历史结果,发现风险和需要重新决策的事项。

这些职责应由明确的服务和结构化输出承担,而不是一个无限制的系统 Prompt。

### 10.2 Proposal 是默认交互单元

Proposal 示例:

```json
{
  "id": "prop_01K...",
  "kind": "extract_commitments",
  "sourceIds": ["src_01K..."],
  "status": "pending",
  "changes": [
    {
      "op": "create",
      "entity": "commitment",
      "draft": {
        "title": "周五前向张总发送更新后的合作方案",
        "owner": "person_self",
        "beneficiary": "person_zhang",
        "dueAt": "2026-07-24",
        "nextAction": "根据会议反馈修改方案第二部分"
      },
      "evidenceIds": ["ev_01K..."],
      "confidence": 0.91,
      "reason": "原文出现明确负责人、交付物和日期"
    }
  ]
}
```

用户可以:

- 全部接受。
- 逐项接受。
- 直接编辑字段后接受。
- 拒绝并选择原因。
- 稍后处理。

### 10.3 自主级别

| 级别 | 能力 | 默认策略 |
|---|---|---|
| A0 | 只回答和解释 | 自动 |
| A1 | 创建草稿 / Proposal | 自动 |
| A2 | 修改本地低风险字段 | 用户可开启自动 |
| A3 | 批量改期、归档、删除 | 必须确认 |
| A4 | 外部写入或发送 | 每次明确确认 |

"用户配置了 AI"不等于获得 A2-A4 授权。

### 10.4 置信度规则

- `>= 0.85`:可作为默认选中建议,但仍需确认。
- `0.60-0.84`:展示不确定字段和 Evidence。
- `< 0.60`:不得创建 Commitment,只能询问或保留为 Source Item。

置信度是模型自评与规则校验后的综合结果,不直接相信模型返回的数字。

### 10.5 Evidence 规则

每个 AI 提取的关键字段应关联证据:

- title / outcome。
- owner。
- beneficiary。
- dueAt。
- decision。
- waitingOn。

Evidence 必须保存:

- 来源 ID。
- 原文片段。
- 定位信息(行号、字符范围或音频时间)。
- 内容 hash。

原始来源变化后,Evidence 标记为 stale,并触发重新确认。

### 10.6 AI 失败的产品状态

必须区分:

- 未配置模型。
- 无网络。
- Provider 拒绝。
- 超时。
- 结构化输出无效。
- 上下文过长。
- 转录失败。
- 权限不足。

所有失败都应保留原始输入并支持重试、换模型或手动处理。禁止展示假的总结、假的行动项或"成功"状态。

### 10.7 纠正学习

第一阶段不训练模型,只记录工作区级偏好:

- 常用工作时长。
- 对优先级的实际选择。
- 人名别名。
- 项目归属纠正。
- 何种措辞代表承诺。
- 用户经常拒绝的建议类型。

偏好必须可查看、删除和重置。

---

## 11. 领域数据模型

### 11.1 ID 与通用字段

所有一等对象使用稳定、时间可排序的 ID(推荐 ULID),不得使用标题作为身份。

```ts
type EntityMeta = {
  id: string;
  schemaVersion: number;
  createdAt: string;
  updatedAt: string;
  createdBy: 'user' | 'ai' | 'connector' | 'migration';
  workspaceId: string;
  archivedAt?: string;
};
```

### 11.2 SourceItem

```ts
type SourceKind =
  | 'quick_capture'
  | 'markdown'
  | 'meeting_audio'
  | 'meeting_transcript'
  | 'calendar_event'
  | 'email'
  | 'message'
  | 'file';

type SourceItem = EntityMeta & {
  kind: SourceKind;
  title?: string;
  body?: string;
  occurredAt?: string;
  externalRef?: {
    connectorId: string;
    externalId: string;
    url?: string;
  };
  filePath?: string;
  contentHash: string;
  processingStatus:
    | 'saved'
    | 'processing'
    | 'needs_review'
    | 'processed'
    | 'failed';
  sensitivity?: 'normal' | 'private' | 'restricted';
};
```

### 11.3 NoteDocument

```ts
type NoteKind = 'quick' | 'daily' | 'meeting' | 'project' | 'reference' | 'general';

type NoteDocument = EntityMeta & {
  title?: string;
  body: string;
  kind: NoteKind;
  state: 'draft' | 'active' | 'archived';
  date?: string;
  projectIds: string[];
  personIds: string[];
  sourceIds: string[];
  pinned: boolean;
  lastOpenedAt?: string;
  autoSaveVersion: number;
  contentHash: string;
};
```

约束:

- 新建 Note 立即持久化为 draft,不以标题作为 ID。
- 修改标题不改变 ID。
- 自动保存使用 version 与 hash 冲突检测。
- AI 派生对象不写回正文,除非用户明确接受文本 diff。

### 11.4 Evidence

```ts
type Evidence = EntityMeta & {
  sourceId: string;
  noteId?: string;
  quote: string;
  locator:
    | { kind: 'text'; start: number; end: number }
    | { kind: 'lines'; start: number; end: number }
    | { kind: 'block'; blockId: string; start?: number; end?: number }
    | { kind: 'audio'; startSeconds: number; endSeconds: number };
  sourceContentHash: string;
  stale: boolean;
};
```

### 11.5 Commitment

```ts
type CommitmentState =
  | 'inbox'
  | 'active'
  | 'planned'
  | 'waiting'
  | 'someday'
  | 'completed'
  | 'cancelled'
  | 'archived';

type Commitment = EntityMeta & {
  title: string;
  outcome: string;
  state: CommitmentState;
  ownerId?: string;
  beneficiaryId?: string;
  projectId?: string;
  dueAt?: string;
  dueConfidence?: 'explicit' | 'inferred' | 'unknown';
  importance?: 'critical' | 'high' | 'normal' | 'low';
  effortMinutes?: number;
  energy?: 'high' | 'medium' | 'low';
  nextAction?: string;
  waitingOnId?: string;
  waitingSince?: string;
  reviewAt?: string;
  evidenceIds: string[];
  sourceIds: string[];
  tagIds?: string[];
  completedAt?: string;
  outcomeId?: string;
  lastProgressAt?: string;
};
```

约束:

- `state === 'waiting'` 时,`waitingOnId` 或明确文本、以及 `reviewAt` 必填。
- `state === 'completed'` 时,`completedAt` 必填;关键承诺还必须有 Outcome。
- `dueAt` 若来自 AI 推断,必须保留 `dueConfidence: inferred` 和 Evidence。
- Next Action 不复制为独立 Commitment;只有产生新的对外结果责任时才创建新 Commitment。

### 11.6 Outcome

```ts
type Outcome = EntityMeta & {
  commitmentId: string;
  kind: 'delivered' | 'decided' | 'sent' | 'confirmed' | 'failed' | 'cancelled';
  summary: string;
  evidenceIds: string[];
  followUpCommitmentIds: string[];
};
```

### 11.7 Project

```ts
type Project = EntityMeta & {
  name: string;
  objective: string;
  successCriteria: string[];
  state: 'active' | 'paused' | 'completed' | 'archived';
  ownerId?: string;
  targetAt?: string;
  commitmentIds: string[];
  decisionIds: string[];
  sourceIds: string[];
};
```

### 11.8 Person

```ts
type Person = EntityMeta & {
  displayName: string;
  aliases: string[];
  organizationId?: string;
  externalRefs?: Array<{
    connectorId: string;
    externalId: string;
  }>;
  relationshipNotes?: string;
};
```

### 11.9 Decision

```ts
type Decision = EntityMeta & {
  title: string;
  decision: string;
  rationale?: string;
  decidedAt: string;
  participantIds: string[];
  projectId?: string;
  evidenceIds: string[];
  supersedesId?: string;
};
```

### 11.10 DailyPlan

```ts
type DailyPlan = EntityMeta & {
  date: string;
  constraintSummary?: string;
  availableMinutes?: number;
  items: Array<{
    commitmentId: string;
    intendedOutcome: string;
    suggestedNextAction: string;
    plannedMinutes?: number;
    reason: string;
    rank: number;
  }>;
  deferredCommitmentIds: string[];
  acceptedAt?: string;
  supersededById?: string;
};
```

### 11.11 Proposal 与 AgentRun

```ts
type Proposal = EntityMeta & {
  kind:
    | 'extract_commitments'
    | 'triage'
    | 'daily_plan'
    | 'replan'
    | 'close_loop'
    | 'merge_entities';
  status: 'pending' | 'partially_accepted' | 'accepted' | 'rejected' | 'expired';
  sourceIds: string[];
  changes: ProposedChange[];
  modelRunId: string;
};

type AgentRun = EntityMeta & {
  agent: 'extractor' | 'resolver' | 'planner' | 'copilot' | 'reviewer';
  modelProvider: string;
  model: string;
  promptVersion: string;
  inputEntityIds: string[];
  outputProposalId?: string;
  status: 'running' | 'succeeded' | 'failed';
  errorCode?: string;
  tokenUsage?: { input: number; output: number };
  durationMs?: number;
};
```

AgentRun 不保存 API Key 和隐藏推理过程。只保存必要的输入引用、结构化输出、版本、耗时和错误。

---

## 12. 本地存储格式

### 12.1 新工作区结构

```text
DailyFlow/
├── Notes/
│   ├── Inbox/2026/07/note_01K....md
│   ├── Daily/2026/07/2026-07-19.md
│   ├── Meetings/2026/07/note_01K....md
│   └── Library/note_01K....md
├── Sources/
│   └── 2026/07/src_01K....md
├── Commitments/
│   └── active/com_01K....md
├── Memory/
│   ├── Meetings/2026/07/mtg_01K....md
│   ├── Decisions/dec_01K....md
│   ├── Outcomes/2026/07/out_01K....md
│   └── People/person_01K....md
├── Projects/
│   └── prj_01K....md
├── Plans/
│   └── 2026/07/2026-07-19.md
├── Attachments/
└── .dailyflow/
    ├── index.sqlite
    ├── audit.jsonl
    ├── connector-state.json
    └── config.json
```

### 12.2 真相边界

- 用户可读、可编辑的业务内容以 Markdown 为主数据。
- `index.sqlite` 是可重建索引,不是唯一真相。
- `audit.jsonl` 是追加式审计记录,记录 AI 和用户的状态变更。
- 连接器游标、缓存、AgentRun 技术元数据放在 `.dailyflow/`,不混入用户笔记。
- API Key 必须存入系统安全存储,不得写入 Markdown、SQLite、日志或前端 localStorage。

### 12.3 Commitment Markdown 示例

```markdown
---
type: commitment
schema_version: 1
id: com_01K...
state: waiting
owner: person_self
beneficiary: person_zhang
project: prj_01K...
due_at: 2026-07-24
due_confidence: explicit
waiting_on: person_zhang
review_at: 2026-07-22T09:00:00+08:00
source_ids: [src_01K...]
evidence_ids: [ev_01K...]
created_at: 2026-07-19T11:00:00+08:00
updated_at: 2026-07-19T12:10:00+08:00
---

# 周五前向张总发送更新后的合作方案

## Outcome

张总收到包含最新报价和实施范围的合作方案。

## Next Action

等待张总确认第二部分修改方向。

## Context

- 来自:[[Memory/Meetings/2026/07/mtg_01K...]]
- 相关项目:[[Projects/prj_01K...]]

## History

- 2026-07-19:发送初稿,进入等待。
```

### 12.4 兼容现有 Daily Markdown

现有 `Daily/YYYY/MM/YYYY-MM-DD.md` 和 checkbox Task 继续可读:

- 扫描时转换为 `LegacyTaskView`。
- 用户可选择"保持旧格式"或"迁移为 Commitment"。
- 未迁移的 checkbox 仍可完成和编辑。
- 新的 DailyPlan 不再复制 Commitment 文本,只保存引用。
- 不得批量重写用户历史文件。

---

## 13. 技术架构

### 13.1 目标架构

```text
React / Tauri UI
  Today · Notes · Memory · Context Detail · Settings
          │
          ▼
Local API / Application Services
  Capture · Commitments · Plans · Memory · Proposals · Connectors
          │
          ├── Domain Engine
          │   State Machine · Rules · Evidence · Audit · Migration
          │
          ├── Agent Runtime
          │   Extractor · Resolver · Planner · Copilot · Reviewer
          │
          ├── Retrieval
          │   Metadata · Full-text · Semantic optional · Context Builder
          │
          └── Connector Runtime
              Markdown · Calendar · Email · Message · Meeting
          │
          ▼
Markdown Workspace + Rebuildable SQLite Index + Secure Secret Store
```

### 13.2 推荐代码结构

```text
src/
├── features/
│   ├── today/
│   ├── inbox/
│   ├── memory/
│   ├── commitments/
│   ├── capture/
│   └── settings/
├── domain/
│   ├── commitment.ts
│   ├── source.ts
│   ├── evidence.ts
│   ├── proposal.ts
│   └── plan.ts
├── api/
└── components/

server/
├── routes/v2/
│   ├── inbox.ts
│   ├── commitments.ts
│   ├── plans.ts
│   ├── memory.ts
│   ├── proposals.ts
│   ├── agents.ts
│   └── connectors.ts
├── domain/
├── repositories/
├── services/
│   ├── capture/
│   ├── commitments/
│   ├── planning/
│   ├── retrieval/
│   ├── agents/
│   └── connectors/
└── migrations/
```

不要求一次性移动所有旧代码。新模块使用 `/api/v2`,旧 API 在迁移期间保留。

### 13.3 分层约束

- Route 只做校验、鉴权边界和响应映射。
- Domain Service 实现状态机和业务规则。
- Repository 负责 Markdown、SQLite 和审计日志的一致性。
- Agent 不直接写 Repository,只能生成 Proposal。
- Proposal Service 校验权限、版本和 Evidence 后执行变更。
- Connector 不直接创建 Commitment,只创建 SourceItem。

### 13.4 写入事务

本地文件写入采用:

1. 读取当前版本和 hash。
2. 构建变更与预览。
3. 写临时文件。
4. fsync 后原子 rename。
5. 追加 audit event。
6. 更新 SQLite 索引。

任一步失败时:

- Markdown 主文件不应处于半写状态。
- 索引可重建。
- UI 显示明确错误。

### 13.5 并发与冲突

- 每个对象有 `updatedAt` 和内容 hash。
- 更新请求必须携带 `expectedVersion` 或 `expectedHash`。
- 冲突返回 `409` 与 current/draft diff。
- AI Proposal 在源对象变化后标记 expired,不能继续静默执行。

---

## 14. API v2 规格

### 14.1 Inbox / Source

```text
POST   /api/v2/inbox/capture
POST   /api/v2/inbox/import
GET    /api/v2/inbox
GET    /api/v2/sources/:id
POST   /api/v2/sources/:id/process
PATCH  /api/v2/sources/:id
DELETE /api/v2/sources/:id
```

### 14.2 Notes

```text
POST   /api/v2/notes
GET    /api/v2/notes
GET    /api/v2/notes/:id
PATCH  /api/v2/notes/:id
POST   /api/v2/notes/:id/autosave
POST   /api/v2/notes/:id/process
GET    /api/v2/notes/:id/relations
GET    /api/v2/notes/:id/proposals
DELETE /api/v2/notes/:id
```

`autosave` 必须接收 expectedVersion / expectedHash。冲突时返回可恢复草稿,不得覆盖磁盘上的新版本。

### 14.3 Commitment

```text
GET    /api/v2/commitments
POST   /api/v2/commitments
GET    /api/v2/commitments/:id
PATCH  /api/v2/commitments/:id
POST   /api/v2/commitments/:id/plan
POST   /api/v2/commitments/:id/wait
POST   /api/v2/commitments/:id/resume
POST   /api/v2/commitments/:id/complete
POST   /api/v2/commitments/:id/cancel
GET    /api/v2/commitments/:id/history
```

### 14.4 Proposal

```text
GET    /api/v2/proposals
GET    /api/v2/proposals/:id
POST   /api/v2/proposals/:id/accept
POST   /api/v2/proposals/:id/reject
POST   /api/v2/proposals/:id/apply-selection
POST   /api/v2/proposals/:id/expire
```

### 14.5 Plan

```text
POST   /api/v2/plans/generate
GET    /api/v2/plans/:date
POST   /api/v2/plans/:date/accept
POST   /api/v2/plans/:date/replan
POST   /api/v2/plans/:date/close
```

### 14.6 Memory / Search

```text
GET    /api/v2/memory/search
GET    /api/v2/memory/context
GET    /api/v2/people
GET    /api/v2/projects
GET    /api/v2/meetings
GET    /api/v2/decisions
GET    /api/v2/outcomes
```

### 14.7 Connector

```text
GET    /api/v2/connectors
POST   /api/v2/connectors/:type/connect
POST   /api/v2/connectors/:id/sync
POST   /api/v2/connectors/:id/pause
DELETE /api/v2/connectors/:id
GET    /api/v2/connectors/:id/status
```

所有列表 API 必须支持分页、稳定排序和 `updatedSince`,不得一次返回整个工作区。

---

## 15. Agent Runtime

### 15.1 统一调用流程

```text
Trigger
  → collect allowed entity IDs
  → build bounded context
  → call provider with versioned prompt + JSON schema
  → validate JSON structurally
  → validate business rules
  → attach Evidence
  → create Proposal
  → user review / policy check
  → apply through domain service
  → audit
```

### 15.2 Extractor 输出契约

必须区分:

- explicit commitment。
- possible commitment。
- decision。
- waiting item。
- open question。
- factual reference。

不得把愿望、讨论话题和他人承诺默认变成用户的 Commitment。

### 15.3 Planner 评分

Planner 至少考虑:

- 截止紧迫性。
- 承诺对象和影响。
- 阻塞关系。
- 预计时长与可用容量。
- 项目目标。
- 多次延期。
- 最近推进时间。
- 用户当天限制。

建议的基础评分可用于候选排序,但最终计划由模型在约束内解释:

```text
score =
  urgency
  + impact
  + commitment_risk
  + unblock_value
  + staleness
  - effort_mismatch
  - dependency_block
```

规则引擎先过滤不可执行项,模型不得把 Waiting 或缺少必要前置条件的事项排入 Today。

### 15.4 Retrieval

检索顺序:

1. 结构化关系:commitment → project/person/source/evidence。
2. 元数据过滤:时间、类型、项目、参与人。
3. 全文检索。
4. 语义检索(可选增强)。

早期不依赖向量数据库。关系和全文足以覆盖大部分可信上下文。

Context Builder 必须:

- 限定工作区。
- 限定用户授权的数据类型。
- 去重。
- 带来源 ID。
- 记录被发送到模型的对象清单。
- 按 token 预算截断,并优先保留 Evidence。

### 15.5 Prompt 管理

- Prompt 需要版本号。
- JSON Schema 与 Prompt 同版本。
- Prompt 不由普通用户在核心设置里直接修改。
- 内置 Prompt 的变更必须有固定 fixtures 和回归测试。
- 模型供应商差异由 adapter 处理,不在业务组件中分支。

---

## 16. 安全、隐私与信任

### 16.1 默认行为

- 默认本地保存。
- 默认不连接任何外部数据源。
- 默认不发送数据给 AI,直到用户配置并同意。
- 默认不保留不必要的原始音频。
- 默认不执行外部写操作。

### 16.2 AI 数据披露

首次配置 Provider 时展示:

- 哪些内容可能发送。
- Provider 名称。
- 是否支持自托管地址。
- 是否保存请求日志(由 Provider 决定)。
- 如何暂停 AI。

每个 AgentRun 可查看"使用了哪些来源",无需展示隐藏推理。

### 16.3 Secret

- 桌面端使用系统 Keychain / Credential Manager。
- 服务端使用环境变量或系统安全存储。
- 日志对 token、Authorization、正文和个人信息进行脱敏。
- 错误响应不得暴露文件系统路径和上游完整响应。

### 16.4 录音

- 录音开始前明确提示。
- UI 持续显示录音状态。
- 支持立即停止和删除。
- 原始音频保留策略可配置。
- 删除音频不得连带删除已确认的会议记忆,除非用户明确选择。

### 16.5 防提示注入

外部邮件、网页、会议转录都视为不可信数据:

- 在 Prompt 中明确标记为 data,而不是 instruction。
- 工具执行不服从来源文本中的命令。
- 外部内容不能改变授权等级。
- AI 输出经过 schema 和业务规则验证。

---

## 17. 连接器策略

### 17.1 连接器统一接口

```ts
interface ConnectorAdapter {
  type: string;
  capabilities: Array<'read' | 'write' | 'webhook'>;
  connect(): Promise<ConnectionResult>;
  sync(cursor?: string): Promise<SyncBatch>;
  disconnect(): Promise<void>;
  health(): Promise<ConnectorHealth>;
}
```

### 17.2 实施顺序

1. 本地 Markdown。
2. 本地文件与粘贴。
3. Google / Outlook Calendar 只读。
4. 飞书妙记或通用转录导入。
5. Gmail / Outlook Email 只读且由用户选择范围。
6. Slack / Teams / 飞书消息的显式采集。
7. 外部写入。

不同时开发所有平台。先把 Connector Contract、权限和同步状态做对,再逐个接入。

### 17.3 同步规则

- 连接器只生成或更新 SourceItem。
- SourceItem 变化后触发新 Proposal。
- 已由用户确认的 Commitment 不因来源删除而自动删除。
- 外部内容变更导致 Evidence 失效时标记 stale。
- 游标可恢复,重复同步必须幂等。

---

## 18. 现有代码迁移方案

### 18.1 可复用

- React 19、Vite、Tauri 和 Express 基础。
- Markdown 读写、路径配置和 Workspace。
- Note / meeting_note 文件保存。
- 会议转录、总结、Action Item 提取的实验入口。
- AI Provider 配置与后端代理。
- Task checkbox 的解析和编辑。
- 测试框架与桌面构建。

### 18.2 需要重构

- `Task` → `Commitment + LegacyTaskView`。
- Notes 从日期卡片列表、手动保存和重型元数据表单,重构为自动保存的 document-first 工作空间。
- Note ID 从 `date + slug(title)` 改为稳定 ULID,标题修改不改变身份。
- Note 与 Task 的手工单向引用改为由 Evidence 和实体关系自动派生。
- AI 工具从直接 `create_task` 改为创建 Proposal。
- `DailyFocus` 从"AI 选三项 Task"升级为读取 DailyPlan。
- Meeting Action Item 不再直接写入当天文件,先进入 Proposal。
- Notes 与 Task 的单向脆弱引用改为稳定 Entity ID + Evidence。
- AI 上下文构建统一进入服务端 Agent Runtime。
- API Key 从前端可见配置迁移到安全存储。

### 18.3 降级或移出核心

- 通用 AI Chat:改为对象内的 Ask AI,独立入口隐藏。
- Prompt Library:开发者能力,不进入普通用户主路径。
- Model Library:保留在高级设置。
- Git:保留为备份/同步高级能力,不轮询干扰主界面。
- Work / Life:不作为顶级切换;可由 Workspace 或过滤器表达。
- Tags:保留兼容,不要求用户维护。
- Thinking Workspace:能力并入 Project / Commitment Context,暂不作为顶级对象。

### 18.4 从核心删除

- Capsule / Time Capsule。
- 钱包、链上封存、IPFS 叙事。
- "支持 15+ Provider"作为首页卖点。
- 自动无脑 rollover。

删除功能时先确保:

- 历史数据仍可导出。
- 路由兼容一段版本周期。
- 用户不会因升级丢数据。

---

## 19. 完整实施路线图

路线图按依赖排序,不按演示效果排序。每一阶段必须形成可真实使用的纵向闭环。

### Phase 0:基线与迁移保护

目标:建立可安全演进的地基。

交付:

- 冻结并记录现有文件格式 fixtures。
- 建立 `/api/v2`。
- 引入 ULID、schemaVersion、Repository 和审计日志。
- 增加备份、原子写、hash 冲突测试。
- 定义 Feature Flags。

发布门槛:

- 旧工作区打开、查看、编辑不回归。
- 所有现有测试通过。
- 迁移 dry-run 不写文件。

### Phase 1:Inbox → Proposal → Commitment

目标:跑通最核心的 AI-native 闭环。

交付:

- 快速输入和粘贴。
- 稳定 ID、自动保存和冲突恢复的 Note 基础。
- Notes Inbox / Recent 和 document-first 编辑器。
- SourceItem / Evidence / Commitment 存储。
- Extractor Agent。
- Proposal 审阅。
- Commitment 详情和状态机。
- 未配置 AI 时的手动处理。

发布门槛:

- AI 提取每个字段能查看 Evidence。
- 无标题 Note 能创建、自动保存、恢复并在之后重命名。
- 编辑 Note 时不要求先填写类型、日期、标签和任务关联。
- AI 无法使用时原始输入不丢失。
- 接受、编辑、拒绝、撤销均有测试。
- 20 份真实样本的承诺提取 precision 达到预设阈值。

### Phase 2:可信 Today

目标:让用户每天愿意打开。

交付:

- DailyPlan 模型和 Planner Agent。
- Morning Brief。
- 容量约束和自然语言 re-plan。
- Focus 执行页。
- 完成 Outcome 和收尾。
- Waiting / Review。

发布门槛:

- Waiting 项不进入可执行计划。
- 计划不超过用户可用容量的容差。
- 所有 AI 取舍有理由。
- 一分钟内完成一次计划确认。

### Phase 3:会议闭环

目标:会议结束后,承诺不再丢失。

交付:

- 粘贴纪要、转录导入、本地录音。
- Meeting Memory。
- Decisions / Commitments / Waiting / Questions 提取。
- Evidence 定位。
- Action Proposal,而非自动落盘。
- 会后闭环和会前回顾。

发布门槛:

- 没有明确 owner 时不错误归属给用户。
- 原始音频、转录、纪要和 Commitment 关系可追溯。
- 转录或 AI 失败可恢复。
- 录音权限和删除流程完整。

### Phase 4:Memory 与跨上下文检索

目标:DailyFlow 真正记得用户的工作。

交付:

- People、Projects、Decisions、Outcomes。
- 关系检索 + 全文检索。
- 带引用的问答。
- 对象内 Ask AI。
- 重复实体解析。

发布门槛:

- 答案中的事实可回到 Evidence。
- 搜索无结果时明确说不知道。
- 不跨工作区泄漏内容。
- 上下文预算和截断可观测。

### Phase 5:日历与时间现实

目标:计划真正考虑用户当天的时间。

交付:

- Calendar Connector Contract。
- Google Calendar / Outlook / 飞书至少完成一个只读实现。
- Busy blocks、会议前后缓冲。
- 会前 brief。
- 同步状态、错误和撤销。

发布门槛:

- 未连接时不伪装读取日历。
- 重复同步幂等。
- 时区、全天事件、取消事件有测试。
- 日历事件不自动成为用户承诺。

### Phase 6:外部工作输入

目标:减少复制粘贴,但不牺牲隐私和控制。

交付:

- Email / Message Connector Contract。
- 用户选择的线程或消息导入。
- 增量同步和去重。
- 外部提示注入防护。
- 从来源创建 Proposal。

发布门槛:

- 默认不读取整个邮箱或消息历史。
- 授权范围清晰。
- 删除连接后 token 和游标被清除。
- 外部文本不能触发工具执行。

### Phase 7:主动 Reviewer

目标:在用户忘记之前发现风险。

交付:

- 陈旧承诺 Triage。
- Waiting 超时提醒。
- 每周回顾。
- 项目风险摘要。
- correction preferences。

发布门槛:

- 提醒频率可控。
- 不重复轰炸。
- 建议能一键转为明确动作。
- 用户可解释和重置学习偏好。

### Phase 8:受控外部执行

目标:从建议走向行动,同时保持安全。

交付:

- 邮件 / 消息草稿。
- 创建日历草稿。
- 逐项确认的外部写入。
- 权限、审计、撤销或补偿动作。

发布门槛:

- 发送前展示最终内容和收件人。
- 所有写操作有幂等键。
- 网络重试不造成重复发送。
- 外部失败不错误标记 Commitment 完成。

### Phase 9:稳定、扩展与多端

目标:成为可长期依赖的个人工作系统。

交付:

- 性能和大工作区优化。
- 本地/私有同步策略。
- MCP 只读出口。
- 移动端快速采集。
- 插件化 Connector SDK。
- 可访问性与国际化完善。

---

## 20. 测试策略

### 20.1 测试金字塔

- Domain 单元测试:状态机、时间、权限、去重和规则。
- Repository 测试:Markdown round-trip、原子写、冲突、恢复。
- Agent contract 测试:固定输入、JSON Schema、Evidence、拒绝幻觉。
- API 集成测试:Proposal 应用、幂等、错误状态。
- UI 组件测试:审阅、空状态、失败状态、键盘操作。
- E2E:从 Capture 到 Outcome 的真实纵向流程。
- Migration 测试:真实旧工作区 fixtures。

### 20.2 AI 评估集

建立脱敏、人工标注的评估集:

- 明确承诺。
- 模糊讨论。
- 他人承诺。
- 没有负责人。
- 相对日期。
- 中英文混合。
- 否定与取消。
- 同一承诺在多次会议中的更新。
- 恶意提示注入。

核心指标:

- Commitment precision 优先于 recall。
- owner 归属准确率。
- due date 准确率。
- Evidence 支持率。
- 用户接受率。
- 无证据事实率必须接近 0。

### 20.3 发布阻断级缺陷

- 数据丢失或静默覆盖。
- AI 未经确认执行高风险动作。
- 错误发送外部消息。
- 跨工作区数据泄漏。
- API Key 泄漏。
- AI 编造 Evidence。
- 同步重试造成重复对象或重复发送。

---

## 21. 产品指标

### 21.1 激活

- 新用户 5 分钟内保存第一个 SourceItem。
- 10 分钟内确认第一个 Commitment。
- 第一天接受或调整一份 DailyPlan。

### 21.2 核心价值

- Proposal 中 Commitment 的接受率。
- 用户确认计划所需时间。
- DailyPlan 项目的完成或明确重决策率。
- Commitment 从创建到 Outcome 的闭环率。
- 等待事项按时复查率。
- 每周被安全删除、取消或降级的无效承诺数。

### 21.3 信任

- 用户修改 AI owner / due / outcome 的比例。
- 无 Evidence 建议比例。
- AI 建议撤销率。
- 同步和 Agent 失败恢复率。
- 用户主动开启更多数据源的比例。

不以以下数据作为北极星:

- 总任务数。
- AI 对话条数。
- Token 消耗。
- 用户创建的标签数。
- 接入模型数量。

### 21.4 隐私友好的采集

默认只在本地保存匿名聚合指标。上传遥测必须 opt-in,且不得包含:

- 原始文本。
- 会议内容。
- 人名和组织名。
- 文件路径。
- Prompt 正文。
- API Key。

---

## 22. UI 与内容规范

### 22.1 AI 的呈现

AI 不应成为一个持续发光的独立角色。它通过以下方式存在:

- "我从这段纪要中找到 3 个可能的承诺。"
- "这项似乎在等待 Alex,建议周三复查。"
- "今天只有两小时,所以我没有安排方案重写。"
- "完成后还产生了一个需要确认的后续事项。"

避免:

- "AI 魔法""智能赋能"等空泛措辞。
- 无来源的绝对判断。
- 每个区域都出现 Sparkles 图标。
- 把所有操作都包装成聊天。

### 22.2 状态文案

- `Needs review`:需要确认,不说"已创建"。
- `AI suggested`:AI 建议,不说"系统决定"。
- `Waiting on Alex`:具体说明等待对象。
- `Review on Wed`:说明重新出现时间。
- `Source unavailable`:来源失效,不隐藏。

### 22.3 空状态

Today 空状态:

> 今天还没有可信计划。告诉我你有什么时间,或先把正在推进的事情放进 Inbox。

Notes Inbox 空状态:

> 没有等待处理的内容。你可以粘贴会议纪要、消息或脑中的事情。

Memory 空状态:

> 经你确认的承诺、会议和结果会逐渐沉淀在这里。

---

## 23. 明确产品决策

以下决策作为默认方向,后续 AI 不应反复重新讨论,除非用户明确改变:

1. 桌面端、本地优先。
2. Today / Notes / Memory 三层主导航;Inbox 是 Notes 内的智能视图。
3. Commitment 是核心对象。
4. Markdown 保存用户可读业务内容。
5. SQLite 是可重建索引。
6. AI 通过 Proposal 修改系统。
7. Evidence 是可信 AI 的必要组成。
8. 首发数据源是输入、粘贴、本地 Markdown 和会议材料。
9. 日历是增强计划真实性的下一层,不是产品存在的前提。
10. 通用 AI Chat 不作为默认主入口。
11. 自动 rollover 被 Triage 取代。
12. 外部写操作始终需要明确授权。
13. 区块链、钱包、Capsule 和 IPFS 不属于核心产品。

---

## 24. AI Agent 开发执行协议

### 24.1 每个开发任务的输入模板

```markdown
需求编号:
目标用户结果:
当前相关代码:
需要新增/修改的数据:
需要新增/修改的 API:
失败与空状态:
兼容策略:
测试范围:
验收命令:
```

### 24.2 每个开发任务的完成定义

一个任务只有满足以下条件才能标记完成:

- 用户可见闭环可运行。
- 数据真实写入并能重启恢复。
- AI 不可用时有诚实 fallback。
- loading、empty、error、conflict、success 状态齐全。
- Domain 和 API 有测试。
- 核心交互有组件或 E2E 测试。
- TypeScript、测试和构建通过。
- 未破坏旧工作区。
- 文档实施状态已更新。

### 24.3 禁止的实现捷径

- 用 localStorage 作为业务主数据。
- 在 React 组件内直接拼 Prompt 和调用 Provider。
- AI 返回自然语言后用脆弱正则猜结构。
- 让 Agent 直接写 Markdown 文件。
- 为演示写固定 AI 结果却不标明 mock。
- 把所有工作区内容一次发送给模型。
- 失败后静默使用旧缓存并显示为新结果。
- 没有幂等设计就执行同步或外部写入。
- 为了新架构一次性删除旧 API 和旧文件兼容。

### 24.4 建议的首批工程任务

| ID | 任务 | 依赖 | 验收结果 |
|---|---|---|---|
| DF2-001 | 新增 v2 domain types 和 schema validation | 无 | 类型和非法状态测试通过 |
| DF2-002 | Markdown Repository + atomic write + audit | DF2-001 | round-trip 与冲突测试通过 |
| DF2-003 | SourceItem capture API | DF2-002 | 无 AI 时也能保存和恢复 |
| DF2-003A | NoteDocument Repository、autosave API 与编辑器基础 | DF2-001/002 | 无标题创建、自动保存、冲突恢复、重启恢复通过 |
| DF2-004 | Evidence 与 Proposal Repository | DF2-002 | Proposal 可持久化和过期 |
| DF2-005 | Extractor Agent contract | DF2-003/003A/004 | fixture 评估与 schema 校验通过 |
| DF2-006 | Notes Inbox review UI | DF2-003/003A/004/005 | 可书写、查看 Evidence、编辑、接受、拒绝 |
| DF2-007 | Commitment state machine/API | DF2-001/002 | Active/Waiting/Complete 规则通过 |
| DF2-008 | Commitment detail UI | DF2-006/007 | 可看 Evidence 和历史 |
| DF2-009 | DailyPlan/Planner | DF2-007 | Waiting 不进入计划 |
| DF2-010 | Today v2 UI | DF2-009 | 计划确认、re-plan、执行 |
| DF2-011 | Outcome close-loop | DF2-007/010 | 完成产生 Outcome 和后续 |
| DF2-012 | Legacy Task migration adapter | DF2-007 | 旧文件不被破坏 |

---

## 25. 实施状态

> AI Agent 完成对应能力后更新；不得把"已有实验代码"标为完整。
>
> **2026-07-20 状态纠正** — v2 后端对象、Proposal、Today 和独立演示页已有大量实现,但不能据此宣称产品终态。当前主应用 Notes 仍是旧的日期卡片列表、手动保存、重型元数据表单和易失效的 `linkedTaskIds`;v2 也仍以独立页面存在。因此 Phase 1、Phase 2、Phase 4 和 DF2-001 → DF2-012 应视为“工程能力部分完成、主产品体验未验收”,直到主应用完成整合并通过本节新增的 Note 验收。
>
> v2 是与 v1 平行的 additive 层：旧 `Daily/YYYY/MM/<date>.md` checkbox 任务继续可读、可完成；v1 AI Chat / Notes / DailyFocus / Capsules 入口保留。v2 入口通过 `/api/v2` 路由 + `src/features/v2/` 组件 + `src/features/v2/v2-standalone.html` 独立页提供。
>
> **2026-07-20 第二轮** — §26 验收场景覆盖推进：
> - **§26 step 12** Today MorningBrief 接入 `getWaitingOverdue`，新增 `OverdueWaitingSection`（只显示，不自动恢复或发消息）。
> - **§26 step 14** `completeWithOutcome` 调用启发式 `detectFollowUps` 检测 Outcome 中的后续动作；命中时创建 `close_loop` Proposal（kind=close_loop, confidence ≤ 0.7, evidence 引用原文片段），用户审阅接受。
> - **§26 step 3-6** 新增 `ScriptedProvider` 注入式 AI provider 单元测试，模拟真实 AI 返回结构化 JSON：2 explicit + 1 third-party + 1 decision，每个字段有 Evidence，支持 date 覆盖与部分接受。
> - **§26 step 9b** e2e 增加 9b 步骤验证 follow-up proposal 可被接受创建真实 Commitment。
> - `transitionCommitment` 扩展 `TransitionOptions` 支持 `waitingOnText` / `reviewAt`；waiting 状态进入有合理默认（3 天 review + 提示文本）。
>
> **2026-07-20 第三轮** — §26 视觉验证 + step 10/15：
> - 新增 `CommitmentContext` 组件：打开 Commitment 显示相关决定（带 rationale + decidedAt）+ Evidence（原文片段）+ 来源材料 + 已记录 Outcome + Action Bar（Wait/Complete/Cancel/Resume）。
> - `getContext` 现在通过 shared `evidenceIds` 或 `projectId` 链接 Decision，不再返回 undefined。
> - 新增 `POST /api/v2/evidence` 端点用于手动 evidence 创建；服务端强制校验 quote 必须是 source body 的 verbatim 子串（spec §10.5 反伪造）。
> - `memoryService.search` 给所有 hit 加上正确的 entity type（commitment/project/person/decision/outcome/source），不再都是 `unknown`。
> - vite.config.ts 添加 v2 多页构建，v2 UI 现在能 `npm run build` 产出 `dist/src/features/v2/v2-standalone.html`。
> - Playwright 真实跑 v2 UI 截图：Today (Morning Brief + Focus + Waiting)、Inbox (Capture + SourceItem)、Memory (search "Zhang" returns commitment + source with snippet + id + evidence count)、Commitment detail (decisions + evidence + actions) 全部 OK。

| 能力 | 状态 | 当前说明 |
|---|---|---|
| Markdown Workspace | 已升级 | v2 Repository + 原子写 + hash 冲突检测 |
| Legacy Task | 已兼容 | `loadLegacyTasks` + `migrateLegacyTask`，原文件不被破坏 |
| Quick Capture | 已实现 | `POST /api/v2/inbox/capture` → SourceItem 即时落盘 |
| Note 编辑与列表 | 已实现 | NoteDocument 一等对象 (1.1.0 后端) + NotesView 集成进主 App (1.1.2) + document-first editor + autosave 800ms 节流 + 冲突协议 + focus 模式 (1.1.3) |
| Note 智能关系 | 已实现 | backlinks 走 evidence 链反向找 Commitment/Decision/Outcome (1.1.3) + memory search 召回 Note (1.1.0) |
| SourceItem | 已实现 | v2 types + repository + Inbox 列表 |
| Evidence | 已实现 | 每条 AI 提取的字段关联 source/quote/locator/hash |
| Commitment | 已实现 | 状态机、Waiting、Outcome 全部 spec-合规 |
| Proposal | 已实现 | `extract_commitments` / `triage` / `daily_plan` 等，pending→accepted/partial/rejected/expired |
| Extractor Agent | 已实现 | JSON Schema + Prompt Version + 确定性本地 Provider fallback |
| DailyPlan | 已实现 | `generatePlan` 规则引擎 + 容量约束 + 自然语言 brief |
| Today v2 | 已实现 | Morning Brief + Focus + Waiting + Re-plan + Outcome |
| Inbox v2 | 已实现 | 快速采集 + AI 审核 + Evidence 显示 + 编辑 + 接受 / 拒绝 |
| Memory v2 | 已实现 | 全文检索 + 带 snippet 和 source id；带引用 |
| Waiting | 已实现 | 状态机要求 reviewAt + waitingOn（id 或 text）|
| Outcome | 已实现 | `completeWithOutcome` + Outcome 文件 + audit |
| Close-loop Follow-up | 已实现 | `detectFollowUps` 启发式 + `close_loop` Proposal；用户审阅后 accept |
| Today Waiting Review | 已实现 | MorningBrief 显示 `getWaitingOverdue`，只提示不自动恢复 |
| §26 step 3-6 验证 | 已实现 | `ScriptedProvider` 单元测试 + `extractorFixture.test.ts` 覆盖 4 个子场景 |
| §26 step 14 验证 | 已实现 | e2e step 9b 检测 follow-up proposal + accept |
| §26 step 17 验证 | 已实现 | NoteDocument 创建无 title 落盘 + autosave PATCH 持久化 + 刷新后 GET 还在 (1.1.3 e2e `note-acceptance.spec.ts`) |
| §26 step 18 验证 | 已实现 | NoteService update 必传 expectedAutoSaveVersion, body 字段不被自动改 (1.1.0 + 1.1.3 e2e) |
| §26 step 19 验证 | 已实现 | `memoryService.search` 召回 Note (`type: 'note'`, 1.1.0) + backlinks service 走 evidence 反向找 Commitment/Decision/Outcome (1.1.3) |
| Triage / 旧任务整理 | 已有骨架 | `Triage Proposal` 类型已支持；UI 部分由 Phase 7 跟进 |
| Meeting Capture | 部分 | 已有 MeetingCapture 路由；提取走 v2 Extractor；Phase 3 余下与音视频关联 |
| Calendar Connector | 协议 + 阻塞 | Connector Contract 已实现；所有外部 connector 默认 `blocked_by_external_authorization`；Google/Outlook/Feishu 全部就位但 `isAuthorized` 永远返回 false |
| Email/Message Connector | 协议 + 阻塞 | 同上；Gmail/Outlook/Feishu 全部就位但 `isAuthorized` 永远返回 false |
| External Actions | 协议就位 | `buildDraft` 完整；`confirmAndSend` 走 `blockedSendImpl` 默认实现；UI/Preview/Confirm 流在路由层；真实发送需 Provider 凭据 |
| Phase 5/6/8 Connector SDK | 已实现 | 所有 connector 统一 `ConnectorAdapter` 接口 + `isAuthorized` + `fetchEvents`；calendar 9 个全部 default-blocked；按 spec §17.1 顺序逐个接入 |
| Mobile Capture | 协议 + 实现 | `issueMobileToken` / `authenticateMobileToken` / `mobileCapture` 完整 |
| Export / MCP | 已实现 | `listEntities` / `getEntity` / `searchEntities` 三端点，v2 数据只读导出 |
| Commit `6702180` | §26 follow-up + waiting review | detectFollowUps heuristic + close_loop Proposal; Today getWaitingOverdue UI |
| Commit `2f8c903` | §26 step 10 + 15 | CommitmentContext + getContext Decision linking + manual /evidence endpoint + memory type tags |
| Commit `8f55432` | §26 visual verification | multi-page Vite build + Playwright screenshots |
| Audit / Undo | 已实现 | `.dailyflow/audit.jsonl` 追加式；按 entity 检索；可回溯变更 |
| Connector SDK | 部分 | Connectors 服务提供 `connect/sync/health/pause/disconnect` 签名；外部实现按 spec §17 顺序逐个接入 |
| Conflict Detection | 已实现 | `expectedHash` mismatch 抛 `ConcurrentModificationError` → 409 |
| Atomic Write | 已实现 | 临时文件 + fsync + rename + 目录 fsync |
| 提示注入防护 | 部分 | 外部内容在 Extractor 中作为 data 处理（不作为 instruction），未在 prompt 模板中混入工具调用 |
| 迁移 / 兼容 | 已实现 | Legacy adapter + 状态机 + `legacyTaskId` 字段连接 v1↔v2 |
| v2 持久化 | 真实 | 所有 v2 写入走真实 Markdown 路径，重启后状态保留 |
| v2 UI | 已实现 | `src/features/v2/{V2Shell, today/TodayView, inbox/InboxView, memory/MemoryView, commitments/CommitmentContext, review/ReviewView}` + 独立 `v2-standalone.html` |

---

## 26. 最终验收场景

当以下场景可以在真实数据、真实模型和真实持久化条件下完整运行,DailyFlow 才算实现了这份产品定义:

1. 用户粘贴一段混乱的会议纪要。
2. 原始内容立即保存在 Notes Inbox,用户也可以继续把它编辑成 Note。
3. AI 找到两项明确承诺、一项他人承诺和一个决定。
4. 系统没有把他人承诺错误分配给用户。
5. 用户能查看每个字段对应的原文 Evidence。
6. 用户修改其中一个日期,接受两项,拒绝一项。
7. Commitment 在重启应用后仍存在。
8. 第二天 Planner 根据可用时间、截止日期和等待状态生成计划。
9. 用户说"下午只剩两小时",系统生成 Re-plan Proposal 并解释取舍。
10. 用户进入一个 Commitment,看到相关会议决定和下一步。
11. 用户把它设为等待 Alex,并设置周三复查。
12. 周三系统提醒复查,但不擅自恢复或发送消息。
13. 用户最终完成,记录实际 Outcome。
14. 系统识别一个新的后续承诺,等待用户确认。
15. 用户一个月后询问"当时为什么这样决定",系统用 Decision 和 Evidence 回答。
16. 整个过程没有要求用户手动维护文件夹、复制任务或重复补充上下文。
17. 用户创建一篇无标题 Note 后立即开始书写,离开和重启应用均不丢失内容。
18. AI 在不改写原文的情况下提出带 Evidence 的决定和承诺,用户可以逐项确认。
19. Note 中能看到引用它的 Commitment、Decision 和 Outcome 的最新状态,这些关系不因任务迁移或标题修改而失效。

这才是 DailyFlow 与传统 Todo 工具的本质区别。
