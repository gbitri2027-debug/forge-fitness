/* Firebase WEB config is public information, not a secret. Do not put passwords or admin SDK keys here.
 * Leave null until you have configured a FREE Spark project. */
// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyALzyPPGfMK5HN9taZpf3Q9bgdjd75EeO4",
  authDomain: "forge-fitness-private.firebaseapp.com",
  projectId: "forge-fitness-private",
  storageBucket: "forge-fitness-private.firebasestorage.app",
  messagingSenderId: "311284979096",
  appId: "1:311284979096:web:06758d983270dd826d07ed"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
