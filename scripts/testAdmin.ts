import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as fs from 'fs';

async function testAdmin() {
    const config = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf-8'));
    console.log(`Initializing Admin SDK with projectId: ${config.projectId}`);
    
    initializeApp({
        projectId: config.projectId
    });
    
    const db = getFirestore(config.firestoreDatabaseId);
    console.log(`Trying to fetch from collection: orders_migration_staging in database: ${config.firestoreDatabaseId}`);
    
    const snapshot = await db.collection('orders_migration_staging').limit(5).get();
    console.log(`Fetched ${snapshot.size} documents.`);
    snapshot.forEach(doc => {
        console.log(doc.id, doc.data());
    });
}

testAdmin().catch(console.error);
