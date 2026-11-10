import type { Purpose } from "../../modules/auth/index.js";
import { AppError } from "../../domain/error.js";
import { EMAIL_BRAND_IMAGES } from "./brand.js";

type EmailPurpose = Exclude<Purpose, "verify_phone" | "change_phone">;

export const VERIFICATION_EMAIL_COPY = {
  register: {
    label: "Регистрация",
    subject: "Подтвердите почту — DopaFit",
    title: "Подтвердите почту",
    intro:
      "Вы создаёте аккаунт DopaFit. Введите этот код в приложении, чтобы продолжить регистрацию.",
    preheader: "Остался один шаг к вашему аккаунту. Подтвердите адрес электронной почты.",
  },
  login: {
    label: "Вход в аккаунт",
    subject: "Код для входа — DopaFit",
    title: "Ваш код для входа",
    intro:
      "Введите этот код в приложении DopaFit, чтобы войти в аккаунт и вернуться к тренировкам.",
    preheader: "Используйте одноразовый код из письма для входа в аккаунт.",
  },
  password_reset: {
    label: "Восстановление доступа",
    subject: "Восстановление пароля — DopaFit",
    title: "Восстановление пароля",
    intro:
      "Вы запросили восстановление доступа. Введите этот код в приложении DopaFit, чтобы создать новый пароль.",
    preheader: "Подтвердите запрос на восстановление доступа к аккаунту DopaFit.",
  },
  verify_email: {
    label: "Электронная почта",
    subject: "Подтверждение почты — DopaFit",
    title: "Подтвердите почту",
    intro: "Введите этот код в приложении DopaFit, чтобы подтвердить этот адрес электронной почты.",
    preheader: "Подтвердите адрес электронной почты в настройках аккаунта.",
  },
  change_email: {
    label: "Новый адрес почты",
    subject: "Подтверждение новой почты — DopaFit",
    title: "Подтвердите новую почту",
    intro:
      "Вы указали новую почту в настройках DopaFit. Введите этот код в приложении, чтобы изменить адрес в аккаунте.",
    preheader: "Подтвердите новый адрес электронной почты для вашего аккаунта.",
  },
  change_login_method: {
    label: "Настройки безопасности",
    subject: "Смена способа входа — DopaFit",
    title: "Смена способа входа",
    intro: "Введите этот код в приложении DopaFit, чтобы изменить способ входа в аккаунт.",
    preheader: "Подтвердите изменение настроек входа в аккаунт DopaFit.",
  },
  account_delete: {
    label: "Удаление аккаунта",
    subject: "Подтверждение удаления аккаунта — DopaFit",
    title: "Подтверждение удаления аккаунта",
    intro:
      "Вы запросили удаление аккаунта DopaFit. Введите этот код в приложении, чтобы подтвердить удаление аккаунта.",
    preheader: "Код для подтверждения запроса на удаление аккаунта DopaFit.",
  },
} satisfies Record<
  EmailPurpose,
  { label: string; subject: string; title: string; intro: string; preheader: string }
>;

// Email clients cannot rely on the application's CSS variables or downloaded fonts.
const palette = {
  light: {
    surface: "#F2F0EC",
    card: "#FAFAF8",
    content: "#161412",
    muted: "#6E6A64",
    line: "#D9D9D9",
    accentSurface: "#FFF0E6",
    accentText: "#A84700",
    accentLine: "#FFB374",
  },
  dark: {
    surface: "#161412",
    card: "#27251F",
    content: "#FAFAF8",
    muted: "#C2BEB5",
    line: "#46433E",
    accentSurface: "#4D2000",
    accentText: "#FFB374",
    accentLine: "#A84700",
  },
  brand: "#FF7003",
};

const font = "Manrope, -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif";

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character]!,
  );
}

const styles = `
  body, table, td { margin: 0; padding: 0; }
  table { border-collapse: separate; border-spacing: 0; mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
  body { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
  @media screen and (min-width: 481px) {
    .email-outer { padding: 40px 16px !important; }
    .email-content { padding: 36px 40px !important; }
    .email-title { font-size: 30px !important; line-height: 38px !important; }
    .email-brand-note { display: table-cell !important; }
    .email-code { font-size: 42px !important; letter-spacing: 8px !important; }
  }
  @media (prefers-color-scheme: dark) {
    .email-logo-light { display: none !important; }
    .email-logo-dark { display: block !important; }
    .email-surface { background-color: ${palette.dark.surface} !important; }
    .email-card { background-color: ${palette.dark.card} !important; border-color: ${palette.dark.line} !important; }
    .email-text { color: ${palette.dark.content} !important; }
    .email-muted { color: ${palette.dark.muted} !important; }
    .email-code-box { background-color: ${palette.dark.accentSurface} !important; border-color: ${palette.dark.accentLine} !important; }
    .email-accent-text { color: ${palette.dark.accentText} !important; }
    .email-divider { border-color: ${palette.dark.line} !important; }
  }
`;

