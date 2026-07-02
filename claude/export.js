const { initializeFirebaseApp, backups } = require('firestore-export-import');
const fs = require('fs');

// 1. Authenticate using the key you downloaded
const serviceAccount = require('./credentials.json');
const firestore = initializeFirebaseApp(serviceAccount);

// 2. Extract the specific collections for the experiment
console.log('Connecting to Firestore...');
backups(firestore, ['users', 'gameLogs'])
  .then((data) => {
    // 3. Write the extracted data to a local file
    fs.writeFileSync('data_pipeline/firestore_export.json', JSON.stringify(data, null, 2));
    console.log('✅ Export successfully completed! Saved as firestore_export.json');
  })
  .catch((error) => {
    console.error('Export failed:', error);
  });