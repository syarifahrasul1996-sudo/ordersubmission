import { getDb } from '../lib/firebase';
import { 
    collection, 
    doc, 
    writeBatch, 
    getDocs, 
    deleteDoc, 
    query, 
    where, 
    orderBy,
    setDoc
} from 'firebase/firestore';
import { AppState } from '../types';
import { mapAppStateToFirestoreDoc, mapFirestoreDocToAppState } from './firestoreOrders';
import { handleFirestoreError, OperationType } from './firestoreUtils';

const db = getDb();

/**
 * Saves a draft order to Firestore.
 * Ensures the document is created/updated in 'orders_canary' with status: 'draft'.
 */
export async function saveDraftToFirestore(state: AppState): Promise<void> {
    const draftId = state.historyId || state.orderId;
    if (!draftId) {
        throw new Error("Draft ID is required to save a draft.");
    }

    const docRef = doc(db, 'orders_canary', draftId);
    const docData = {
        ...mapAppStateToFirestoreDoc(state),
        status: 'draft' as const,
        documentId: draftId,
    };

    try {
        await setDoc(docRef, docData);
        console.log(`Draft ${draftId} successfully saved to Firestore.`);
    } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, 'orders_canary');
    }
}

/**
 * Deletes a draft order from Firestore.
 */
export async function deleteDraftFromFirestore(draftId: string): Promise<void> {
    if (!draftId) return;
    const docRef = doc(db, 'orders_canary', draftId);
    try {
        await deleteDoc(docRef);
        console.log(`Draft ${draftId} successfully deleted from Firestore.`);
    } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, 'orders_canary');
    }
}

/**
 * Promotes a draft order to a final order atomically in Firestore.
 * Ensures that either the final order is created and the draft is deleted,
 * or neither occurs (atomic transaction), so they never exist simultaneously.
 */
export async function promoteDraftToFinalInFirestore(draftId: string, finalState: AppState): Promise<void> {
    const finalOrderId = finalState.orderId || finalState.historyId;
    if (!finalOrderId) {
        throw new Error("Final Order ID is required to promote draft.");
    }

    const isDelivered = finalState.isDelivered || false;
    const targetCollection = isDelivered ? 'orders_archive_canary' : 'orders_canary';
    const altCollection = isDelivered ? 'orders_canary' : 'orders_archive_canary';

    const finalDocRef = doc(db, targetCollection, finalOrderId);
    // Delete target from alt collection in case it was moved (e.g. delivered vs undelivered)
    const finalAltDocRef = doc(db, altCollection, finalOrderId);

    const draftDocRef = doc(db, 'orders_canary', draftId);

    // Prepare final document data
    const finalDocData = {
        ...mapAppStateToFirestoreDoc(finalState),
        status: 'final' as const,
        documentId: finalOrderId,
    };

    const batch = writeBatch(db);

    // Write final entry
    batch.set(finalDocRef, finalDocData);

    // Clean up alt final document
    batch.delete(finalAltDocRef);

    // If there is an active draft and it's different from the final order ID, delete it atomically.
    if (draftId && draftId !== finalOrderId) {
        batch.delete(draftDocRef);
    }

    try {
        await batch.commit();
        console.log(`Draft ${draftId} promoted to Final Order ${finalOrderId} successfully via batch write.`);
    } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, 'orders_canary batch promotion');
    }
}

/**
 * Retrieves all drafts from Firestore 'orders_canary'.
 */
export async function getDraftsFromFirestore(): Promise<AppState[]> {
    const q = query(
        collection(db, 'orders_canary'),
        where('status', '==', 'draft'),
        orderBy('migratedAt', 'desc')
    );

    try {
        const snap = await getDocs(q);
        return snap.docs.map(doc => {
            const state = mapFirestoreDocToAppState(doc.id, doc.data());
            state.status = 'draft';
            return state;
        });
    } catch (error) {
        console.warn("Failed to fetch drafts from Firestore directly. Checking document prefixes as fallback.", error);
        try {
            // Fallback: try fetching all documents and filtering locally if index/rule requires
            const allSnap = await getDocs(collection(db, 'orders_canary'));
            return allSnap.docs
                .filter(doc => doc.id.startsWith('draft_') || doc.data().status === 'draft')
                .map(doc => {
                    const state = mapFirestoreDocToAppState(doc.id, doc.data());
                    state.status = 'draft';
                    return state;
                });
        } catch (fallbackError) {
            handleFirestoreError(fallbackError, OperationType.LIST, 'orders_canary drafts fallback');
            return [];
        }
    }
}
