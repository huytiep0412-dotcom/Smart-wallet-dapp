// Chep web3.min.js tu node_modules vao web/lib de trang chay khong can CDN
const fs = require("fs");
const path = require("path");
const src = path.join(__dirname, "..", "node_modules", "web3", "dist", "web3.min.js");
const dst = path.join(__dirname, "..", "web", "lib", "web3.min.js");
if (fs.existsSync(src)) {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  console.log("Da chep web3.min.js");
}
