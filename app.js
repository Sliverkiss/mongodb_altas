import { Hono } from 'hono';
import { MongoClient, ObjectId, ServerApiVersion } from 'mongodb';

// -------------------- 连接池管理（全局单例缓存） --------------------
// Serverless 环境下 warm instance 会复用全局变量，避免每次请求都新建连接
const clientCache = new Map();

async function getCachedClient(uri) {
  if (clientCache.has(uri)) {
    return clientCache.get(uri);
  }
  const client = new MongoClient(uri, {
    serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true },
    maxPoolSize: 10,
    minPoolSize: 2,
    connectTimeoutMS: 10000,
    socketTimeoutMS: 30000,
  });
  await client.connect();
  clientCache.set(uri, client);
  return client;
}

// -------------------- 辅助函数 --------------------

// 递归深度保护，防止恶意嵌套导致栈溢出
const MAX_TRANSFORM_DEPTH = 32;

function transformObjectIds(value, ancestorKey = null, depth = 0) {
  if (depth > MAX_TRANSFORM_DEPTH) return value;
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(v => transformObjectIds(v, ancestorKey, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      const newAncestor = (k === '_id' || k.endsWith('Id') || k.endsWith('_id')) ? k : ancestorKey;
      out[k] = transformObjectIds(v, newAncestor, depth + 1);
    }
    return out;
  }
  if (ancestorKey && typeof value === 'string' && ObjectId.isValid(value) && value.length === 24) {
    return new ObjectId(value);
  }
  return value;
}

// -------------------- 集合获取 --------------------
async function getCollection({ USERNAME, PASSWORD, DATABASE, COLLECTION }) {
  USERNAME = USERNAME || process.env.MONGODB_USERNAME;
  PASSWORD = PASSWORD || process.env.MONGODB_PASSWORD;
  DATABASE = DATABASE || process.env.MONGODB_DB || 'telegram';
  COLLECTION = COLLECTION || process.env.MONGODB_COLLECTION || 'test';

  if (!USERNAME || !PASSWORD || !DATABASE || !COLLECTION) {
    throw new Error('USERNAME, PASSWORD, DATABASE, COLLECTION are required');
  }

  const uri = `mongodb+srv://${USERNAME}:${encodeURIComponent(PASSWORD)}@sliverkiss.gxsiblt.mongodb.net/${DATABASE}?retryWrites=true&w=majority&authSource=admin`;
  const client = await getCachedClient(uri);
  const db = client.db(DATABASE);
  return { collection: db.collection(COLLECTION) };
}

// -------------------- 请求处理中间件 --------------------
async function withCollection(c, handler, actionName) {
  let body = {};
  try {
    const text = await c.req.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    body = {};
  }

  const { USERNAME, PASSWORD, DATABASE, COLLECTION } = body;
  try {
    const colObj = await getCollection({ USERNAME, PASSWORD, DATABASE, COLLECTION });
    const result = await handler(body, colObj.collection);
    return result;
  } catch (err) {
    return c.json({ error: err.message }, 400);
  }
}

// -------------------- Hono App --------------------export
const app = new Hono();

app.get('/', (c) => c.text('Hono + MongoDB server is running.'));

// 查询多个
app.post('/find', async (c) =>
  withCollection(c, async (body, collection) => {
    const docs = await collection.find(transformObjectIds(body.filter || {})).toArray();
    return c.json({ documents: docs });
  }, 'find')
);

// 查询单个
app.post('/findOne', async (c) =>
  withCollection(c, async (body, collection) => {
    const doc = await collection.findOne(transformObjectIds(body.filter || {}));
    return c.json({ documents: doc ? [doc] : [] });
  }, 'findOne')
);

// 插入单个
app.post('/insertOne', async (c) =>
  withCollection(c, async (body, collection) => {
    const res = await collection.insertOne(transformObjectIds(body.document || {}));
    return c.json({ insertedId: res.insertedId });
  }, 'insertOne')
);

// 插入多个
app.post('/insertMany', async (c) =>
  withCollection(c, async (body, collection) => {
    const docs = (body.documents || []).map(transformObjectIds);
    const res = await collection.insertMany(docs);
    return c.json({ insertedIds: res.insertedIds });
  }, 'insertMany')
);

// 更新单个
app.post('/updateOne', async (c) =>
  withCollection(c, async (body, collection) => {
    let update = transformObjectIds(body.update || {});
    if (!Object.keys(update).some(k => k.startsWith('$'))) update = { $set: update };
    const res = await collection.updateOne(transformObjectIds(body.filter || {}), update, body.options || {});
    return c.json({
      matchedCount: res.matchedCount,
      modifiedCount: res.modifiedCount,
      upsertedId: res.upsertedId ?? null
    });
  }, 'updateOne')
);

// 更新多个
app.post('/updateMany', async (c) =>
  withCollection(c, async (body, collection) => {
    let update = transformObjectIds(body.update || {});
    if (!Object.keys(update).some(k => k.startsWith('$'))) update = { $set: update };
    const res = await collection.updateMany(transformObjectIds(body.filter || {}), update, body.options || {});
    return c.json({ matchedCount: res.matchedCount, modifiedCount: res.modifiedCount });
  }, 'updateMany')
);

// 删除单个
app.post('/deleteOne', async (c) =>
  withCollection(c, async (body, collection) => {
    const res = await collection.deleteOne(transformObjectIds(body.filter || {}));
    return c.json({ deletedCount: res.deletedCount });
  }, 'deleteOne')
);

// 删除多个
app.post('/deleteMany', async (c) =>
  withCollection(c, async (body, collection) => {
    const res = await collection.deleteMany(transformObjectIds(body.filter || {}));
    return c.json({ deletedCount: res.deletedCount });
  }, 'deleteMany')
);

export default app;