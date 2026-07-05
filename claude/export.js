const { initializeFirebaseApp, backups } = require('firestore-export-import');
const fs = require('fs');

// 1. Authenticate using the key (Keep it as is since it's inside 'claude')
const serviceAccount = require('./credentials.json');
const firestore = initializeFirebaseApp(serviceAccount);

console.log('Connecting to Firestore...');
backups(firestore, ['users', 'gameLogs'])
  .then((data) => {
    // 2. CHANGE THIS LINE: Add ../ to save it up and out into your data_pipeline folder
    fs.writeFileSync('../data_pipeline/firestore_export.json', JSON.stringify(data, null, 2));
    console.log('✅ Export successfully completed! Saved in data_pipeline folder.');
  })
  .catch((error) => {
    console.error('Export failed:', error);
  });