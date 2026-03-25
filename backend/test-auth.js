const jwt = require('jsonwebtoken');
const token = jwt.sign({ id: '65f1a2b3c4d5e6f7g8h9i0j1' }, process.env.JWT_SECRET || 'dev-secret-change-me', { expiresIn: '1h' });
console.log(token);
