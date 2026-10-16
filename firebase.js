// Firebase & Firestore Configuration
import { initializeApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";
import { 
  getFirestore, 
  collection, 
  getDocs, 
  addDoc, 
  updateDoc, 
  doc, 
  query, 
  orderBy, 
  serverTimestamp,
  arrayUnion
} from "firebase/firestore";

// Safely retrieve configuration from environment variables (Vite / CRA / standard)
const firebaseConfig = {
  apiKey: typeof import.meta !== 'undefined' && import.meta.env?.VITE_FIREBASE_API_KEY
    ? import.meta.env.VITE_FIREBASE_API_KEY
    : (typeof process !== 'undefined' && process.env?.REACT_APP_FIREBASE_API_KEY)
    ? process.env.REACT_APP_FIREBASE_API_KEY
    : "AIzaSyBW6vdHPwqStPPg67YkZPx-8jZkZ7O_Oqg",

  authDomain: typeof import.meta !== 'undefined' && import.meta.env?.VITE_FIREBASE_AUTH_DOMAIN
    ? import.meta.env.VITE_FIREBASE_AUTH_DOMAIN
    : (typeof process !== 'undefined' && process.env?.REACT_APP_FIREBASE_AUTH_DOMAIN)
    ? process.env.REACT_APP_FIREBASE_AUTH_DOMAIN
    : "pure-energy-lead-router.firebaseapp.com",

  projectId: typeof import.meta !== 'undefined' && import.meta.env?.VITE_FIREBASE_PROJECT_ID
    ? import.meta.env.VITE_FIREBASE_PROJECT_ID
    : (typeof process !== 'undefined' && process.env?.REACT_APP_FIREBASE_PROJECT_ID)
    ? process.env.REACT_APP_FIREBASE_PROJECT_ID
    : "pure-energy-lead-router",

  storageBucket: typeof import.meta !== 'undefined' && import.meta.env?.VITE_FIREBASE_STORAGE_BUCKET
    ? import.meta.env.VITE_FIREBASE_STORAGE_BUCKET
    : (typeof process !== 'undefined' && process.env?.REACT_APP_FIREBASE_STORAGE_BUCKET)
    ? process.env.REACT_APP_FIREBASE_STORAGE_BUCKET
    : "pure-energy-lead-router.firebasestorage.app",

  messagingSenderId: typeof import.meta !== 'undefined' && import.meta.env?.VITE_FIREBASE_MESSAGING_SENDER_ID
    ? import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID
    : (typeof process !== 'undefined' && process.env?.REACT_APP_FIREBASE_MESSAGING_SENDER_ID)
    ? process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID
    : "238982236693",

  appId: typeof import.meta !== 'undefined' && import.meta.env?.VITE_FIREBASE_APP_ID
    ? import.meta.env.VITE_FIREBASE_APP_ID
    : (typeof process !== 'undefined' && process.env?.REACT_APP_FIREBASE_APP_ID)
    ? process.env.REACT_APP_FIREBASE_APP_ID
    : "1:238982236693:web:16e4d294d79219c0729c1c",

  measurementId: typeof import.meta !== 'undefined' && import.meta.env?.VITE_FIREBASE_MEASUREMENT_ID
    ? import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
    : (typeof process !== 'undefined' && process.env?.REACT_APP_FIREBASE_MEASUREMENT_ID)
    ? process.env.REACT_APP_FIREBASE_MEASUREMENT_ID
    : "G-SPMHVZY722"
};

// Initialize Firebase App
const app = initializeApp(firebaseConfig);

// Initialize Cloud Firestore
export const db = getFirestore(app);

// Initialize Analytics if supported in the current environment
let analytics = null;
if (typeof window !== 'undefined') {
  isSupported().then(supported => {
    if (supported) {
      analytics = getAnalytics(app);
    }
  });
}

export { analytics };
export default app;

// ========================================================
// Firestore Helper Functions for Leads & Dealers
// ========================================================

/**
 * Fetch all leads from Firestore
 */
export async function getLeadsFromFirestore() {
  try {
    const leadsRef = collection(db, "leads");
    const q = query(leadsRef, orderBy("created_on", "desc"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error("Error fetching leads from Firestore:", error);
    throw error;
  }
}

/**
 * Add a new lead to Firestore
 */
export async function addLeadToFirestore(leadData) {
  try {
    const leadsRef = collection(db, "leads");
    const docRef = await addDoc(leadsRef, {
      ...leadData,
      createdAt: serverTimestamp()
    });
    return { id: docRef.id, ...leadData };
  } catch (error) {
    console.error("Error adding lead to Firestore:", error);
    throw error;
  }
}

/**
 * Update lead status and append note history in Firestore
 */
export async function updateLeadStatusInFirestore(docId, newStatus, noteText) {
  try {
    const leadDocRef = doc(db, "leads", docId);
    const updatePayload = {
      status: newStatus,
      updatedAt: serverTimestamp()
    };

    if (noteText) {
      updatePayload.notes = arrayUnion({
        timestamp: new Date().toISOString(),
        status: newStatus,
        note: noteText
      });
    }

    await updateDoc(leadDocRef, updatePayload);
    return true;
  } catch (error) {
    console.error("Error updating lead status in Firestore:", error);
    throw error;
  }
}

/**
 * Fetch all dealers from Firestore
 */
export async function getDealersFromFirestore() {
  try {
    const dealersRef = collection(db, "dealers");
    const snapshot = await getDocs(dealersRef);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error("Error fetching dealers from Firestore:", error);
    throw error;
  }
}
