import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getMessaging, getToken, isSupported, onMessage } from "firebase/messaging";

const firebaseConfig = {
  apiKey: "AIzaSyCP_lNulhO_ofoIRy3mqjCGSA0l-sKV5I0",
  authDomain: "trytablefor2.firebaseapp.com",
  projectId: "trytablefor2",
  storageBucket: "trytablefor2.firebasestorage.app",
  messagingSenderId: "1004615054636",
  appId: "1:1004615054636:web:83a1ddd1fbbe214c2ba889"
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
export const VAPID_KEY = "BDOOci-IG6aXEO37dUgyEMk6uV-R_V00SfNmNVSj84QSuAUBAAiOhMKouEyHBA87nornIr5ymx1HtUGpNK8sVs8";
export { getToken, onMessage };