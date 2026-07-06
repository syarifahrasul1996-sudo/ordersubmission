import * as fs from 'fs';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc } from 'firebase/firestore/lite';

async function main() {
    const config = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf-8'));
    const app = initializeApp(config);
    const db = getFirestore(app, config.firestoreDatabaseId);

    const docRef = doc(db, 'orders_migration_staging', 'separate page');
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
        console.log('DOCUMENT_FOUND');
        console.log(JSON.stringify(docSnap.data(), null, 2));
    } else {
        console.log('DOCUMENT_NOT_FOUND');
    }
}

main().catch(console.error);
