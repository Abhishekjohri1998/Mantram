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

  console.log('=== SECTION 1: DB INTEGRITY ===');
  
  // Query 1
  const categories = await db.collection('qadscategories').find().toArray();
  console.log(`Q1 QAdsCategory count: ${categories.length}`);
  categories.forEach(c => console.log(` - ${c.name} (slug: ${c.slug}, color: ${c.color}, isActive: ${c.isActive}, sortOrder: ${c.sortOrder})`));

  // Query 2
  const presets = await db.collection('qadspresets').find().toArray();
  console.log(`\nQ2 QAdsPreset count: ${presets.length}`);
  let emptyPromptRules = false;
  presets.forEach(p => {
      const pr = p.promptRules || {};
      if (!pr.cameraSignature || !pr.pacing || !pr.register || !pr.environmentDefault) emptyPromptRules = true;
  });
  console.log(` - Any empty promptRules strings? ${emptyPromptRules}`);

  // Query 3
  const catIds = new Set(categories.map(c => c._id.toString()));
  const orphanedPresets = presets.filter(p => !catIds.has(p.categoryId.toString()));
  console.log(`\nQ3 Orphaned Presets: ${orphanedPresets.length}`);

  // Query 4
  const templates = await db.collection('templates').find().toArray();
  const nullPromptTemplates = templates.filter(t => !t.savedPrompt || t.savedPrompt.trim() === '');
  console.log(`\nQ4 Templates with empty savedPrompt: ${nullPromptTemplates.length}`);

  // Query 5
  const brokenActiveTemplates = templates.filter(t => t.isActive && (!t.previewUrl || t.previewUrl.trim() === ''));
  console.log(`\nQ5 Active templates without previewUrl: ${brokenActiveTemplates.length}`);

  // Query 6
  const templateCategories = await db.collection('templatecategories').find().toArray();
  const tCatIds = new Set(templateCategories.map(c => c._id.toString()));
  const orphanedTemplates = templates.filter(t => !tCatIds.has(t.categoryId.toString()));
  console.log(`\nQ6 Orphaned Templates: ${orphanedTemplates.length}`);

  // Query 7
  const start1 = Date.now();
  await fetch(`${API_URL}/ugc-pro/qads/v2/presets`, { headers: headersSuper });
  const time1 = Date.now() - start1;
  
  const start2 = Date.now();
  await fetch(`${API_URL}/ugc-pro/qads/v2/presets`, { headers: headersSuper });
  const time2 = Date.now() - start2;
  console.log(`\nQ7 Redis Cache timing - Call 1: ${time1}ms, Call 2: ${time2}ms`);


  console.log('\n=== SECTION 2: BACKEND API REVIEW ===');
  
  let tCatId = null;
  // Test 1
  let res = await fetch(`${API_URL}/superadmin/template-categories`, { method: 'POST', headers: headersSuper, body: JSON.stringify({ name: 'Test QA', sortOrder: 99 }) });
  let data = await res.json();
  console.log(`T1 POST /template-categories valid: ${res.status}`);
  if (data.category) tCatId = data.category._id;

  // Test 2
  res = await fetch(`${API_URL}/superadmin/template-categories`, { method: 'POST', headers: headersSuper, body: JSON.stringify({ sortOrder: 99 }) });
  console.log(`T2 POST /template-categories missing name: ${res.status}`);

  // Test 3
  res = await fetch(`${API_URL}/superadmin/template-categories`, { method: 'POST', headers: headersUser, body: JSON.stringify({ name: 'Test QA User' }) });
  console.log(`T3 POST /template-categories as user: ${res.status}`);

  // Test 4
  res = await fetch(`${API_URL}/superadmin/template-categories/reorder`, { method: 'PUT', headers: headersSuper, body: JSON.stringify({ orderedIds: templateCategories.map(c => c._id.toString()) }) });
  console.log(`T4 PUT /template-categories/reorder: ${res.status}`);

  // Test 5
  if (templates.length > 0) {
      res = await fetch(`${API_URL}/superadmin/templates/${templates[0]._id}`, { method: 'PUT', headers: headersSuper, body: JSON.stringify({ savedPrompt: 'HACK' }) });
      console.log(`T5 PUT /templates/:id with savedPrompt: ${res.status}`);
  }

  // Test 6
  res = await fetch(`${API_URL}/templates`);
  console.log(`T6 GET /templates without auth: ${res.status}`);
  const t6Data = await res.json().catch(() => null);
  if (t6Data && t6Data.templates) console.log('  - Exposed templates publicly!');

  // Test 7
  if (templates.length > 0) {
      res = await fetch(`${API_URL}/templates/${templates[0]._id}`);
      console.log(`T7 GET /templates/:id without auth: ${res.status}`);
  }

  // Test 8
  // Assuming user has 0 credits (or not enough). I will just check the response
  if (templates.length > 0) {
      res = await fetch(`${API_URL}/templates/${templates[0]._id}/use`, { method: 'POST', headers: headersUser, body: JSON.stringify({ prompt: 'Test' }) });
      console.log(`T8 POST /templates/:id/use (user): ${res.status} - ${JSON.stringify(await res.json())}`);
  }

  // Test 9
  res = await fetch(`${API_URL}/templates/000000000000000000000000/use`, { method: 'POST', headers: headersUser, body: JSON.stringify({ prompt: 'Test' }) });
  console.log(`T9 POST /templates/fake/use: ${res.status}`);

  // Test 10
  const inactiveTemplate = templates.find(t => !t.isActive);
  if (inactiveTemplate) {
      res = await fetch(`${API_URL}/templates/${inactiveTemplate._id}/use`, { method: 'POST', headers: headersUser, body: JSON.stringify({ prompt: 'Test' }) });
      console.log(`T10 POST /templates/inactive/use: ${res.status}`);
  }

  // Test 11
  const usedTemplate = templates.find(t => t.usageCount > 0);
  if (usedTemplate) {
      res = await fetch(`${API_URL}/superadmin/templates/${usedTemplate._id}?permanent=true`, { method: 'DELETE', headers: headersSuper });
      console.log(`T11 DELETE /superadmin/templates/used?permanent=true: ${res.status}`);
  }

  // Test 12
  if (presets.length > 0) {
      const activeCat = categories.find(c => presets.some(p => p.categoryId.toString() === c._id.toString()));
      if (activeCat) {
          res = await fetch(`${API_URL}/superadmin/qads/categories/${activeCat._id}`, { method: 'DELETE', headers: headersSuper });
          console.log(`T12 DELETE /superadmin/qads/categories/active: ${res.status}`);
      }
  }

  process.exit(0);
}

runTests().catch(console.error);
