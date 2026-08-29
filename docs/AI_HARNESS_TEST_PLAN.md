# DailyFlow AI 与 Harness 完整测试计划

> 基线版本：2.3.1  
> 最近执行：2026-08-27  
> 默认真实联调模型：MiniMax-M3  
> Harness：DeepSeek Harness `0.1.1-rc.2` + ACP

## 1. 目标与发布门槛

本计划覆盖 DailyFlow 中所有会向模型发送内容、解释模型输出或把建议转成业务数据的路径。发布必须同时满足：

1. 没有模型时核心任务、笔记和 Event 流程仍可用，且不得伪造 AI 结果。
2. AI 输出必须先成为可审阅 Proposal；确认前正式数据零写入。
3. Harness 只暴露固定 7 个 DailyFlow 工具，不得出现 Shell、文件写入、Terminal 或任意 MCP。
4. 取消、超时、断线、刷新、重复提交、revision 冲突和部分失败都可恢复或明确失败。
5. API Key、完整 Evidence、隐藏推理和工作区路径不得进入 UI 日志或遥测。
6. `lint`、全量 Vitest、Playwright、生产构建和 sidecar bundle 自检全部通过。

## 2. 功能—测试矩阵

| 功能面 | 必测主路径 | 必测异常/安全路径 | 自动化层 |
|---|---|---|---|
| Model Center | provider 增删改、Chat/Meeting 角色、模型切换、配置持久化 | 无 Key、错误 Key、错误模型、超时、网络失败 | Vitest + 浏览器 |
| AI Chat | 新会话、发送、Markdown、停止、重试、历史会话、保存笔记 | 同毫秒会话 ID、跨 workspace 串话、失败消息替换、空响应 | Vitest + 真实 M3 |
| AI Context | Today、指定日期、Note、Project、自定义文本、自动上下文 | 完成任务过滤、缺失实体、空项目、中英文、上下文快照 | Vitest |
| Skills / Tool use | Slash Command、Prompt Skill、Agent knowledge、只读查询 | 未审阅写工具阻断、恶意 tool call、离线 registry | Vitest |
| Today / Inbox | AI 规划、Extractor、Proposal 生成与接受 | waiting 项排除、无模型 fallback、规则校验失败 | Vitest |
| Notes | 总结、发送到 Chat、Decision/Commitment 建议 | 不改写正文、错误友好化、重复保存 | Vitest + E2E |
| Meeting | save-only、远程 OpenAI-compatible、本地 endpoint、whisper.cpp、说话人分离、会后总结 | 音频先保存、失败可重试、SSRF、路径穿越、并发 capture | Vitest |
| Mind Map | by_topic、by_priority、by_time、建议预览与应用 | 纯函数不落盘、空建议、非法策略、撤销/拒绝 | Vitest |
| Proactive AI | 逾期扫描、quiet hours、周上限、接受/忽略 | 全局关闭、重复建议抑制、waiting review | Vitest |
| Event Operator | Context Preview、Run、阶段、Proposal、局部审阅、Apply | 取消、SSE cursor、刷新恢复、冲突、幂等、补偿回滚 | Vitest + E2E |
| Harness sidecar | bundle、ACP initialize/session、M3 调用、handoff | profile 缺失、toolset 污染、进程崩溃、协议 stdout 污染 | Node test + Vitest + 真实 M3 |
| 隐私与网络 | 外发类别和真实控制位置、loopback 模型 | LAN/保留地址、DNS rebinding、凭据/推理脱敏 | Vitest + 浏览器 |

## 3. Harness 专项验收

### 3.1 工具与权限

唯一允许的工具：

- `read_event`
- `read_mindmap`
- `read_evidence`
- `search_evidence`
- `list_commitments`
- `propose_graph_patch`
- `complete_event_run`

工具列表少一个、多一个或被后注册工具污染都必须 fail closed。模型只能读取 server 生成的 bounded projection；单次 projection 最大 2 MiB，proposal 最大 12 个 operation。

### 3.2 状态与恢复

