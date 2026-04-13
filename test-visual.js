import 'dotenv/config';
import { callAgent } from './backend/agents/shared/agentUtils.js';
const res = await callAgent('You are an artist.', 'Draw a cat', 0.6, 100);
console.log(res);
