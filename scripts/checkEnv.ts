console.log("Checking Environment Variables:");
for (const key of Object.keys(process.env)) {
    if (key.includes("FIREBASE") || key.includes("GOOGLE") || key.includes("GCP") || key.includes("CREDENTIALS") || key.includes("SECRET") || key.includes("SERVICE_ACCOUNT")) {
        console.log(`${key}=${process.env[key] ? (process.env[key]!.length > 50 ? process.env[key]!.slice(0, 50) + "..." : process.env[key]) : ""}`);
    }
}
