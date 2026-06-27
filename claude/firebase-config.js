// TODO: Paste your Firebase project config here and uncomment the lines below.
// 1. Go to Firebase console → Project Settings → Your apps → SDK setup
// 2. Copy the firebaseConfig object
// 3. Replace the null exports below with the initialized db and auth

// import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
// import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
// import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

// const firebaseConfig = {
//   apiKey: "YOUR_API_KEY",
//   authDomain: "YOUR_PROJECT.firebaseapp.com",
//   projectId: "YOUR_PROJECT_ID",
//   storageBucket: "YOUR_PROJECT.appspot.com",
//   messagingSenderId: "YOUR_SENDER_ID",
//   appId: "YOUR_APP_ID"
// };

// const app = initializeApp(firebaseConfig);
// export const db = getFirestore(app);
// export const auth = getAuth(app);

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

const firebaseConfig = {
  apiKey: "AIzaSyCOu5MzRhG-CK_VNnlQj4UkZxQ_QW2lADM",
  authDomain: "puzzle-project-dd8e0.firebaseapp.com",
  projectId: "puzzle-project-dd8e0",
  storageBucket: "puzzle-project-dd8e0.firebasestorage.app",
  messagingSenderId: "898113113919",
  appId: "1:898113113919:web:9fb2007acfd78d187a8d8a",
  measurementId: "G-WS510TFSBE"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
