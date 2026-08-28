importScripts(
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"
);

importScripts(
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js"
);

firebase.initializeApp({
  apiKey: "AIzaSyCJbM803t7UFreQ2UL9K_fiN5b3GoQbhpU",
  authDomain: "chat-with-me-c641b.firebaseapp.com",
  projectId: "chat-with-me-c641b",
  storageBucket: "chat-with-me-c641b.firebasestorage.app",
  messagingSenderId: "61151214390",
  appId: "1:61151214390:web:c2a41c8ff3a210f31f9197"
});

const messaging = firebase.messaging();
