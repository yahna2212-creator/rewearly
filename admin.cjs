const { connect, col, client } = require('./server.cjs');
(async () => {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (!email) throw new Error('Set ADMIN_EMAIL first.');
  await connect();
  const result = await col('users').updateOne({ email }, { $set: { role: 'admin' } });
  if (!result.matchedCount) throw new Error('Create this account on Rewearly first.');
  console.log('Admin role assigned.');
})().catch(error => { console.error(error.message); process.exitCode = 1; })
  .finally(() => client?.close());
