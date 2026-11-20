const express = require('express');
const { MongoClient } = require('mongodb');
const cookies = require('cookie-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { randomUUID } = require('node:crypto');
const path = require('node:path');

const app = express();
const { MONGO_URI, JWT_SECRET, MONGO_DB = 'rewearly', UPI_ID } = process.env;
const client = MONGO_URI && new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
const db = client && client.db(MONGO_DB);
const col = name => db.collection(name);
const jwtOptions = { algorithm: 'HS256', issuer: 'rewearly', audience: 'rewearly-web' };
const session = { httpOnly: true, secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax', path: '/' };
const fail = (status, message) => Object.assign(new Error(message), { status });
const published = { approved: true, active: true, seller_confirmed: true, final_price: { $gt: 0 } };
const statuses = ['pending','paid','dispatched','delivered','completed'];
const stamp = () => new Date().toISOString();
const profile = ({ _id, passwordHash, ...user }) => user;
let ready;
async function connect() {
  if (!db || !JWT_SECRET || JWT_SECRET.length < 32) throw fail(503, 'Database or session configuration is missing.');
  ready ??= (async () => {
    await client.connect();
    await col('users').createIndex({ email: 1 }, { unique: true });
    await col('products').createIndex({ seller_id: 1 });
    await col('orders').createIndex({ 'items.seller_id': 1 });
  })().catch(error => { ready = undefined; throw error; });
  await ready;
}

app.use('/api', express.json({ limit: '3mb' }), cookies(), async (req, res, next) => {
  if (!['GET','HEAD','OPTIONS'].includes(req.method)) {
    const origin = req.get('origin');
    const expected = process.env.APP_ORIGIN || `${req.protocol}://${req.get('host')}`;
    if (origin && origin !== expected) throw fail(403, 'Request origin is not allowed.');
  }
  await connect();
  const raw = req.cookies.rewearly_session;
  if (raw) {
    let claims;
    try { claims = jwt.verify(raw, JWT_SECRET, { algorithms: ['HS256'], issuer: jwtOptions.issuer, audience: jwtOptions.audience }); }
    catch { res.clearCookie('rewearly_session', session); }
    if (claims) req.user = await col('users').findOne({ id: claims.sub });
  }
  next();
});
function signedIn(req, _res, next) {
  if (!req.user) throw fail(401, 'Please sign in first.');
  next();
}
function admin(req, _res, next) {
  if (req.user?.role !== 'admin') throw fail(403, 'Administrator access required.');
  next();
}
function startSession(res, user) {
  const token = jwt.sign({}, JWT_SECRET, { ...jwtOptions, subject: user.id, expiresIn: '2h' });
  res.cookie('rewearly_session', token, { ...session, maxAge: 7200000 }).json(profile(user));
}
function credentials(body) {
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || Buffer.byteLength(password) > 72 || !password) {
    throw fail(400, 'Enter a valid email and password.');
  }
  return { email, password };
}
const attempts = new Map();
function limitAuth(req, _res, next) {
  const now = Date.now();
  for (const [key, entry] of attempts) if (entry.until <= now) attempts.delete(key);
  const ip = req.ip;
  const entry = attempts.get(ip) || { count: 0, until: now + 600000 };
  if (++entry.count > 25) throw fail(429, 'Too many sign-in attempts. Try again later.');
  attempts.set(ip, entry);
  next();
}
app.post('/api/auth/register', limitAuth, async (req, res) => {
  const { email, password } = credentials(req.body);
  if (password.length < 8) throw fail(400, 'Use a password with at least 8 characters.');
  const fields = Object.fromEntries(['name','phone','address'].map(key => [key, String(req.body[key] || '').trim()]));
  if (Object.values(fields).some(value => !value || value.length > 500)) throw fail(400, 'Complete the signup fields.');
  const user = { ...fields, id: randomUUID(), email, role: 'customer', passwordHash: await bcrypt.hash(password, 12) };
  await col('users').insertOne(user);
  startSession(res, user);
});
app.post('/api/auth/login', limitAuth, async (req, res) => {
  const { email, password } = credentials(req.body);
  const user = await col('users').findOne({ email });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) throw fail(401, 'Incorrect email or password.');
  startSession(res, user);
});
app.get('/api/auth/me', (req, res) => res.json(req.user ? profile(req.user) : null));
app.post('/api/auth/logout', (_req, res) => res.clearCookie('rewearly_session', session).json(null));
app.get('/api/health', (_req, res) => res.json({ service: 'Rewearly', status: 'ok' }));

