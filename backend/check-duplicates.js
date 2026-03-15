import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import User from './models/User.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

async function checkUsers() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const users = await User.find({ email: 'dasaachin@gmail.com' });
        console.log('--- USERS WITH EMAIL dasaachin@gmail.com ---');
        console.log(JSON.stringify(users, null, 2));
        
        const allUsers = await User.countDocuments();
        console.log('\nTotal users in DB:', allUsers);
        
        await mongoose.connection.close();
    } catch (error) {
        console.error('Error:', error);
    }
}

checkUsers();
