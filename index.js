import { serve } from '@hono/node-server';
import app from './app.js';

// -------------------- Node.js 独立服务启动 --------------------
const port = process.env.PORT || 9989;
serve({ fetch: app.fetch, port });
console.log(`🚀 Hono + MongoDB running on http://localhost:${port}`);