export { 
    mapFirestoreDocToAppState,
    mapAppStateToFirestoreDoc,
    getOperationalOrders,
    getOverdueOrders,
    getArchivedOrders,
    saveOrderToFirestore,
    deleteOrderFromFirestore,
    seedCanaryData,
    isFirestoreCanary,
    orderDataSource
} from './orderService';
