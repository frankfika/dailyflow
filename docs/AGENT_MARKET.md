# Agent 市场（Skill Marketplace）

> Sprint 1 缺口 10 · 商业模式配套 — 雏形版本

## 目标

让第三方开发者发布 Skill，用户在客户端一键安装。本期只做"注册中心 + 安装"。

**不做**：
- 付费 / 交易
- 评分 / 评论
- 自动更新检测

## 仓库结构（规划）

`dailyflow-skills` GitHub 仓库（待建）：

```
dailyflow-skills/
├── registry.json              # 索引（manifest）
├── skills/
│   ├── okr-alignment/
│   │   ├── SKILL.md           # skill 内容（带 frontmatter）
│   │   └── CHECKSUM           # sha256 of SKILL.md
│   └── standup-recap/
│       ├── SKILL.md
│       └── CHECKSUM
└── README.md
```

## Registry manifest schema

```json
{
  "version": 1,
  "updatedAt": "2026-08-20T00:00:00Z",
  "skills": [
    {
      "id": "okr-alignment",
      "name": "OKR 对齐助手",
      "author": "community",
      "description": "...",
      "tags": ["okr"],
      "source": "github",
      "url": "https://raw.githubusercontent.com/dailyflow/dailyflow-skills/main/skills/okr-alignment/SKILL.md",
      "checksum": "sha256:abc123..."
    }
  ]
}
```

schema 文件：`docs/agent-market/community-skills-registry.example.json`

## 客户端流程

1. 用户点"刷新社区列表"
2. 调 `listCommunitySkills()` → `GET https://raw.githubusercontent.com/.../registry.json`
3. 列表展示
4. 用户点"安装"
5. 调 `installCommunitySkill(skill)`：
   - 下载 skill markdown
   - 算 SHA-256
   - 对比 `skill.checksum`
   - 不匹配 → 拒绝
   - 匹配 → 写入 `localStorage['dailyflow.community_skills.installed']`
6. AIChat 启动时把已安装 skill 合并进 skill 选择器

## 安全

| 风险 | 缓解 |
|---|---|
| 篡改 skill | SHA-256 强校验 |
| 恶意 markdown 注入 | Skill 走 AIChat 现有 prompt 沙箱（不会执行） |
| 上传用户数据 | Skill 是纯 prompt，不主动收集数据 |
| 网络劫持 | HTTPS 强制；checksum 是兜底 |

## API

无独立后端路由 — 客户端直连 GitHub raw（`raw.githubusercontent.com`）。这样零成本、好维护。

未来如果有付费 skill，可以加后端 `POST /api/v2/skills/install`，带 license key。

## 相关文件

- `src/features/v2/skills/communitySkills.ts` — 客户端实现
- `src/features/v2/skills/communitySkills.test.ts` — 9 tests
- `docs/agent-market/community-skills-registry.example.json` — registry 例子
- `docs/AGENT_MARKET_V2.md` — Sprint 0 写的更详细规划

## 发布 Skill 流程（作者侧）

```bash
# 1. fork dailyflow-skills
git clone https://github.com/dailyflow/dailyflow-skills
cd dailyflow-skills

# 2. 创建新 skill
mkdir -p skills/my-new-skill
cat > skills/my-new-skill/SKILL.md << 'EOF'
---
name: My New Skill
description: ...
---
你的 skill prompt。
EOF

# 3. 算 checksum
sha256sum skills/my-new-skill/SKILL.md

# 4. 在 registry.json 加 entry（填入上一步的 checksum）

# 5. PR
git checkout -b add-my-new-skill
git add .
git commit -m "feat(skills): add my-new-skill"
gh pr create
```

## 路线图

| 版本 | 功能 |
|---|---|
| v2.0 (现在) | 注册中心 + 客户端安装 + checksum 校验 |
| v2.1 | 自动更新检测（按 registry `updatedAt`） |
| v3.0 | 付费 / 评论 / 评级 / 数字签名 |
| v3.1 | 第三方市场聚合（不只是 dailyflow-skills） |
