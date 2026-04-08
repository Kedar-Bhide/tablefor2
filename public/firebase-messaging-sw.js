importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyCSpoEd5sDeR1I_TIcsSJXTZwdNBZzUK5M",
  authDomain: "meals-a2f8e.firebaseapp.com",
  projectId: "meals-a2f8e",
  storageBucket: "meals-a2f8e.firebasestorage.app",
  messagingSenderId: "64615165505",
  appId: "1:64615165505:web:78504917c73f4b75ffa0c0"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const { title, body } = payload.notification;
  self.registration.showNotification(title, {
    body,
    icon: "/logo192.png",
  });
});