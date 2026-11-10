import webpush from "web-push";

/**
 * Prints a fresh VAPID key pair and stops. Nothing is written to disk: where the keys
 * belong differs per environment (a gitignored `.env.development.local` locally,
 * `~/dopafit/.env.prod` on the stand), and a script that guessed would sooner or later
 * write a private key into the repository.
 *
 * Run through `make push-keys` so it executes in the container, like everything else.
 */
const { publicKey, privateKey } = webpush.generateVAPIDKeys();

console.info(`
Пара ключей VAPID сгенерирована. Она НЕ сохранена — скопируйте вручную.

  Фронтенд — frontend/.env.development.local (файл в .gitignore):

    VITE_VAPID_PUBLIC_KEY=${publicKey}

  Бэкенд — окружение процесса (dev: docker-compose.override.yml,
  прод: ~/dopafit/.env.prod на VPS):

    DOPAFIT_VAPID_PUBLIC_KEY=${publicKey}
    DOPAFIT_VAPID_PRIVATE_KEY=${privateKey}
    DOPAFIT_VAPID_SUBJECT=mailto:you@example.com

ПРИВАТНЫЙ КЛЮЧ — СЕКРЕТ, в git не коммитить.
Публичный ключ на фронте и на бэке должен быть ОДИН И ТОТ ЖЕ: подписка,
оформленная под один ключ, не принимается сервером с другим.
Смена пары обнуляет все существующие подписки.
`);
