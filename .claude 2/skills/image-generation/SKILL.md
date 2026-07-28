# Skill: 配图生成

> 扫描文章中的 IMAGE 标记，自动生成配图并回填引用。

## 触发条件

当 `$OUT/article.md` 已生成且包含 `[IMAGE: ...]` 标记时触发（`$OUT` 为主编排创建的当前输出目录）。

## 执行步骤

1. **扫描标记**：读取 `$OUT/article.md`，提取所有 `[IMAGE: 描述]` 标记
   - 记录每个标记的位置和描述内容

2. **生成 Prompt**：将中文描述翻译为英文图片生成提示词
   - 风格：clean, modern, technical illustration
   - 尺寸：1024x768（横版）
   - 添加风格修饰词确保一致性

3. **调用图片生成 API**：执行 `scripts/gen_image.py`
   - 使用 SiliconFlow API（兼容 OpenAI 接口）
   - 模型：`black-forest-labs/FLUX.1-schnell`
   - 保存到 `$OUT/images/` 目录，文件名为 `img_01.png`, `img_02.png` ...

4. **回填引用**：将 article.md 中的 `[IMAGE: ...]` 替换为 Markdown 图片语法
   ```markdown
   ![描述](images/img_01.png)
   ```

## 输出

- 图片文件保存在 `$OUT/images/` 目录
- 更新 `$OUT/article.md`，将所有 IMAGE 标记替换为实际图片引用

## API 配置

需要在环境变量或 `.env` 文件中配置：

```bash
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxx
OPENAI_BASE_URL=https://api.siliconflow.cn/v1
```

## 注意事项

- 如果 API 调用失败，保留原始 `[IMAGE: ...]` 标记，不要删除
- 每张图片生成后验证文件大小 > 0
- 图片文件名按顺序编号，方便排查
