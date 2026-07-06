
import * as fs from 'fs';
import fetch from 'node-fetch';

async function getCounts() {
    const config = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf-8'));
    const projectId = config.projectId;
    const dbId = config.firestoreDatabaseId;
    const apiKey = config.apiKey;
    
    let totalExamined = 0;
    let undeliveredCount = 0;
    let deliveredCount = 0;
    let nextPageToken = '';
    
    console.log('Calculating counts from orders_migration_staging...');

    do {
        const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${dbId}/documents/orders_migration_staging?key=${apiKey}&pageSize=1000${nextPageToken ? '&pageToken=' + nextPageToken : ''}`;
        const res = await fetch(url);
        const data: any = await res.json();
        
        if (data.error) {
            console.error('Error:', data.error);
            break;
        }

        const docs = data.documents || [];
        totalExamined += docs.length;

        for (const doc of docs) {
            const fields = doc.fields || {};
            const isDelivered = fields.isDelivered?.booleanValue || false;
            if (isDelivered) deliveredCount++;
            else undeliveredCount++;
        }

        nextPageToken = data.nextPageToken;
        console.log(`Progress: ${totalExamined} documents processed...`);
    } while (nextPageToken);

    console.log('=== FINAL COUNTS ===');
    console.log('Total Examined:', totalExamined);
    console.log('Undelivered (for orders):', undeliveredCount);
    console.log('Delivered (for orders_archive):', deliveredCount);
    
    fs.writeFileSync('production_counts.json', JSON.stringify({
        totalExamined,
        undeliveredCount,
        deliveredCount
    }, null, 2));
}

getCounts().catch(console.error);
