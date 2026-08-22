// Config de Firebase del proyecto nail-projects
const firebaseConfig = {
  apiKey: "AIzaSyBxtl_lc9b6zS-6ld-LMGcBAyk6XjQ7vck",
  authDomain: "nail-projects.firebaseapp.com",
  databaseURL: "https://nail-projects-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "nail-projects",
  storageBucket: "nail-projects.firebasestorage.app",
  messagingSenderId: "923664169473",
  appId: "1:923664169473:web:16f3c712ddd4d3400d9e00"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database().ref("moneyManagerV2");
