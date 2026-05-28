import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function findReferences() {
    await mongoose.connect(process.env.MONGODB_URI);
    const db = mongoose.connection.db;

    const ids = [
        '69b7f3941f73faa65ca4538c',
        '69b801e9c6e96c1fc3bef343',
        '69b80fbb4aefc4844b122730',
        '69b810e44aefc4844b1227de',
        '69bba559f08c0de328c28198'
    ];

    const collections = await db.listCollections().toArray();
    
    for (const idStr of ids) {
        console.log(`\nSearching references for: ${idStr}`);
        const objectId = new mongoose.Types.ObjectId(idStr);
        let found = false;

        for (const col of collections) {
            const name = col.name;
            // Search by string and by ObjectId
            const matchObj = await db.collection(name).findOne({
                $or: [
                    { _id: objectId },
                    { projectId: objectId },
                    { project: objectId },
                    { videoProject: objectId },
                    { videoProjectId: objectId },
                    { user: objectId },
                    { userId: objectId },
                    { brand: objectId },
                    { brandId: objectId },
                    { finalVideoUrl: { $regex: idStr } },
                    { s3VideoUrl: { $regex: idStr } },
                    { videoUrl: { $regex: idStr } },
                    { url: { $regex: idStr } }
                ]
            });

            if (matchObj) {
                console.log(`  Found match in "${name}":`);
                console.log(`    Doc _id: ${matchObj._id}`);
                console.log(`    User/Brand/Project ref details: user=${matchObj.user || matchObj.userId}, brand=${matchObj.brand || matchObj.brandId}`);
                found = true;
            }
        }
        if (!found) {
            console.log('  No references found in database.');
        }
    }

    await mongoose.disconnect();
}

findReferences().catch(console.error);
