const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
require('dotenv').config({path: './backend/.env'});

const JWT_SECRET = process.env.JWT_SECRET;
const API_URL = 'http://localhost:3001/api';

async function runTests() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  
  const superadmin = await db.collection('users').findOne({ role: 'superadmin' });
  const regularUser = await db.collection('users').findOne({ role: 'user' });
  
  const superAdminToken = jwt.sign({ id: superadmin._id.toString() }, JWT_SECRET, { expiresIn: '1h' });
  const userToken = jwt.sign({ id: regularUser._id.toString() }, JWT_SECRET, { expiresIn: '1h' });

  const headersSuper = { 'Authorization': `Bearer ${superAdminToken}`, 'Content-Type': 'application/json' };
  const headersUser = { 'Authorization': `Bearer ${userToken}`, 'Content-Type': 'application/json' };

  console.log('\n=== SECTION 2 (Part 2) ===');
  
  let res = await fetch(`${API_URL}/superadmin/templates/categories`, { method: 'POST', headers: headersSuper, body: JSON.stringify({ name: 'Test QA', sortOrder: 99 }) });
  let data = await res.json();
  console.log(`T1 POST /templates/categories valid: ${res.status} - ${JSON.stringify(data)}`);

  res = await fetch(`${API_URL}/superadmin/templates/categories`, { method: 'POST', headers: headersSuper, body: JSON.stringify({ sortOrder: 99 }) });
  console.log(`T2 POST /templates/categories missing name: ${res.status}`);

  res = await fetch(`${API_URL}/superadmin/templates/categories`, { method: 'POST', headers: headersUser, body: JSON.stringify({ name: 'Test QA User' }) });
  console.log(`T3 POST /templates/categories as user: ${res.status}`);

  const qCat = await db.collection('qadscategories').findOne();
  res = await fetch(`${API_URL}/superadmin/qads/presets`, { method: 'POST', headers: headersSuper, body: JSON.stringify({ 
      presetCode: 'qa_test', name: 'QA', categoryId: qCat._id, isActive: true, 
      promptRules: { cameraSignature: 'cam', pacing: 'fast', register: 'formal' } 
  })});
  const data13 = await res.json();
  console.log(`T13 POST /qads/presets missing envDefault: ${res.status} - ${JSON.stringify(data13)}`);

  const presets = await db.collection('qadspresets').find().toArray();
  const presetId = presets[0]._id;
  const originalEnv = presets[0].promptRules.environmentDefault;
  res = await fetch(`${API_URL}/superadmin/qads/presets/${presetId}`, { method: 'PUT', headers: headersSuper, body: JSON.stringify({ 
      promptRules: { ...presets[0].promptRules, environmentDefault: 'UPDATED_ENV' } 
  })});
  console.log(`T14 PUT preset: ${res.status}`);
  const cacheRes = await fetch(`${API_URL}/ugc-pro/qads/v2/presets`, { headers: headersSuper });
  const cacheData = await cacheRes.json();
  const pInCache = cacheData.presets.find(p => p._id === presetId.toString());
  console.log(`T14 Cache update test. Env in cache: ${pInCache?.promptRules?.environmentDefault}`);
  await fetch(`${API_URL}/superadmin/qads/presets/${presetId}`, { method: 'PUT', headers: headersSuper, body: JSON.stringify({ 
      promptRules: { ...presets[0].promptRules, environmentDefault: originalEnv } 
  })});

  res = await fetch(`${API_URL}/superadmin/qads/presets`, { method: 'POST', headers: headersUser, body: JSON.stringify({ presetCode: 'x' }) });
  console.log(`T31 POST qads preset as user: ${res.status}`);

  const inactiveT = await db.collection('templates').findOne({ isActive: false });
  if (inactiveT) {
      res = await fetch(`${API_URL}/superadmin/templates/${inactiveT._id}`, { method: 'PUT', headers: headersUser, body: JSON.stringify({ isActive: true }) });
      console.log(`T32 PUT activate template as user: ${res.status}`);
  }

  res = await fetch(`${API_URL}/templates`, { headers: headersUser });
  const data33 = await res.json();
  const exposed = data33.templates?.some(t => t.savedPrompt !== undefined);
  console.log(`T33 GET /templates exposes savedPrompt: ${exposed}`);

  process.exit(0);
}
runTests().catch(console.error);