验证完整阶段 `collect → retrieve → extract → resolve → prepare → review`。SSE 同时覆盖显式 `cursor`、`Last-Event-ID`、非法 cursor、刷新后从最后 cursor 续传；取消必须幂等且只能产生一个 terminal event。

### 3.3 写入边界

`propose_graph_patch` 只写 pending Proposal。Apply 时重新校验 base revision、选中 operation 和 idempotency key；domain create 与 graph write 必须原子化或补偿回滚。拒绝 Proposal 不创建任何 Commitment、Decision 或 Outcome。

## 4. 执行顺序与命令

```bash
npm run lint
npm test -- --reporter=dot
npm run test:coverage -- --reporter=dot
npm run check:dsh-bundle
npm run test:e2e
npm run build
```

真实模型联调只使用合成文本和合成 Event；不得把真实 Note、Evidence、Commitment 或工作区路径用于 smoke test。真实联调至少断言：配置模型正确、health ready、toolkit safe、六阶段齐全、proposal 可校验、terminal 为 `run.completed`。

## 5. 2026-08-27 执行结果

- TypeScript：通过。
- Vitest 最终回归：134 files / 979 tests 通过。
- Coverage：Statements 59.48%、Branches 50.95%、Functions 53.92%、Lines 62.90%。
- Playwright：独立前后端端口下 23/23 通过（38.9 秒）。
- 生产构建和 React mount 校验：通过。
- DSH bundle：78 个锁定依赖；2/2 启动与精确工具集自检通过。
- MiniMax-M3 Chat：国内 MiniMax endpoint 真实请求返回精确标记 `DAILYFLOW_M3_OK`（HTTP 200，约 1.9 秒）。
- MiniMax-M3 + DSH ACP：`dsh@0.1.1-rc.2` health ready，model configured，toolkit safe；六阶段完成，实际调用受限 DailyFlow 工具，合成无证据 Event 生成 base revision 匹配的 0-operation Proposal，terminal 为 `run.completed`（约 10.1 秒）。

本轮发现并修复：

1. 左侧导航和 Event Outline/Canvas 之间的分隔线原本不可调整；新增鼠标/触控拖拽、键盘步进、双击复位、尺寸上下限和按 workspace 持久化，并通过刷新恢复 E2E。
2. Chat 会话 ID 存在同毫秒碰撞；改为抗碰撞 ID，并对旧存储自动去重。
3. Chat 仅使用 React `isStreaming` 状态阻止重复提交，同一渲染帧内双击仍可发出两次请求；新增同步 in-flight 锁，并覆盖双击、停止、失败重试替换和跨 workspace 隔离。
4. AI HTTP 代理缺少请求/响应上限、完整 SSRF/DNS 校验、超时和上游错误脱敏；补齐 2 MiB 边界、HTTPS/精确 loopback 策略、DNS rebinding 防护、凭据 URL 拒绝、取消和稳定错误。
5. 结构化 AI Provider 会把上游错误体传入 Harness 失败事件，且未执行统一的远程目标安全策略；现在在 fetch 前重新 DNS 校验，禁止 redirect，限制 2 MiB 响应，并只向运行时返回稳定本地错误。
6. 远程会议转写路径缺少与 Chat/Harness 一致的 SSRF、凭据 URL、HTTPS、DNS rebinding、超时和原始错误体保护；已统一收紧。
7. 会议 Proposal 在 `autoAcceptDecisions` 未传时会默认自动写入高置信变更；改为只有显式 `true` 才允许自动应用，默认 fail closed。
8. Harness sidecar 继承了完整父进程环境，stderr 也可能带出 API Key、Bearer token 和 `<think>` 内容；改为安全环境白名单和多层脱敏。
9. 隐私页错误暗示“此处可关”；改为指向每类外发请求的真实控制位置，并同步 README。
10. 中文空项目上下文显示英文 `(empty)`；改为 `（空）`。
11. 移除启动时的 Google Fonts 远程请求，修复离线隐私边界和截图等待字体的随机超时。
12. Notes E2E 硬编码默认前端端口，在隔离测试中会误连用户工作区；改为使用 Playwright 的当前 `baseURL`，确保测试数据隔离。
