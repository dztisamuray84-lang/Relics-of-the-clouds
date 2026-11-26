// Gera a pasta www/ (o que vai dentro do APK) a partir do index.html.
// - remove o bloco <script type="text/x-server"> (servidor Node, inútil no celular)
// - acrescenta meta tags de app e trava o zoom por pinça
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const www = path.join(root, 'www');
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const before = html.length;
html = html.replace(/<script type="text\/x-server">[\s\S]*?<\/script>\s*/g, '');

const extra = '<meta name="theme-color" content="#0b1220">\n' +
  '<meta name="mobile-web-app-capable" content="yes">\n' +
  '<meta name="format-detection" content="telephone=no">\n';
if (!html.includes('name="theme-color"')) html = html.replace('</title>', '</title>\n' + extra);

html = html.replace('width=device-width, initial-scale=1, viewport-fit=cover',
  'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover');

fs.rmSync(www, { recursive: true, force: true });
fs.mkdirSync(www, { recursive: true });
fs.writeFileSync(path.join(www, 'index.html'), html);
console.log('www/index.html pronto (' + Math.round(html.length / 1024) + ' KB, removidos ' + Math.round((before - html.length) / 1024) + ' KB do servidor embutido)');
