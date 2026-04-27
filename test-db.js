import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Template from './backend/models/Template.js';
dotenv.config({ path: './backend/.env' });

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const result = await Template.findOne(
    { isActive: true, studioOrigin: 'creative' },
    { name: 1, savedPrompt: 1, previewUrl: 1, studioOrigin: 1, categoryId: 1, usageCount: 1 }
  );
  console.log('Result:', JSON.stringify(result, null, 2));
  process.exit(0);
}
run();
