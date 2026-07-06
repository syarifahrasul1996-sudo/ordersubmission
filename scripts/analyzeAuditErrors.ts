import fs from 'fs';

async function analyze() {
    const errors = JSON.parse(fs.readFileSync('migration-reports/sheet-audit-errors.json', 'utf-8'));
    const summary = JSON.parse(fs.readFileSync('migration-reports/sheet-audit-summary.json', 'utf-8'));
    const samples = JSON.parse(fs.readFileSync('migration-reports/sheet-audit-samples.json', 'utf-8'));
    
    console.log('--- CLASSIFICATION TOTALS ---');
    const classifications = [
        'READY_WITH_EXISTING_ID',
        'MIGRATABLE_GENERATED_ID',
        'MIGRATABLE_PRICE_NULL',
        'MIGRATABLE_GENERATED_ID_AND_PRICE_NULL',
        'REQUIRES_MANUAL_REVIEW'
    ];
    classifications.forEach(c => {
        console.log(`${c}: ${summary[c] || 0}`);
    });

    console.log('\n--- MANUAL REVIEW REASONS ---');
    const reasons: Record<string, number> = {};
    errors.filter((e: any) => e.code === 'REQUIRES_MANUAL_REVIEW').forEach((e: any) => {
        reasons[e.message] = (reasons[e.message] || 0) + 1;
    });
    Object.entries(reasons).sort((a, b) => b[1] - a[1]).forEach(([reason, count]) => {
        console.log(`${count}: ${reason}`);
    });

    console.log('\n--- BLANK ID DATA QUALITY ---');
    // Check samples for MIGRATABLE_GENERATED_ID_AND_PRICE_NULL and MIGRATABLE_GENERATED_ID
    const blankIdClasses = ['MIGRATABLE_GENERATED_ID', 'MIGRATABLE_GENERATED_ID_AND_PRICE_NULL'];
    blankIdClasses.forEach(cls => {
        const clsSamples = samples[cls] || [];
        console.log(`\nClassification: ${cls}`);
        clsSamples.forEach((s: any, i: number) => {
            const hasData = s.originalRow.slice(1, 10).some((c: string) => c && c.trim() !== '');
            console.log(` Sample ${i+1}: row ${s.sourceRow} in ${s.worksheet} - Has data in B-J: ${hasData}`);
            if (hasData) console.log(`   Data snippet: ${s.data.customerName} | ${s.data.customerOrder}`);
        });
    });

    console.log('\n--- BLANK PRICE DATA QUALITY ---');
    const blankPriceClasses = ['MIGRATABLE_PRICE_NULL', 'MIGRATABLE_GENERATED_ID_AND_PRICE_NULL'];
    blankPriceClasses.forEach(cls => {
        const clsSamples = samples[cls] || [];
        console.log(`\nClassification: ${cls}`);
        clsSamples.forEach((s: any, i: number) => {
            const priceFound = s.originalRow.some((c: string, idx: number) => idx !== 11 && (String(c).includes('$') || String(c).includes('RM')));
            console.log(` Sample ${i+1}: row ${s.sourceRow} in ${s.worksheet} - Price found elsewhere: ${priceFound}`);
        });
    });
}

analyze().catch(console.error);
