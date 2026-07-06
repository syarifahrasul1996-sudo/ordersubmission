
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as fs from 'fs';

async function run() {
    const config = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf-8'));
    initializeApp({
        projectId: config.projectId
    });
    
    // For custom database ID in Admin SDK:
    const db = getFirestore(config.firestoreDatabaseId);
    
    console.log('Fetching single doc from staging...');
    const col = db.collection('orders_migration_staging');
    const snap = await col.limit(1).get();
    
    if (snap.empty) {
        console.log('Collection is empty.');
    } else {
        console.log('Found doc:', snap.docs[0].id);
    }
}

run().catch(console.error);
