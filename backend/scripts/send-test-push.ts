import { eq } from "drizzle-orm";
import { loadConfig } from "../src/config.js";
import { createDatabase } from "../src/platform/db/index.js";
import { users } from "../src/platform/db/schema.js";
import { createMessagingModule } from "../src/modules/messaging/index.js";
import { WebPushProvider } from "../src/platform/push.js";

/**
 * Sends one real push to a user's registered devices, so delivery can be confirmed without
 * waiting for a scheduled job or reproducing a link request.
 *
 * It goes through the same `messaging.push.deliver` the application uses — the settings gate,
 * the per-token loop and the eviction of dead subscriptions all apply — so a notification that
 * arrives here proves the production path, not a shortcut around it.
 *
 * Run through `make push-test EMAIL=...`.
 */
const email = process.argv[2];
if (!email) {
  console.error("Использование: make push-test EMAIL=user@example.com");
  process.exit(1);
}

const config = loadConfig();
if (!config.vapid) {
  console.error(
    "VAPID-ключи не заданы: DOPAFIT_VAPID_PUBLIC_KEY / DOPAFIT_VAPID_PRIVATE_KEY.\n" +
      "Сгенерировать пару: make push-keys",
  );
  process.exit(1);
}

const db = createDatabase(config.databaseUrl, config.databaseRootCertificate);
try {
  const user = (
    await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1)
  )[0];
  if (!user) {
    console.error(`Пользователь ${email} не найден.`);
    process.exit(1);
  }

  const messaging = createMessagingModule(db, {
    pushProvider: new WebPushProvider(config.vapid),
    onIntegrationError: (error) => console.error("Ошибка отправки:", error),
  });

  // `support` is deliberate: it is the one type not gated by a per-category toggle, so the
  // test reports on the transport rather than on which checkboxes happen to be ticked. The
  // master `push_enabled` switch still applies — a silent run means it is off.
  await messaging.push.deliver({
    userId: user.id,
    type: "support",
    title: "DopaFit",
    body: "Тестовое уведомление. Если вы его видите — push работает.",
  });
  console.info(`Отправка выполнена для ${email}. Проверьте устройство.`);
} finally {
  await db.$client.end();
}
