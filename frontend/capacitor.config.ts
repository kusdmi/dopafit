import type { CapacitorConfig } from '@capacitor/cli';
import { KeyboardResize } from '@capacitor/keyboard';

const config: CapacitorConfig = {
  appId: 'com.dopafit.app',
  appName: 'DopaFit',
  webDir: 'dist',
  // Release (CAP_ENV=release at `cap sync` time): androidScheme 'https' and NO cleartext —
  // the API is https-only, so Mixed Content never applies.
  // Dev (default): scheme http is required so the WebView loads over http://localhost.
  // With androidScheme:'https' Chromium blocks requests to the http backend
  // (http://10.0.2.2:8000 in the emulator, http://<LAN-IP>:8000 on a device) via the
  // Mixed Content policy — before any socket opens, regardless of cleartext and
  // network_security_config. cleartext allows the raw http socket on Android.
  server:
    process.env.CAP_ENV === 'release'
      ? { androidScheme: 'https' }
      : { androidScheme: 'http', cleartext: true },
  plugins: {
    SplashScreen: {
      // Сплэш скрывается из кода: App.tsx зовёт hideSplash() при монтировании
      // (нативный splash уступает место брендовому DOM-оверлею SplashOverlay,
      // пока идёт гидрация).
      launchAutoHide: false,
      // Статический цвет — намеренно тёмная поверхность (#161412, neutral-900).
      // Он один на обе темы, поэтому идеала нет: dark-юзер получает бесшовный
      // splash, light-юзер — короткий тёмный кадр перед светлым UI (это мягче,
      // чем яркая вспышка в dark).
      // Тему launch-фона решают НАТИВНЫЕ launch-ресурсы, генерируемые через
      // @capacitor/assets на хосте (см. resources/README.md). НЕ пытаться задать
      // цвет в рантайме: у SplashScreen.show нет runtime backgroundColor.
      backgroundColor: '#161412',
      showSpinner: false,
    },
    Keyboard: {
      // Resize the WebView; normal DOM scrolling keeps form controls visible.
      resize: KeyboardResize.Native,
      // Подстраховка от чёрной зоны за клавиатурой: тонируем backdrop под фон
      // приложения (config backgroundColor → иначе DOM body). См. keyboard.ts.
      autoBackdropColor: 'auto',
    },
  },
};

export default config;
