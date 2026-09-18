export const environment = {
  production: true,
  apiUrl2: '/api/v1',
  apiUrl: '/api', // Relative path. Served by Nginx in the production/Docker image: /api -> http://backend:8080 (nginx.conf).
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
