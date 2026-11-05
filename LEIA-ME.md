# Relic of the Clouds → APK

O jogo já estava quase pronto: ele detecta o app Android sozinho e usa o servidor online. Este projeto só embrulha tudo com o **Capacitor**.

## 1. Antes de tudo: o endereço do servidor
No `index.html`, procure por `MP_HOST_DEFAULT=''` e coloque o endereço público do seu servidor (ex.: `'https://meujogo.onrender.com'`). Preenchido, o campo de endereço some e todo mundo do APK usa esse servidor.
Se deixar vazio, o app tenta `https://relic-of-the-clouds.onrender.com` e o jogador pode digitar outro endereço.
Use sempre `https://` (o WebSocket vira `wss://` sozinho).

## 2. Gerar o APK (precisa de Node 18+, JDK 17 e Android Studio/SDK)
```bash
npm install
npm run android:add     # cria a pasta android/ (só na primeira vez)
npm run icons           # gera ícones e splash a partir de resources/
npm run apk             # gera android/app/build/outputs/apk/debug/app-debug.apk
```
Para abrir no Android Studio: `npm run open`.
Depois de qualquer mudança no `index.html`: `npm run sync`.

## 3. APK assinado (Play Store / instalar em qualquer celular)
No Android Studio: **Build → Generate Signed App Bundle / APK**. Guarde o arquivo `.jks` e a senha: sem eles você não consegue atualizar o app depois.

## Sem instalar nada no PC
Suba a pasta (sem `node_modules`) para um repositório no GitHub e use um build online (Codemagic, Appflow) ou o PWABuilder com o jogo hospedado.

## O que o projeto faz
- `npm run www` copia o `index.html` para `www/` sem o servidor embutido (−22 KB) e trava o zoom por pinça.
- `scripts/patch-android.js` deixa o app em tela cheia imersiva, com a tela sempre acesa e rotação livre.
- `capacitor.config.json`: id `com.relicoftheclouds.game` (troque se quiser), fundo `#0b1220`.
- `server.js` **não vai no APK**: hospede-o separado (Render, Railway, Fly…) com `TRUST_PROXY=1`.
- `resources/icon.png` e `splash.png` são provisórios: troque pelos seus (1024×1024 e 2732×2732).

## Observações
- A fonte pixel (VT323) vem do Google Fonts: precisa de internet na primeira abertura. Para funcionar 100% offline, baixe `VT323-Regular.woff2` e declare um `@font-face` no `index.html`.
- O save local usa `localStorage`, que o Capacitor mantém entre aberturas do app.
