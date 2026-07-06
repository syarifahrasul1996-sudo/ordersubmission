import * as fs from 'fs';
import * as crypto from 'crypto';

function runAudit() {
    const manifestPath = 'migration-reports/staging-authoritative-manifest.json';
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

    const existingIds = manifest.filter((m: any) => m.originalOrderId && m.originalOrderId === m.documentId);
    
    // Group to find duplicates
    const idCounts: Record<string, number> = {};
    for (const m of existingIds) {
        idCounts[m.documentId] = (idCounts[m.documentId] || 0) + 1;
    }

    const auditResults: any[] = [];
    let safeCount = 0;
    let unsafeCount = 0;
    let blankReplacedCount = 0;

    // Calculate blank IDs separately
    for (const m of manifest) {
        if (!m.originalOrderId || m.originalOrderId.trim() === '') {
            blankReplacedCount++;
        }
    }

    for (const m of existingIds) {
        const id = m.documentId;
        const reasons: string[] = [];

        if (!/^[A-Za-z0-9_\-]+$/.test(id)) {
            reasons.push("Contains invalid characters (only A-Z, a-z, 0-9, _, - allowed)");
        }
        if (id.length > 128) {
            reasons.push("Exceeds maximum length of 128");
        }
        if (id === '.' || id === '..') {
            reasons.push("Cannot be . or ..");
        }
        // Generic notes are caught by invalid characters (spaces) but let's be explicit if we want
        // Filenames and URLs are caught by invalid characters (dots, slashes) but let's check
        if (idCounts[id] > 1) {
            reasons.push("Duplicated original ID");
        }
        if (id.startsWith('sheet-')) {
            reasons.push("Conflicts with generated sheet- ID format");
        }

        let classification = "SAFE_EXISTING_ID_PRESERVED";
        let proposedId = id;

        if (reasons.length > 0) {
            classification = "UNSAFE_EXISTING_ID_REPLACED";
            // sheet-<hash of sourceSpreadsheetId|sourceWorksheet|sourceRow>
            const str = `${m.sourceSpreadsheetId}|${m.sourceWorksheet}|${m.sourceRow}`;
            const hash = crypto.createHash('md5').update(str).digest('hex');
            proposedId = `sheet-${hash}`;
        }

        if (classification === "SAFE_EXISTING_ID_PRESERVED") {
            safeCount++;
        } else {
            unsafeCount++;
        }

        auditResults.push({
            stagingDocumentId: m.documentId,
            originalOrderId: m.originalOrderId,
            sourceKey: m.sourceKey,
            classification,
            reasons,
            proposedProductionDocumentId: proposedId
        });
    }

    fs.writeFileSync('migration-reports/production-existing-id-audit.json', JSON.stringify(auditResults, null, 2));

    const totalGenerated = unsafeCount + blankReplacedCount;
    const totalDocs = safeCount + unsafeCount + blankReplacedCount;

    console.log("SAFE_EXISTING_ID_PRESERVED:", safeCount);
    console.log("UNSAFE_EXISTING_ID_REPLACED:", unsafeCount);
    console.log("BLANK_ID_REPLACED:", blankReplacedCount);
    console.log("TOTAL_GENERATED_PRODUCTION_IDS:", totalGenerated);
    console.log("TOTAL_PRODUCTION_DOCUMENTS:", totalDocs);

    // Explicitly report the corrected production ID for `separate page`
    const sepPage = auditResults.find(r => r.stagingDocumentId === 'separate page');
    if (sepPage) {
        console.log(`\nCorrected ID for 'separate page': ${sepPage.proposedProductionDocumentId}`);
    } else {
        console.log(`\n'separate page' not found in existing IDs?!`);
    }

    // Verify zero collisions
    const finalIds = new Set<string>();
    let collisions = 0;
    // Add all safe IDs
    for (const r of auditResults) {
        if (finalIds.has(r.proposedProductionDocumentId)) collisions++;
        finalIds.add(r.proposedProductionDocumentId);
    }
    // Also include blank replaced in the universe of generated IDs
    for (const m of manifest) {
        if (!m.originalOrderId || m.originalOrderId.trim() === '') {
            const str = `${m.sourceSpreadsheetId}|${m.sourceWorksheet}|${m.sourceRow}`;
            const hash = crypto.createHash('md5').update(str).digest('hex');
            const newId = `sheet-${hash}`;
            if (finalIds.has(newId)) collisions++;
            finalIds.add(newId);
        }
    }
    console.log(`Collisions after replacement: ${collisions}`);
}

runAudit();
