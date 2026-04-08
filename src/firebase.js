import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getMessaging, getToken, isSupported, onMessage } from "firebase/messaging";

const firebaseConfig = {
  apiKey: "AIzaSyCSpoEd5sDeR1I_TIcsSJXTZwdNBZzUK5M",
  authDomain: "meals-a2f8e.firebaseapp.com",
  projectId: "meals-a2f8e",
  storageBucket: "meals-a2f8e.firebasestorage.app",
  messagingSenderId: "64615165505",
  appId: "1:64615165505:web:78504917c73f4b75ffa0c0"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const provider = new GoogleAuthProvider();
export const db = getFirestore(app);
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
export const VAPID_KEY = "BHU0AtlA4YLdmo2ua6XF7jXzgGMZuey6myQvmQLq2wgGFzqbScib9q058cB65bfecS9Mb4gwo2wbzhiKLF99m0Q";
export { getToken, onMessage };