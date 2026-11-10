import type { CaptchaConfigValues } from "../config.js";

const VALIDATE_URL = "https://smartcaptcha.cloud.yandex.ru/validate";

export class YandexSmartCaptcha {
  constructor(
    private readonly config: CaptchaConfigValues,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async verify(token: string | null, ip: string | null): Promise<boolean> {
    if (!token?.trim() || token.length > 16384) return false;
    const body = new URLSearchParams({ secret: this.config.secretKey, token });
    if (ip) body.set("ip", ip);
    try {
      const response = await this.fetcher(VALIDATE_URL, {
        method: "POST",
        body,
        signal: AbortSignal.timeout(5000),
        redirect: "error",
      });
      if (!response.ok) return false;
      const result: unknown = await response.json();
      return (
        typeof result === "object" &&
        result !== null &&
        "status" in result &&
        result.status === "ok" &&
        "host" in result &&
        typeof result.host === "string" &&
        this.config.allowedHosts.includes(result.host.toLowerCase())
      );
    } catch {
      return false;
    }
  }
}
