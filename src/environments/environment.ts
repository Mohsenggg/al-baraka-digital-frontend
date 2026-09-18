
export const environment = {
      production: false,
      apiUrl2: '/api/v1',

      apiUrl: '/api', // Relative path (single source of truth). Dev: `ng serve` proxies /api -> http://localhost:8080 (proxy.conf.json). Prod: Nginx proxies /api -> http://backend:8080 (nginx.conf).
      firebase: {
            apiKey: 'AIzaSyBeEkn02NimObccgjEL3Xqo7ZB0CDS4DfA',
            authDomain: 'tree-f0d91.firebaseapp.com',
            projectId: 'tree-f0d91',
            storageBucket: 'tree-f0d91.firebasestorage.app',
            messagingSenderId: '601453892998',
            appId: '1:601453892998:web:2f78a1faa8ded8a8de0807',
            measurementId: 'G-3SRTTVH0KB'

      }
};



// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
// const firebaseConfig = {
//   apiKey: "AIzaSyBeEkn02NimObccgjEL3Xqo7ZB0CDS4DfA",
//   authDomain: "tree-f0d91.firebaseapp.com",
//   projectId: "tree-f0d91",
//   storageBucket: "tree-f0d91.firebasestorage.app",
//   messagingSenderId: "601453892998",
//   appId: "1:601453892998:web:2f78a1faa8ded8a8de0807",
//   measurementId: "G-3SRTTVH0KB"
// };
