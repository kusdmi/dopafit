import { REFERRAL_BONUS_DAYS } from "./policy.js";

/**
 * User-facing Russian text for this module, kept out of the service so a business rule reads
 * as a rule. Not a localisation layer — there is one language — just a separation.
 *
 * `benefits` is part of an API response (subscriptions_get_status), so its wording is
 * effectively contract.
 */
export const messages = {
  benefits: [
    "До 100 собственных программ",
    "До 7 дней, 10 упражнений и 5 альтернатив",
    "До 100 клиентов: 50 зарегистрированных и 50 без аккаунта",
    "Аналитика за всю историю",
    "Таймер отдыха и среднее время отдыха",
    "Отправка результатов тренировки",
  ],

  subscriptionActive: {
    title: "Подписка активна",
    body: "Премиум-доступ активирован. Спасибо!",
  },

  referralQualified: {
    title: "Начислены бонусные дни",
    // Built from the constant so the promised number cannot drift from the granted one.
    body: `Вам начислено ${REFERRAL_BONUS_DAYS} дней премиума за приглашённого друга.`,
  },
} as const;
