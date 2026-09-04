# Codex LeetCode

在 Codex 里刷力扣：浏览题库、编写代码、运行测试、提交解答，再让 Codex 帮你评审。

插件通过本地 HTTP 页面提供练习工作台，打开在 Codex 右侧 Browser 面板中，不占用对话区。

## 功能

- **浏览题库**：同步力扣中国站题目目录，支持搜索，以及难度、分类、付费、完成状态、收藏筛选。
- **本地编码**：题目与代码分为两个标签页，内置编辑器，解答默认保存在当前工作区。
- **运行与提交**：使用力扣远程判题，展示结果；正式提交前需要确认。
- **代码评审**：将当前题目、代码和判题结果交给 Codex 分析。

## 安装

需要 Node.js 22.22.2 或更新版本（包含 npm）；浏览器登录需要本机安装 Chrome 或 Edge。

1. 在 Codex 的插件页面打开「添加插件市场」。
2. 来源填写下面的仓库名，Git 引用和稀疏路径留空，然后添加市场。
3. 找到「Codex LeetCode」并安装，新开一个任务使用。

```text
zyh802/codex-leecode-plugin
```

无需手动克隆或构建。首次启动会自动下载本机运行依赖，请保持联网并稍等；后续启动复用本地缓存。

> 市场配置和分发包须已推送到仓库默认分支，本地未推送的修改不会出现在 GitHub 市场中。

## 使用

先对 Codex 说：

```text
打开力扣题库
```

1. **同步题库**：首次使用，点击左下角账号入口 → 同步题库。
2. **选择题目**：搜索或筛选题目，选择语言，点击「创建代码」。
3. **开始练习**：在「代码」页编写解答，保存后点击「Run」运行测试，确认无误再点击「Submit」提交。

运行、提交和查看账号相关状态前，先进入「左下角账号入口 → 设置 → 使用浏览器登录」，在打开的力扣官网窗口中完成登录即可，无需手动查找 Cookie。

其他常用操作：

- **修改保存目录**：设置 → 解答目录，统一应用于后续新建解答。
- **保存代码**：点击「保存代码」，或按 `⌘/Ctrl + S`。
- **请求评审**：点击「让 Codex 评审」，将复制的提示词粘贴到对话中发送。
- **关闭前端**：设置 → 前端进程 → 关闭本地前端；下次仍可让 Codex 重新打开。

## 数据与安全

- 题目目录保存在本地，题面按需从力扣获取；查看题面和远程判题需要联网。
- 登录凭据保存在本机系统凭据库，不写入代码文件或日志；也可选择「仅本次运行」。
- 已有解答不会在创建时被覆盖；插件不绕过付费题权限，也不自动重复提交。

## 本地开发

```bash
npm install
npm run build
npm run check
```

浏览器测试：`npm run test:e2e`；插件连通性检查：`npm run smoke:mcp`。

发布前执行 `npm run build:marketplace`，将生成的 `plugins/codex-leecode-plugin/` 与源码一起提交。`npm run check:marketplace` 检查分发包是否与源码一致；`npm run smoke:marketplace` 验证全新安装与缓存复用。

更多技术细节见 [设计文档](.ai-dev-docs/features/codex-leetcode-plugin/design.md)、[市场分发说明](.ai-dev-docs/features/codex-leetcode-plugin/distribution.md) 和 [任务清单](.ai-dev-docs/features/codex-leetcode-plugin/tasks.md)。