const list = (name, filter = {}, projection = { _id: 0 }) =>
  col(name).find(filter, { projection }).sort({ created_at: -1 }).toArray();
app.get('/api/products', async (_req, res) => res.json(await list('products', published, {
  _id: 0, id: 1, title: 1, category: 1, description: 1, condition: 1, images: 1, final_price: 1,
  created_at: 1, approved: 1, active: 1, seller_confirmed: 1
})));
function earnings(orders) {
  return orders.filter(order => order.status !== 'pending').flatMap(order =>
    order.items.map(item => ({ ...item, order_id: order.id, amount: item.seller_payout, type: 'seller_payout', created_at: order.created_at })));
}
app.get('/api/seller', signedIn, async (req, res) => {
  const seller_id = req.user.id;
  const [products, orders] = await Promise.all([list('products', { seller_id }), list('orders', { 'items.seller_id': seller_id })]);
  res.json({ products, earnings: earnings(orders).filter(item => item.seller_id === seller_id),
    items: orders.flatMap(order => order.items.filter(item => item.seller_id === seller_id).map(item => ({ ...item, order_id: order.id }))) });
});
app.get('/api/admin', admin, async (_req, res) => {
  const [products, orders, users] = await Promise.all([list('products'), list('orders'), list('users', {}, { _id: 0, passwordHash: 0 })]);
  const profiles = new Map(users.map(user => [user.id, user]));
  res.json({ products: products.map(p => ({ ...p, seller_profile: profiles.get(p.seller_id) })),
    orders: orders.map(o => ({ ...o, profile: profiles.get(o.user_id) })), earnings: earnings(orders) });
});
const conditions = ['new_with_tags','excellent','very_good','good'];
function details(body) {
  const fields = Object.fromEntries(['title','category','description'].map(k => [k,String(body[k] || '').trim()]));
  if (Object.values(fields).some(v => !v || v.length > 2000) || !conditions.includes(body.condition)) throw fail(400, 'Complete the outfit details.');
  return { ...fields, condition: body.condition };
}
function price(value, allowZero = false) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < (allowZero ? 0 : .01) || value > 10000000) throw fail(400, 'Enter a valid price.');
  return Math.round(value * 100) / 100;
}
function imageList(images, requireUpload = false) {
  if (!Array.isArray(images) || images.length < 1 || images.length > 5) throw fail(400, 'Add between 1 and 5 photos.');
  const accepted = images.every(image => typeof image === 'string' && (
    /^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]+={0,2}$/.test(image) ||
    (!requireUpload && /^https:\/\/[^\s]+$/i.test(image) && image.length <= 2048)
  ));
  if (!accepted || images.join('').length > 2_650_000) throw fail(400, 'Invalid photos or combined upload too large.');
  return images;
}
app.post('/api/seller/products', signedIn, async (req, res) => {
  const requested_price = price(req.body.requested_price);
  const product = { ...details(req.body), id: randomUUID(), seller_id: req.user.id,
    images: imageList(req.body.images, true), requested_price, seller_payout: requested_price,
    final_price: 0, approved: false, active: true, seller_confirmed: false, created_at: stamp(), total_rentals: 0 };
  await col('products').insertOne(product);
  res.status(201).json({ id: product.id });
});
app.post('/api/seller/products/:id/confirm', signedIn, async (req, res) => {
  const answer = await col('products').updateOne({ id: req.params.id, seller_id: req.user.id, approved: true,
    active: true, final_price: { $gt: 0 } }, { $set: { seller_confirmed: true } });
  if (!answer.matchedCount) throw fail(409, 'This offer is not available for confirmation.');
  res.json(null);
});
app.patch('/api/admin/products/:id', admin, async (req, res) => {
  const current = await col('products').findOne({ id: req.params.id });
  if (!current) throw fail(404, 'Outfit not found.');
  if (current.order_id) throw fail(409, 'An order is already attached to this outfit.');
  const b = req.body;
  const patch = b.title ? { ...details(b), final_price: price(b.final_price, true),
    seller_payout: price(b.seller_payout, true), images: imageList(b.images), seller_confirmed: false } : {};
  for (const key of ['approved','active']) if (typeof b[key] === 'boolean') patch[key] = b[key];
  if ('rejection_reason' in b) patch.rejection_reason = String(b.rejection_reason || '').slice(0, 2000) || null;
  if ((patch.approved ?? current.approved) && !(patch.final_price ?? current.final_price)) throw fail(400, 'Set a selling price before approval.');
  const result = await col('products').updateOne({ id: current.id, order_id: { $exists: false } }, { $set: patch });
  if (!result.matchedCount) throw fail(409, 'The outfit is no longer available.');
  res.json(null);
});
app.delete('/api/admin/products/:id', admin, async (req, res) => {
  const result = await col('products').deleteOne({ id: req.params.id, order_id: { $exists: false } });
  if (!result.deletedCount) throw fail(409, 'The outfit is missing or attached to an order.');
  res.json(null);
});

