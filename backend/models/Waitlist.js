import mongoose from 'mongoose';

const waitlistSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        trim: true,
        lowercase: true,
        match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please fill a valid email address']
    },
    company: {
        type: String,
        trim: true
    },
    role: {
        type: String,
        trim: true
    },
    phone: {
        type: String,
        trim: true
    },
    teamSize: {
        type: String,
        trim: true
    },
    message: {
        type: String,
        trim: true
    },
    type: {
        type: String,
        enum: ['individual', 'enterprise'],
        default: 'individual'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

const Waitlist = mongoose.model('Waitlist', waitlistSchema);

export default Waitlist;
