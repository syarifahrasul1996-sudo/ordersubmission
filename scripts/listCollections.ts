import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as fs from 'fs';

async function listCollections() {
    const config = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf-8'));
    const serviceAccount = JSON.parse(fs.readFileSync('scripts/service-account.json', 'utf-8'));
    
    initializeApp({
        credential: cert(serviceAccount),
        projectId: config.projectId
    });
    
    const db = getFirestore(config.firestoreDatabaseId);
    console.log(`Scanning database: ${config.firestoreDatabaseId}`);
    
    const collections = await db.listCollections();
    console.log(`Root collections found: ${collections.map(c => c.id).join(', ')}`);
    
    for (const col of collections) {
        const snapshot = await col.limit(3).get();
        console.log(`Collection: ${col.id}, Size limit(3): ${snapshot.size}`);
        snapshot.forEach(doc => {
            console.log(`  Document: ${doc.id}`);
            // If it's a short document, print its keys
            console.log(`    Keys: ${Object.keys(doc.data()).join(', ')}`);
        });
    }
}

listCollections().catch(console.error);
