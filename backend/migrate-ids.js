import mongoose from 'mongoose';
import config from './config/env.js';

const collectionsToUpdate = [
    { name: 'videoprojects', field: 'user' },
    { name: 'users', field: 'organization' },
    { name: 'users', field: 'brandAccess', isArray: true }, // Not addressing array right now if empty, but good to note
    { name: 'teaminvites', field: 'invitedBy' },
    { name: 'teaminvites', field: 'organization' },
    { name: 'teaminvites', field: 'acceptedBy' },
    { name: 'teamchats', field: 'organization' },
    { name: 'teamchats', field: 'sender' },
    { name: 'systemsettings', field: 'updatedBy' },
    { name: 'subscriptionpackages', field: 'createdBy' },
    { name: 'subscriptions', field: 'user' },
    { name: 'subscriptions', field: 'createdBy' },
    { name: 'shopifyorders', field: 'user' },
    { name: 'shopifycustomers', field: 'user' },
    { name: 'seoaudits', field: 'user' },
    { name: 'products', field: 'user' },
    { name: 'integrations', field: 'user' },
    { name: 'feedbacks', field: 'user' },
    { name: 'creditusages', field: 'user' },
    { name: 'creatives', field: 'user' },
    { name: 'coupons', field: 'user' },
    { name: 'coupons', field: 'createdBy' },
    { name: 'conversations', field: 'user' },
    { name: 'conversations', field: 'assignedTo' },
    { name: 'contents', field: 'user' },
    { name: 'contacts', field: 'user' },
    { name: 'brandauditlogs', field: 'user' },
    { name: 'approvalrequests', field: 'organization' },
    { name: 'approvalrequests', field: 'requestedBy' },
    { name: 'approvalrequests', field: 'approver' },
    { name: 'brands', field: 'user' },
    { name: 'brands', field: 'sharedWith', isArray: true },
    { name: 'automations', field: 'user' },
    { name: 'adreports', field: 'user' },
    { name: 'adcampaigns', field: 'user' }
];

async function migrateStringIds() {
    try {
        await mongoose.connect(config.mongoUri);
        console.log("Connected to MongoDB for Migration.");

        const db = mongoose.connection.db;
        const usersCol = db.collection('users');

        // Find all users with a String _id
        const users = await usersCol.find({}).toArray();
        const stringUsers = users.filter(u => typeof u._id === 'string');

        console.log(`Found ${stringUsers.length} users with String _ids to migrate.`);
        if (stringUsers.length === 0) {
            console.log("Nothing to migrate.");
            return;
        }

        for (const user of stringUsers) {
            const oldId = user._id;
            const newId = new mongoose.Types.ObjectId();
            console.log(`Migrating user ${user.email} from ${oldId} -> ${newId}`);

            // 1. Delete the old string user first to avoid email unique index collision
            await usersCol.deleteOne({ _id: oldId });
            console.log(`  Deleted old String user ${oldId}.`);

            // 2. Create and insert the copy with the new ObjectId
            const newUserDoc = { ...user, _id: newId };
            await usersCol.insertOne(newUserDoc);
            console.log(`  Inserted new ObjectId user ${newId}.`);

            // 3. Update all related collections
            for (const rel of collectionsToUpdate) {
                const col = db.collection(rel.name);

                if (rel.isArray) {
                    // Update array elements
                    const result = await col.updateMany(
                        { [rel.field]: oldId },
                        { $set: { [`${rel.field}.$`]: newId } }
                    );
                    if (result.modifiedCount > 0) {
                        console.log(`  Updated ${result.modifiedCount} docs in ${rel.name}.${rel.field} (array)`);
                    }
                } else {
                    const result = await col.updateMany(
                        { [rel.field]: oldId },
                        { $set: { [rel.field]: newId } }
                    );
                    if (result.modifiedCount > 0) {
                        console.log(`  Updated ${result.modifiedCount} docs in ${rel.name}.${rel.field}`);
                    }
                }
            }

            // Special handling for brandAccess / sharedWith (arrays might have strings)
            // A simpler way for arrays without positional operator (if strict equality fails)
            await db.collection('users').updateMany(
                { brandAccess: oldId },
                { $set: { "brandAccess.$": newId } }
            );
            await db.collection('brands').updateMany(
                { sharedWith: oldId },
                { $set: { "sharedWith.$": newId } }
            );

        }

        console.log("Migration complete.");


    } catch (e) {
        console.error(e);
    } finally {
        await mongoose.disconnect();
    }
}

migrateStringIds();
