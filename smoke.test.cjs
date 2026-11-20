const test = require('node:test');
const assert = require('node:assert/strict');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
test('Rewearly account, moderation and checkout', async t => {
  const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  t.after(() => mongo.stop());
  Object.assign(process.env, { MONGO_URI: mongo.getUri(), JWT_SECRET: 'x'.repeat(48), UPI_ID: 'test@bank' });
  const { app, client, col } = require('./server.cjs');
  const server = app.listen(0);
  t.after(async () => { server.close(); await client.close(); });
  const base = 'http://127.0.0.1:' + server.address().port;
  async function call(path, method = 'GET', body, cookie) {
    const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(cookie && { Cookie: cookie }) },
      ...(body && { body: JSON.stringify(body) }) });
    return { status: r.status, data: await r.json(), cookie: r.headers.get('set-cookie')?.split(';')[0] };
  }
  const register = email => call('/api/auth/register','POST',{ email,password:'local-test-password',name:'Test',phone:'123',address:'Test' });
  const seller = await register('seller@example.test');
  assert.equal(seller.status,200);
  assert.equal((await call('/api/auth/login','POST',{email:'seller@example.test',password:'wrong'})).status,401);
  const login = await call('/api/auth/login','POST',{email:'seller@example.test',password:'local-test-password'});
  assert.equal((await call('/api/auth/me','GET',null,login.cookie)).data.id,seller.data.id);
  const buyer = await register('buyer@example.test');
  const admin = await register('admin@example.test');
  await col('users').updateOne({id:admin.data.id},{$set:{role:'admin'}});
  const outfit = {title:'Lehenga',category:'Ethnic wear',description:'Silk',condition:'excellent',images:['data:image/jpeg;base64,/9j/AA==']};
  const submission = await call('/api/seller/products','POST',{...outfit,requested_price:2800},seller.cookie);
  assert.equal(submission.status,201);
  const id = submission.data.id;
  assert.equal((await call('/api/products')).data.length,0);
  const route = '/api/admin/products/'+id;
  const review = {...outfit,approved:true,active:true,final_price:3500,seller_payout:2800};
  assert.equal((await call(route,'PATCH',review,buyer.cookie)).status,403);
  assert.equal((await call(route,'PATCH',review,admin.cookie)).status,200);
  const confirm = '/api/seller/products/'+id+'/confirm';
  assert.equal((await call(confirm,'POST',null,buyer.cookie)).status,409);
  assert.equal((await call(confirm,'POST',null,seller.cookie)).status,200);
  assert.equal((await call('/api/products')).data[0].seller_payout,undefined);
  const orders = await Promise.all([buyer,seller].map(user => call('/api/orders','POST',{productIds:[id],total:1},user.cookie)));
  assert.deepEqual(orders.map(result => result.status).sort(),[201,409]);
  const created=orders.find(result=>result.status===201);
  assert.match(created.data.paymentUrl,/am=3500.00/);
  assert.equal((await call('/api/admin/orders/'+created.data.id,'PATCH',{status:'paid'},admin.cookie)).status,200);
  assert.equal((await call('/api/seller','GET',null,seller.cookie)).data.earnings[0].amount,2800);
  assert.equal((await fetch(base+'/upload_outfit.html')).status,200);
});