app.post('/api/orders', signedIn, async (req, res) => {
  if (!UPI_ID || !/^[\w.-]+@[\w.-]+$/.test(UPI_ID)) throw fail(503, 'Checkout is waiting for the store payment configuration.');
  const ids = req.body.productIds;
  if (!Array.isArray(ids) || !ids.length || ids.length > 20 || ids.some(id => typeof id !== 'string') ||
      new Set(ids).size !== ids.length) throw fail(400, 'Select one or more unique outfits.');
  const order = { id: randomUUID(), user_id: req.user.id, status: 'pending', created_at: stamp() };
  await client.withSession(session => session.withTransaction(async () => {
    const items = [];
    for (const id of ids) {
      const p = await col('products').findOneAndUpdate({ id, ...published },
        { $set: { active: false, order_id: order.id } }, { session });
      if (!p) throw fail(409, 'An outfit is no longer available. Refresh the catalog.');
      const date = order.created_at.slice(0,10);
      items.push({ id: randomUUID(), product_id: id, seller_id: p.seller_id, title: p.title,
        seller_payout: p.seller_payout, start_date: date, end_date: date, line_total: p.final_price });
    }
    const cents = items.reduce((sum, i) => sum + Math.round(i.line_total * 100), 0);
    await col('orders').insertOne({ ...order, items, total: cents / 100 }, { session });
    order.total = cents / 100;
  }));
  const params = new URLSearchParams({ pa: UPI_ID, pn: 'Rewearly', am: order.total.toFixed(2), cu: 'INR', tn: order.id });
  res.status(201).json({ id: order.id, paymentUrl: 'upi://pay?' + params });
});
app.patch('/api/admin/orders/:id', admin, async (req, res) => {
  const index = statuses.indexOf(req.body.status);
  if (index < 0) throw fail(400, 'Unknown order status.');
  const result = await col('orders').updateOne({ id: req.params.id, status: { $in: statuses.slice(0,index + 1) } },
    { $set: { status: req.body.status } });
  if (!result.matchedCount) throw fail(409, 'Order missing or status cannot move backwards.');
  res.json(null);
});
app.use('/api', (_req, res) => res.status(404).json({ error: 'API route not found.' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use((error, _req, res, _next) => {
  if (error.code === 11000) return res.status(409).json({ error: 'This email is already registered.' });
  const status = error.status || (error.name === 'MongoServerSelectionError' ? 503 : 500);
  if (status >= 500) console.error(error.name);
  res.status(status).json({ error: status === 500 ? 'The server could not complete this request.' : error.message });
});

if (require.main === module) app.listen(process.env.PORT || 5000);
module.exports = { app, connect, col, client };
