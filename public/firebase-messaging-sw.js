importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyCP_lNulhO_ofoIRy3mqjCGSA0l-sKV5I0",
  authDomain: "trytablefor2.firebaseapp.com",
  projectId: "trytablefor2",
  storageBucket: "trytablefor2.firebasestorage.app",
  messagingSenderId: "1004615054636",
  appId: "1:1004615054636:web:83a1ddd1fbbe214c2ba889"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const { title, body } = payload.notification;
  self.registration.showNotification(title, {
    body,
    icon: "/logo192.png",
  });
});