import { GoogleAuth } from 'google-auth-library';

async function check() {
  const auth = new GoogleAuth();
  
  try {
    const projectId = await auth.getProjectId();
    const credentials = await auth.getApplicationDefault();
    
    console.log('--- Credential Diagnostic ---');
    console.log(`GOOGLE_APPLICATION_CREDENTIALS: ${process.env.GOOGLE_APPLICATION_CREDENTIALS || 'NOT SET'}`);
    console.log(`Project ID: ${projectId}`);
    
    // Attempt to identify client email if it's a service account
    if (credentials.credential && typeof credentials.credential === 'object' && 'client_email' in credentials.credential) {
        console.log(`Client Email: ${(credentials.credential as any).client_email}`);
    } else {
        console.log(`Client Email: NOT APPLICABLE (Using ADC or other credential source)`);
    }
    
    // Project number is often not directly available via basic ADC without extra API calls
    console.log('---');
  } catch (error) {
    console.error('Error checking credentials:', error);
  }
}

check().catch(console.error);
