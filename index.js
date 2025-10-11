import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { MongoClient, ObjectId, ServerApiVersion } from 'mongodb';

// -------------------- 辅助函数 --------------------
function transformObjectIds(value, ancestorKey = null) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(v => transformObjectIds(v, ancestorKey));
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      const newAncestor = (k === '_id' || k.endsWith('Id') || k.endsWith('_id')) ? k : ancestorKey;
      out[k] = transformObjectIds(v, newAncestor);
    }
    return out;
  }
  if (ancestorKey && typeof value === 'string' && ObjectId.isValid(value)) return new ObjectId(value);
  return value;
}

async function getCollection({ USERNAME, PASSWORD, DATABASE, COLLECTION }) {
  USERNAME = USERNAME || process.env.MONGODB_USERNAME;
  PASSWORD = PASSWORD || process.env.MONGODB_PASSWORD;
  DATABASE = DATABASE || process.env.MONGODB_DB || 'telegram';
  COLLECTION = COLLECTION || process.env.MONGODB_COLLECTION || 'test';

  if (!USERNAME || !PASSWORD || !DATABASE || !COLLECTION) {
    throw new Error('USERNAME, PASSWORD, DATABASE, COLLECTION are required');
  }

  // 对密码做 URL encode
  const uri = `mongodb+srv://${USERNAME}:${encodeURIComponent(PASSWORD)}@sliverkiss.gxsiblt.mongodb.net/${DATABASE}?retryWrites=true&w=majority&authSource=admin`;
  console.log(`[MongoDB] Connecting to ${DATABASE}.${COLLECTION} as ${USERNAME}`);
  const client = new MongoClient(uri, { serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true } });
  await client.connect();
  console.log('[MongoDB] Connected successfully');
  const db = client.db(DATABASE);
  return { client, collection: db.collection(COLLECTION) };
}

async function withCollection(c, handler, actionName) {
  let body = {};
  try {
    const text = await c.req.text();
    body = text ? JSON.parse(text) : {};
  } catch (err) {
    console.warn(`[Warning] Failed to parse JSON body for action ${actionName}, using empty object`);
    body = {};
  }

  console.log(`[Request] Action: ${actionName}, Body:`, body);

  const { USERNAME, PASSWORD, DATABASE, COLLECTION } = body;
  let client;
  try {
    const colObj = await getCollection({ USERNAME, PASSWORD, DATABASE, COLLECTION });
    client = colObj.client;
    const result = await handler(body, colObj.collection);
    console.log(`[Result] Action: ${actionName} completed successfully`);
    return result;
  } catch (err) {
    console.error(`[Error] Action: ${actionName} failed`, err);
    return c.json({ error: err.message }, 400);
  } finally {
    if (client) {
      await client.close();
      console.log(`[MongoDB] Connection closed for ${DATABASE || 'unknown'}.${COLLECTION || 'unknown'}`);
    }
  }
}

// -------------------- Hono App --------------------
const app = new Hono();

app.get('/', (c) => c.text('Hono + MongoDB server is running.'));

// 查询多个，直接返回原生文档
app.post('/find', async (c) =>
  withCollection(c, async (body, collection) => {
    const docs = await collection.find(transformObjectIds(body.filter || {})).toArray();
    return c.json({ documents: docs });  // <-- 不做 serialize
  }, 'find')
);

// 查询单个
app.post('/findOne', async (c) =>
  withCollection(c, async (body, collection) => {
    const doc = await collection.findOne(transformObjectIds(body.filter || {}));
    return c.json({ documents: doc ? [doc] : [] }); // <-- 原生文档
  }, 'findOne')
);

// 插入单个
app.post('/insertOne', async (c) =>
  withCollection(c, async (body, collection) => {
    const res = await collection.insertOne(transformObjectIds(body.document || {}));
    return c.json({ insertedId: res.insertedId }); // ObjectId 原生返回
  }, 'insertOne')
);

// 插入多个
app.post('/insertMany', async (c) =>
  withCollection(c, async (body, collection) => {
    const docs = (body.documents || []).map(transformObjectIds);
    const res = await collection.insertMany(docs);
    return c.json({ insertedIds: res.insertedIds }); // ObjectId 原生返回
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

// -------------------- 启动服务 --------------------
const port = process.env.PORT || 9989;
serve({ fetch: app.fetch, port });
console.log(`🚀 Hono + MongoDB running on http://localhost:${port}`);
