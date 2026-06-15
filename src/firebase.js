import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore, enableMultiTabIndexedDbPersistence, doc, collection, addDoc, updateDoc, deleteDoc, query, where, getDoc, getDocs, onSnapshot, writeBatch, orderBy, serverTimestamp, setDoc, runTransaction, limit, deleteField } from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { getMessaging, getToken, isSupported } from "firebase/messaging";

const firebaseConfig = {
  apiKey: "AIzaSyCP_lNulhO_ofoIRy3mqjCGSA0l-sKV5I0",
  authDomain: "trytablefor2.firebaseapp.com",
  projectId: "trytablefor2",
  storageBucket: "trytablefor2.firebasestorage.app",
  messagingSenderId: "1004615054636",
  appId: "1:1004615054636:web:83a1ddd1fbbe214c2ba889",
};

const app = initializeApp(firebaseConfig);

const db = getFirestore(app);

export const auth = getAuth(app);
export const provider = new GoogleAuthProvider();
export { db };
export { doc, collection, addDoc, updateDoc, deleteDoc, query, where, getDoc, getDocs, onSnapshot, writeBatch, orderBy, serverTimestamp, setDoc, runTransaction, limit, deleteField };
export { ref, uploadBytes, getDownloadURL, deleteObject };

enableMultiTabIndexedDbPersistence(db).catch((err) => {
  if (err.code === "failed-precondition") {
    console.warn("Offline persistence unavailable (multiple tabs open)");
  } else if (err.code === "unimplemented") {
    console.warn("Offline persistence not supported in this browser");
  }
});

export const storage = getStorage(app);
export let messaging = null;
if (typeof window !== "undefined") {
  isSupported()
    .then((supported) => {
      if (supported) {
        messaging = getMessaging(app);
      }
    })
    .catch(() => {
      messaging = null;
    });
}
export const VAPID_KEY = "BDOOci-IG6aXEO37dUgyEMk6uV-R_V00SfNmNVSj84QSuAUBAAiOhMKouEyHBA87nornIr5ymx1HtUGpNK8sVs8";
export { getToken };

export function fixStorageUrl(url) {
  if (!url) return url;
  if (Array.isArray(url)) {
    return url.map(fixStorageUrl);
  }
  if (typeof url !== "string") return url;
  if (url.includes("meals-a2f8e")) {
    return url.replace(/meals-a2f8e(\.appspot\.com|\.firebasestorage\.app)?/g, "trytablefor2.firebasestorage.app");
  }
  return url;
}

export function fixMealUrls(meal) {
  if (!meal) return meal;
  return {
    ...meal,
    photoURL: fixStorageUrl(meal.photoURL),
    photos: fixStorageUrl(meal.photos),
    _galleryPhoto: fixStorageUrl(meal._galleryPhoto)
  };
}

export function fixUserUrls(user) {
  if (!user) return user;
  return {
    ...user,
    photoURL: fixStorageUrl(user.photoURL)
  };
}

export function fixTaskUrls(task) {
  if (!task) return task;
  return {
    ...task,
    photos: fixStorageUrl(task.photos)
  };
}