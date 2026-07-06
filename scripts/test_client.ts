import * as fs from 'fs';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, limit, query } from 'firebase/firestore/lite';

async function main() {
    const config = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf-8'));
    const app = initializeApp(config);
    const db = getFirestore(app, config.firestoreDatabaseId);

    const snapshot = await getDocs(query(collection(db, 'orders_migration_staging'), limit(5)));
    console.log(`Client SDK fetched ${snapshot.size} documents.`);
}

main().catch(console.error);
