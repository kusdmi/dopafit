export function isCaptchaScriptReady(): boolean {
  return Boolean((window as Window & { smartCaptcha?: unknown }).smartCaptcha);
}

/** The upstream loader retains its failed-script flag after unmount. */
export function retryCaptchaScript(onError: () => void): (() => void) | undefined {
  if (isCaptchaScriptReady()) return;
  const script = document.createElement('script');
  script.src =
    'https://smartcaptcha.cloud.yandex.ru/captcha.js?render=onload&onload=__onSmartCaptchaReady';
  script.crossOrigin = 'anonymous';
  const cleanup = () => {
    script.onload = null;
    script.onerror = null;
    script.remove();
  };
  script.onload = cleanup;
  script.onerror = () => {
    cleanup();
    onError();
  };
  document.body.appendChild(script);
  return cleanup;
}
