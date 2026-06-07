# mongodb_altas

MongoDB Atlas REST API 服务，基于 Hono 框架。

**支持两种部署方式：**

- **Vercel Serverless** — 零服务器维护，自动扩缩容
- **Node.js / Docker** — 传统部署，自行管理服务器

---

## API 接口

所有接口均为 `POST`，请求体为 JSON。

| 接口 | 说明 | 请求体字段 |
|------|------|-----------|
| `/find` | 查询多个文档 | `filter` |
| `/findOne` | 查询单个文档 | `filter` |
| `/insertOne` | 插入单个文档 | `document` |
| `/insertMany` | 插入多个文档 | `documents` (数组) |
| `/updateOne` | 更新单个文档 | `filter`, `update`, `options` |
| `/updateMany` | 更新多个文档 | `filter`, `update`, `options` |
| `/deleteOne` | 删除单个文档 | `filter` |
| `/deleteMany` | 删除多个文档 | `filter` |

认证参数可从请求体或环境变量传入：

- `USERNAME` / `MONGODB_USERNAME`
- `PASSWORD` / `MONGODB_PASSWORD`
- `DATABASE` / `MONGODB_DB` (默认 `telegram`)
- `COLLECTION` / `MONGODB_COLLECTION` (默认 `test`)

---

## Vercel 部署

1. Fork 或 clone 本仓库
2. 在 Vercel Dashboard 导入项目
3. 设置环境变量：`MONGODB_USERNAME`, `MONGODB_PASSWORD`, `MONGODB_DB`, `MONGODB_COLLECTION`
4. 部署

## Docker 部署

```bash
docker build -t mongodb-altas .
docker run -p 9989:9989 \
  -e MONGODB_USERNAME=xxx \
  -e MONGODB_PASSWORD=xxx \
  mongodb-altas
```

## 本地开发

```bash
npm install
npm start
```