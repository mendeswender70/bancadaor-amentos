// Worker do pdf.js com o que falta no Safari antigo (iOS 16.4 a 17.3):
// Promise.withResolvers só existe a partir do Safari 17.4. Os imports rodam na
// ordem: primeiro o polyfill, depois o worker.
import './polyfills-pdf.js';
import './vendor/pdfjs/pdf.worker.min.mjs';