function renderHtml(
  copy: (typeof VERIFICATION_EMAIL_COPY)[EmailPurpose],
  code: string,
  lifetime: string,
) {
  const c = palette.light;
  return `<!DOCTYPE html>
<html lang="ru" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <meta name="format-detection" content="telephone=no, date=no, address=no, email=no">
  <title>${escapeHtml(copy.subject)}</title>
  <style>${styles}</style>
</head>
<body class="email-surface" style="margin:0; padding:0; width:100%; background-color:${c.surface}; font-family:${font}; color:${c.content};">
  <div class="email-preheader" style="display:none; font-size:1px; line-height:1px; max-height:0; max-width:0; opacity:0; overflow:hidden; mso-hide:all;">${escapeHtml(copy.preheader)}</div>
  <table role="presentation" width="100%" class="email-surface" style="width:100%; background-color:${c.surface}; font-family:${font};">
    <tr><td align="center" class="email-outer" style="padding:24px 12px;">
      <!--[if mso]><table role="presentation" width="560" align="center"><tr><td><![endif]-->
      <table role="presentation" width="100%" style="width:100%; max-width:560px;">
        <tr><td style="padding:0 8px 24px;">
          <table role="presentation" width="100%" style="width:100%;">
            <tr>
              <td style="width:152px;">
                <img class="email-logo-light" src="cid:${EMAIL_BRAND_IMAGES[0]!.cid}" alt="DopaFit" width="143" height="31" style="display:block; width:143px; height:31px; border:0; color:${c.content}; font-size:22px;">
                <img class="email-logo-dark" src="cid:${EMAIL_BRAND_IMAGES[1]!.cid}" alt="DopaFit" width="143" height="31" style="display:none; width:143px; height:31px; border:0; color:${palette.dark.content}; font-size:22px; mso-hide:all;">
              </td>
              <td align="right" class="email-muted email-brand-note" style="display:none; font-size:11px; line-height:18px; letter-spacing:1px; color:${c.muted};">ВАШ РИТМ. ВАШ ПРОГРЕСС.</td>
            </tr>
          </table>
        </td></tr>
        <tr><td class="email-card" style="background-color:${c.card}; border:1px solid ${c.line}; border-radius:16px;">
          <table role="presentation" width="100%" style="width:100%;">
            <tr><td class="email-content" style="padding:28px 24px; font-family:${font};">
              <table role="presentation" width="100%" style="width:100%;">
                <tr><td style="padding-bottom:24px;"><table role="presentation" width="36"><tr><td height="4" style="height:4px; line-height:4px; font-size:0; background-color:${palette.brand}; border-radius:2px;">&nbsp;</td></tr></table></td></tr>
                <tr><td class="email-accent-text" style="padding-bottom:12px; font-size:12px; line-height:18px; font-weight:700; letter-spacing:1px; color:${c.accentText};">${escapeHtml(copy.label.toLocaleUpperCase("ru-RU"))}</td></tr>
                <tr><td><h1 class="email-text email-title" style="margin:0 0 16px; font-size:26px; line-height:34px; font-weight:700; letter-spacing:-0.6px; color:${c.content};">${escapeHtml(copy.title)}</h1></td></tr>
                <tr><td class="email-muted" style="padding-bottom:28px; font-size:16px; line-height:26px; color:${c.muted};">${escapeHtml(copy.intro)}</td></tr>
                <tr><td class="email-code-box" align="center" style="padding:22px 12px; border:1px solid ${c.accentLine}; border-radius:12px; background-color:${c.accentSurface};">
                  <p class="email-accent-text" style="margin:0 0 10px; font-size:11px; line-height:18px; font-weight:700; letter-spacing:1.2px; color:${c.accentText};">КОД ПОДТВЕРЖДЕНИЯ</p>
                  <p style="margin:0; line-height:52px;"><span class="email-text email-code" style="font-family:'SFMono-Regular', Consolas, 'Liberation Mono', monospace; font-size:36px; line-height:52px; font-weight:700; letter-spacing:6px; color:${c.content}; white-space:nowrap;">${escapeHtml(code)}</span></p>
                  <p class="email-accent-text" style="margin:10px 0 0; font-size:13px; line-height:20px; color:${c.accentText};">Код действует <strong>${escapeHtml(lifetime)}</strong></p>
                </td></tr>
                <tr><td class="email-muted" style="padding:16px 0 28px; font-size:13px; line-height:20px; color:${c.muted};">Вернитесь в приложение и введите код в поле подтверждения.</td></tr>
                <tr><td class="email-divider" style="border-top:1px solid ${c.line}; padding-top:24px;">
                  <p class="email-text" style="margin:0 0 6px; font-size:14px; line-height:22px; font-weight:700; color:${c.content};">Никому не сообщайте код</p>
                  <p class="email-muted" style="margin:0; font-size:13px; line-height:21px; color:${c.muted};">Если вы не запрашивали это действие, просто проигнорируйте письмо. Используйте код только в приложении DopaFit.</p>
                </td></tr>
              </table>
            </td></tr>
          </table>
        </td></tr>
        <tr><td align="center" class="email-muted" style="padding:24px 16px 0; font-size:12px; line-height:20px; color:${c.muted};">DopaFit · Тренировки в вашем ритме<br>Это автоматическое письмо, отвечать на него не нужно.</td></tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td></tr>
  </table>
</body>
</html>`;
}

export function renderVerificationEmail(purpose: Purpose, code: string, ttlSeconds: number) {
  if (!Object.hasOwn(VERIFICATION_EMAIL_COPY, purpose))
    throw new AppError("validation_error", "Отправка SMS пока недоступна");
  const copy = VERIFICATION_EMAIL_COPY[purpose as EmailPurpose];
  const lifetime = `${Math.ceil(ttlSeconds / 60)} мин.`;
  return {
    subject: copy.subject,
    text: `${copy.title}\n\n${copy.intro}\n\nКод подтверждения: ${code}\nКод действует ${lifetime}\n\nНикому не сообщайте код.\nЕсли вы не запрашивали это действие, просто проигнорируйте письмо. Используйте код только в приложении DopaFit.\n\nDopaFit · Тренировки в вашем ритме\nЭто автоматическое письмо, отвечать на него не нужно.`,
    html: renderHtml(copy, code, lifetime),
  };
}
