# 使用官方 Node.js 运行环境（轻量 Alpine 版）
FROM node:20-alpine

# 设置工作目录
WORKDIR /app

# 复制 package.json / package-lock.json
COPY package*.json ./

# 安装依赖（包括 @hono/node-server、mongodb、hono）
RUN npm install --production

# 复制源码
COPY . .

# 暴露端口
EXPOSE 9989

# 启动应用
CMD ["node", "index.js"]
