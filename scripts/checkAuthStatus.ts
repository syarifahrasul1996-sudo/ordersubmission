import * as fs from 'fs';
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, collection, getDocs } from 'firebase/firestore/lite';

async function checkAuth() {
    const config = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf-8'));
    const app = initializeApp(config);
    const auth = getAuth(app);
    const db = getFirestore(app, config.firestoreDatabaseId);

    console.log("Auth currentUser:", auth.currentUser);
    
    try {
        const snap = await getDocs(collection(db, 'orders_canary'));
        console.log("Read succeeded. Size:", snap.size);
    } catch (e: any) {
        console.log("Read failed. Code:", e.code, "Message:", e.message);
    }
}

checkAuth().catch(console.error);
