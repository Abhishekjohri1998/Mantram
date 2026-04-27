import jwt from 'jsonwebtoken';
import User from './backend/models/User.js';
import connectDB from './backend/config/db.js';
import dotenv from 'dotenv';
dotenv.config({ path: './backend/.env' });

async function run() {
  await connectDB();
  const superadmin = await User.findOne({ role: 'superadmin' });
  const token = jwt.sign({ id: superadmin._id }, process.env.JWT_SECRET, { expiresIn: '1h' });

  const res = await fetch('http://localhost:3001/api/templates?limit=10', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  let data;
  if (!res.ok) {
    console.log('GET /api/templates failed:', res.status, await res.text());
  } else {
    data = await res.json();
    console.log('Count:', data.templates?.length);
    if (data.templates?.length > 0) {
      console.log('First:', JSON.stringify(data.templates[0], null, 2));
    } else {
      console.log('No templates returned!', data);
    }
  }

  // Also check POST /api/templates/:id/use
  console.log('\n--- Checking POST /api/templates/:id/use ---');
  if (data?.templates?.length > 0) {
      const templateId = data.templates[0]._id;
      const useRes = await fetch(`http://localhost:3001/api/templates/${templateId}/use`, {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
              userInputs: {
                  brandName: 'Test Brand',
                  productContext: 'Test context'
              }
          })
      });
      console.log('POST Status:', useRes.status);
      console.log('POST Body:', await useRes.text());
  }

  process.exit(0);
}
run().catch(console.error);
