
import * as fs from 'fs';
import fetch from 'node-fetch';

async function runAudit() {
    const config = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf-8'));
    const projectId = config.projectId;
    const dbId = config.firestoreDatabaseId;
    const apiKey = config.apiKey;
    const baseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${dbId}/documents/orders_migration_staging?key=${apiKey}&pageSize=100`;

    console.log('Fetching staging data via REST...');
    
    const response = await fetch(baseUrl);
    const data: any = await response.json();
    
    if (data.error) {
        console.error('Error:', data.error);
        return;
    }

    const documents = data.documents || [];
    console.log(`Found ${documents.length} documents.`);
    
    const mapped = documents.map((doc: any) => {
        const fields = doc.fields || {};
        const obj: any = { id: doc.name.split('/').pop() };
        for (const key in fields) {
            const val = fields[key];
            if (val.stringValue !== undefined) obj[key] = val.stringValue;
            else if (val.booleanValue !== undefined) obj[key] = val.booleanValue;
            else if (val.integerValue !== undefined) obj[key] = parseInt(val.integerValue);
            else if (val.doubleValue !== undefined) obj[key] = val.doubleValue;
            else if (val.timestampValue !== undefined) obj[key] = val.timestampValue;
            else if (val.nullValue !== undefined) obj[key] = null;
        }
        return obj;
    });

    fs.writeFileSync('audit_rest_sample.json', JSON.stringify(mapped, null, 2));
}

runAudit().catch(console.error);
