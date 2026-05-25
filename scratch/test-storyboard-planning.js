import mongoose from '../backend/node_modules/mongoose/index.js';
import dotenv from 'dotenv';
import { planStoryboardScenes } from '../backend/agents/videoStudio/scenePlanner.js';
import VideoProject from '../backend/models/VideoProject.js';
import Brand from '../backend/models/Brand.js';

import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), 'backend/.env') });

async function run() {
  try {
    console.log('Connecting to MongoDB using URI from backend/.env...');
    console.log('MONGODB_URI:', process.env.MONGODB_URI ? 'Defined' : 'UNDEFINED');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to DB');
    console.log('Connection readyState:', mongoose.connection.readyState);
    console.log('Connection host:', mongoose.connection.host);
    console.log('Connection name:', mongoose.connection.name);

    // 1. Mock Planning Test
    console.log('\n--- 1. Testing with Mock Data ---');
    const mockResult = await planStoryboardScenes({
      videoPrompt: 'A premium advertisement showing a smart watch. Scene 1: The watch is on a wooden table. Voiceover: "Introducing the new chronos". Scene 2: A person is running with the watch on. Voiceover: "Track your fitness in real time". Scene 3: The watches battery display. Voiceover: "Lasts for 7 days".',
      imageUrl: 'https://placehold.co/600x400',
      targetDuration: 30,
      language: 'English',
      brandContext: 'Brand: Chronos. Tone: Premium, active, futuristic.',
      productName: 'Chronos Pro Watch',
      productFeatures: 'GPS, Heart rate tracking, 7-day battery life',
    });
    console.log('Mock planning result:', JSON.stringify(mockResult, null, 2));

    // 2. Database Planning Test (using a recent project if available)
    const project = await VideoProject.findOne({ studioMode: 'storyboard' }).populate('brand').sort({ createdAt: -1 });
    if (project) {
      console.log(`\n--- 2. Testing with Database Project ${project._id} ---`);
      console.log(`Title: ${project.title}`);
      console.log(`Video Prompt: ${project.storyboard?.videoPrompt}`);
      console.log(`Language: ${project.storyboard?.dialogueLanguage || 'English'}`);
      
      let brandContext = '';
      let productName = '';
      let productFeatures = '';
      if (project.brand) {
        productName = project.brand.name || '';
        if (project.brand.dna) {
          const desc = project.brand.dna.brandDescription || project.brand.dna.companyOverview || '';
          const tagline = project.brand.dna.tagline || '';
          brandContext = `Brand Name: ${productName}\nTagline: ${tagline}\nDescription: ${desc}`;
        }
      }
      if (project.input) {
        productFeatures = project.input.brief || '';
      }

      const dbResult = await planStoryboardScenes({
        videoPrompt: project.storyboard?.videoPrompt || 'An ad film',
        imageUrl: project.storyboard?.imageUrl || 'https://placehold.co/600x400',
        targetDuration: 20, // test short long-form
        language: project.storyboard?.dialogueLanguage || 'English',
        brandContext,
        productName,
        productFeatures,
      });
      console.log('DB project planning result:', JSON.stringify(dbResult, null, 2));
    } else {
      console.log('\n--- No storyboard projects found in DB for DB test ---');
    }

  } catch (e) {
    console.error('Error in test:', e);
  } finally {
    process.exit(0);
  }
}

run();
