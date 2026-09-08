// Sao chép bản build OpenCV.js (WASM nhúng sẵn) từ node_modules ra public/ để worker
// nạp bằng importScripts() như 1 file tĩnh — không đưa vào git vì đây là file vendor lớn,
// script này tự chạy lại mỗi khi `npm install` (xem "postinstall" trong package.json).
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'node_modules', '@techstark', 'opencv-js', 'dist', 'opencv.js');
const destDir = path.join(__dirname, '..', 'public', 'opencv');
const dest = path.join(destDir, 'opencv.js');

if (!fs.existsSync(src)) {
  console.warn('[copy-opencv] Không tìm thấy', src, '— bỏ qua (chạy `npm install` trước).');
  process.exit(0);
}

fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(src, dest);
console.log('[copy-opencv] Đã sao chép opencv.js ->', dest);
