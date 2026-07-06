import * as fs from 'fs';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore/lite';

async function listDocs() {
    const config = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf-8'));
    const app = initializeApp(config);
    const db = getFirestore(app, config.firestoreDatabaseId);

    const canary = await getDocs(collection(db, 'orders_canary'));
    console.log("orders_canary IDs:", canary.docs.map(d => d.id));

    const archive = await getDocs(collection(db, 'orders_archive_canary'));
    console.log("orders_archive_canary IDs:", archive.docs.map(d => d.id));
}

listDocs().catch(console.error);
