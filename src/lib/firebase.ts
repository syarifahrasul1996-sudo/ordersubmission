import { initializeApp } from 'firebase/app';
import { getAuth as getFirebaseAuth } from 'firebase/auth';
import { 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager,
  doc, 
  getDocFromServer 
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { initAnalytics } from '../utils/analytics';

let app: any;
let authInstance: any;
let dbInstance: any;

function initFirebase() {
  if (!app) {
    app = initializeApp(firebaseConfig);
    authInstance = getFirebaseAuth(app);
    
    // Safely trigger async analytics initialization
    initAnalytics(app);
    
    const settings: any = {
      experimentalForceLongPolling: true,
    };
    
    if (typeof window !== 'undefined') {
      settings.localCache = persistentLocalCache({
        tabManager: persistentMultipleTabManager()
      });
    }
    
    dbInstance = initializeFirestore(app, settings, firebaseConfig.firestoreDatabaseId);
  }
}

export const getAuth = () => {
  initFirebase();
  return authInstance;
};

export const getDb = () => {
  initFirebase();
  return dbInstance;
};

export async function testConnection() {
  const db = getDb();
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if(error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration.");
    }
  }
}
testConnection();
