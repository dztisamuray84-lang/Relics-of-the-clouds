// Roda depois de "cap add android"/"cap sync": tela cheia imersiva, tela sempre acesa,
// rotação livre. Pode rodar quantas vezes quiser.
const fs = require('fs'), path = require('path');
const A = path.join(__dirname, '..', 'android', 'app', 'src', 'main');
if (!fs.existsSync(A)) { console.log('Pasta android/ ainda não existe, nada a fazer.'); process.exit(0); }

const mf = path.join(A, 'AndroidManifest.xml');
let m = fs.readFileSync(mf, 'utf8');
if (!m.includes('screenOrientation')) m = m.replace('<activity', '<activity\n            android:screenOrientation="sensor"');
fs.writeFileSync(mf, m);

const jdir = path.join(A, 'java', 'com', 'relicoftheclouds', 'game');
fs.mkdirSync(jdir, { recursive: true });
fs.writeFileSync(path.join(jdir, 'MainActivity.java'), `package com.relicoftheclouds.game;

import android.os.Bundle;
import android.view.WindowManager;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        hideBars();
    }
    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideBars();
    }
    private void hideBars() {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        WindowInsetsControllerCompat c = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        if (c != null) {
            c.hide(WindowInsetsCompat.Type.systemBars());
            c.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        }
    }
}
`);
console.log('Android ajustado (tela cheia imersiva, tela sempre acesa, rotação livre).');
