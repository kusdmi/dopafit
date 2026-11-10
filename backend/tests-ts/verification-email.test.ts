import { describe, expect, it } from "vitest";
import type { Purpose } from "../src/modules/auth/index.js";
import { renderVerificationEmail } from "../src/platform/email/verification.js";

const cases = [
  ["register", "Подтвердите почту", "продолжить регистрацию"],
  ["login", "Ваш код для входа", "войти в аккаунт"],
  ["password_reset", "Восстановление пароля", "создать новый пароль"],
  ["verify_email", "Подтвердите почту", "подтвердить этот адрес"],
  ["change_email", "Подтвердите новую почту", "изменить адрес"],
  ["change_login_method", "Смена способа входа", "изменить способ входа"],
  ["account_delete", "Подтверждение удаления аккаунта", "подтвердить удаление аккаунта"],
] as const;

describe("verification email", () => {
  it.each(cases)("explains %s consistently in HTML and plain text", (purpose, title, action) => {
    const email = renderVerificationEmail(purpose, "123456", 601);
    expect(email.subject).toContain("DopaFit");
    expect(email.subject).not.toContain("123456");
    for (const body of [email.html, email.text]) {
      expect(body).toContain(title);
      expect(body).toContain(action);
      expect(body).toContain("123456");
      expect(body).toContain("11 мин.");
      expect(body).toContain("Никому не сообщайте код");
      expect(body).toContain("Если вы не запрашивали");
    }
    expect(email.html).toContain('lang="ru"');
    expect(email.html).toContain("prefers-color-scheme: dark");
    expect(email.html).not.toMatch(/<script|<link|@import|url\(/i);
    expect(email.html.match(/<img /g)).toHaveLength(2);
    expect(email.html).toContain('src="cid:logo-light@dopafit.ru"');
    expect(email.html).toContain('src="cid:logo-dark@dopafit.ru"');
    const preheader = email.html.match(/<div class="email-preheader"[^>]*>(.*?)<\/div>/s)?.[1];
    expect(preheader).toBeTruthy();
    expect(preheader).not.toContain("123456");
  });

  it("escapes dynamic content without splitting the code into separate digits", () => {
    const email = renderVerificationEmail("login", '<a href="x">&\'</a>', 60);
    expect(email.html).toContain("&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;");
    expect(email.html).not.toContain('<a href="x">');
    expect(renderVerificationEmail("login", "012345", 60).html).toContain(">012345</span>");
    expect(renderVerificationEmail("login", "012345", 60).text).toContain("012345");
  });

  it.each(["verify_phone", "change_phone", "toString", "__proto__", "unknown"])(
    "rejects unsupported purposes before delivery: %s",
    (purpose) => {
      expect(() => renderVerificationEmail(purpose as Purpose, "123456", 600)).toThrow();
    },
  );
});
