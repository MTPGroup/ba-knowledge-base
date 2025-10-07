# BA Knowledge Base

本项目是MTP后端，允许用户与游戏《蔚蓝档案》中的角色进行互动。它利用知识库、向量数据库和大型语言模型，提供沉浸式和交互式的聊天体验。

**核心功能:**

- **基于角色的聊天:** 与各种角色进行对话，每个角色都有自己独特的个性和知识库。
- **知识库集成:** 应用程序使用有关角色和《蔚蓝档案》世界的信息知识库，以提供准确且符合角色设定的回答。
- **向量数据库:** 角色知识使用 Milvus 向量数据库进行存储和检索，从而能够高效地进行相似性搜索以获取相关信息。
- **LangGraph 框架:** 对话流程由使用 LangGraph 构建的状态机管理，允许进行复杂和动态的交互。
- **由通义提供支持:** 该应用程序利用Gemini模型进行自然语言理解和生成。
- **现代化 API 文档:** 集成了 Scalar API Reference，提供美观、交互式的 API 文档界面。

## 安装

1.  **克隆仓库:**

    ```bash
    git clone https://github.com/MTPGroup/ba-knowledge-base.git
    cd ba-knowledge-base
    ```

2.  **设置环境变量:**

    通过复制示例文件，在根目录中创建一个 `.env` 文件：

    ```bash
    cp .env.example .env
    ```

    使用您的阿里巴巴通义 API 密钥和任何其他所需配置更新 `.env` 文件。

3.  **安装依赖:**

    本项目使用 yarn 进行包管理。如果尚未安装，请先安装它。

    然后，安装项目依赖：

    ```bash
    yarn install
    ```

4.  **启动向量数据库:**

    项目使用 Milvus 作为向量数据库。提供了一个 `docker-compose.yml` 文件以便于设置。

    ```bash
    docker-compose up -d
    ```

    这将在后台启动 Milvus 数据库及其依赖项。

## 使用

### 1. 导入知识库

在与角色聊天之前，您需要用他们的知识填充向量数据库。`scripts/ingest.ts` 脚本就是为此目的而提供的。它读取 `knowledge_base` 目录下的 Markdown 文件，将它们分割成块，使用阿里巴巴通义生成嵌入，并将它们存储在 Milvus 数据库中。

要运行导入脚本，请使用以下命令：

```bash
yarn milvus:ingest
```

这个过程可能需要一些时间，具体取决于您的知识库的大小。

### 2. 创建/迁移数据库

```bash
yarn pg:migrate
```

### 3. 启动应用程序

数据库填充完毕后，您可以启动聊天应用程序：

```bash
yarn dev
```

默认情况下，服务器将在 `http://localhost:3001` 上启动。

### 4. 访问 API 文档

应用程序提供了现代化的 API 文档界面，由 Scalar API Reference 提供支持：

- **API 文档界面**: `http://localhost:3001/docs`
- **OpenAPI JSON**: `http://localhost:3001/openapi.json`

API 文档包含所有可用的端点、请求/响应格式、认证方式等详细信息，支持直接在浏览器中测试 API。

## 贡献

欢迎贡献！如果您有任何建议、错误报告，或想为代码做出贡献，请随时提出 issue 或提交拉取请求。

### 报告错误

报告错误时，请包括以下信息：

- 清晰简洁的错误描述。
- 重现错误的步骤。
- 预期行为。
- 实际行为。
- 任何相关的错误消息或日志。

### 功能建议

如果您有新功能的想法，请提出 issue 进行讨论。这将使我们能够收集反馈并确定该功能是否适合本项目。

### 提交拉取请求

1.  Fork 本仓库。
2.  为您的功能或错误修复创建一个新分支。
3.  进行更改并使用清晰描述性的提交消息进行提交。
4.  将您的更改推送到您的 fork。
5.  向原始仓库的 `master` 分支提交拉取请求。

在提交拉取请求之前，请确保您的代码遵循现有的代码风格，并且所有测试都通过。

## 许可证

[GNU General Public License v3.0](LICENSE)

## 联系方式

- 作者：hanasaki
- 邮箱：[hanasakayui2022@gmail.com](mailto://hanasakayui2022@gmail.com)
- 交流群: [1057718717](https://qm.qq.com/q/VHpRTUdpO8)
