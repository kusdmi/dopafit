# Тестовый стенд (этап 15.1): app.dopafit.ru

Приложение на период тестового запуска: Premium подключается бесплатно по кнопке,
без оплаты. Email доставляется через SMTP после настройки ящика, защита регистрации,
входа и отправки кодов — Yandex SmartCaptcha после настройки серверного ключа.
Существующая конфигурация стенда не меняется автоматически при обновлении образа.

## Схема

- `https://app.dopafit.ru` — **один домен**: приложение отдаёт и PWA, и `/api/v1`
  с одного origin (CORS браузеру не нужен)
- TLS терминирует Caddy (сертификаты Let's Encrypt автоматически)
- Postgres и S3 — внешние; на VPS только контейнеры приложения
- Стек — три сервиса: `caddy` (TLS + reverse proxy), `app` (API + PWA + фоновые
  задачи в том же процессе), `migrate` (one-shot, отрабатывает до старта `app`)

## Первичная настройка (один раз)

1. **DNS**: A-запись `app.dopafit.ru` → IP VPS. Домены-алиасы (если есть) — тоже
   A-записями на этот IP.
2. **VPS**: установить Docker: `curl -fsSL https://get.docker.com | sudo sh`,
   добавить пользователя в группу docker: `sudo usermod -aG docker $USER` (перелогиниться).
   Внешний PostgreSQL — желательно той же мажорной версии, что dev/CI (**18**).
3. **Env**: на VPS `mkdir -p ~/dopafit`, скопировать `deploy/.env.prod.example` в
   `~/dopafit/.env.prod` и заполнить (комментарии в файле). Секреты:
   `openssl rand -hex 32`. Если провайдер Postgres требует TLS с приватным CA —
   скачайте его корневой сертификат в `~/dopafit/certs/pg-root.crt` и раскомментируйте
   `DOPAFIT_DATABASE_SSL_ROOT_CERT=/certs/pg-root.crt` (проверка verify-full: цепочка
   и hostname; ротация = заменить файл и перезапустить стек).
   Заполнить SMTP и SmartCaptcha по разделу ниже.
   `DOPAFIT_DEV_VERIFICATION_CODE` оставить пустым: SMTP отказывается работать
   с фиксированными кодами. `DOPAFIT_CORS_ORIGINS` на стенде не нужен — PWA ходит на свой
   же origin; переменная понадобится, когда вернутся native-сборки (этап 18), у них
   WebView-origin свой.
4. **Домен**: на VPS создать `~/dopafit/.env` (это НЕ `.env.prod` — его читает сам
   compose) по шаблону `deploy/.env.example`:

   ```bash
   DOPAFIT_APP_DOMAIN=app.dopafit.ru
   ```

   Сюда же на этапе 15.2 лягут `DOPAFIT_IMAGE_PREFIX`/`DOPAFIT_IMAGE_TAG`.
5. **S3 CORS** на бакете (загрузка фото идёт presigned-ссылками из браузера):

   ```json
   [
     {
       "AllowedOrigins": ["https://app.dopafit.ru"],
       "AllowedMethods": ["GET", "PUT"],
       "AllowedHeaders": ["*"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

### Подводные камни managed-провайдеров (проверено на Timeweb Cloud)

- **`sslmode` в `DOPAFIT_DATABASE_URL`**: параметр указывать НЕ нужно. Драйвер `pg`,
  увидев его, строит TLS-конфиг сам и игнорирует `ca` из `createDatabase`
  (`backend/src/platform/db/index.ts`) — подключение падает с
  `SELF_SIGNED_CERT_IN_CHAIN`. Проверка при этом не ослабляется: `ca` +
  `rejectUnauthorized: true` в коде эквивалентны `verify-full`.
- **Имя бакета** — то, что реально завёл провайдер (у Timeweb это UUID), а не
  произвольное. Приложение создаёт бакет только если `HeadBucket` вернул 404 И у
  ключа есть на это право; иначе старт падает с `AccessDenied`.
  Посмотреть доступные бакеты можно вызовом `ListBuckets` тем же ключом.
- **`DOPAFIT_S3_PUBLIC_ENDPOINT` = тот же хост, что и `DOPAFIT_S3_ENDPOINT`.**
  Подпись SigV4 включает хост, поэтому presigned-ссылка, переписанная на
  домен-алиас (например `static.dopafit.ru`), отвергается с `SignatureDoesNotMatch`.
  Отдавать фото с такого алиаса можно было бы только сделав бакет публично
  читаемым — тогда любой объект доступен всем, кто знает путь. Бакет закрыт,
  фото отдаются по presigned-ссылкам на час.

## Деплой и обновление

Обычный путь — **автоматический**: пуш в `main` собирает образ и выкатывает его на
стенд (см. «CI/CD» ниже). Ничего запускать руками не нужно.

### Ручной деплой (запасной путь)

Нужен, когда GitHub недоступен или надо выкатить незакоммиченное:

```bash
DOPAFIT_VPS=user@<vps-host> make deploy
```

Скрипт собирает **один образ** из корневого `Dockerfile` (`--target prod`,
linux/amd64, теги `latest` + git-SHA), заливает его по SSH, синхронизирует
compose-файлы, пинит тег в `~/dopafit/.env` и перезапускает стек. Имя образа берётся
из `DOPAFIT_IMAGE_PREFIX` на самом VPS — так собранный локально образ совпадает с тем,
что ждёт compose, даже когда стенд настроен на registry. Миграции
(`node backend/dist/platform/db/migrate.js`) выполняет сервис `migrate` —
`app` стартует только после его успешного завершения.

API-URL в бандл не зашивается: PWA обращается к собственному origin, поэтому
при смене домена пересборка фронтенда не нужна — достаточно поправить
`DOPAFIT_APP_DOMAIN` в `~/dopafit/.env` и перезапустить `caddy`.

## Web Push (обязателен в prod)

Уведомления доставляются по-настоящему, и в prod приложение **не стартует** без
пары VAPID-ключей (`Insecure production configuration: DOPAFIT_VAPID_PUBLIC_KEY, …`).
Так сделано намеренно: без ключей фронтенд просто прячет кнопку уведомлений, и
неработающий push выглядит как «ещё не реализовано», а не как ошибка настройки.

Один раз сгенерируйте пару на машине разработчика и впишите в `~/dopafit/.env.prod`
(и в свою копию `deploy/.env.prod`, откуда её читает `deploy.sh`):

```bash
make push-keys
```

Публичный ключ нужен **дважды**: бэкенду — как `DOPAFIT_VAPID_PUBLIC_KEY`, и внутри
бандла фронтенда, потому что браузер читает его на этапе сборки. Отдельно
прописывать второй раз не нужно — `deploy.sh` берёт ключ из `deploy/.env.prod` и
передаёт в сборку как build-arg `VITE_VAPID_PUBLIC_KEY` (через `.env`-файл это не
работает: `.dockerignore` не пускает `.env*` в образ). Без ключа `deploy.sh`
останавливается до сборки.

⚠️ Приватный ключ — секрет уровня `DOPAFIT_JWT_SECRET`. Смена пары обнуляет все
существующие подписки: каждому пользователю придётся включить уведомления заново.

Проверить доставку на живом пользователе (нужны ключи в окружении):

```bash
make push-test EMAIL=user@example.com
```

## Наполнение каталога (один раз, после первого деплоя)

Миграции создают пустые таблицы (36 штук). Каталог упражнений и стандартные программы
заливает seed-скрипт (идемпотентный, существующие записи пропускает):

```bash
ssh user@<vps-host> "cd ~/dopafit && docker compose -f docker-compose.prod.yml run --rm app node backend/dist/platform/db/seed.js"
```

При `DOPAFIT_ENVIRONMENT=prod` скрипт заливает только каталог и программы;
демо-аккаунты (`client@dopafit.dev` / `trainer@dopafit.dev`) в prod-окружении
сознательно пропускаются — в логе будет `Production environment: demo accounts skipped`.

Другого способа править общий каталог сейчас нет — см. «Административные сценарии».

## Email и SmartCaptcha

Для публичного запуска в `~/dopafit/.env.prod`:

```dotenv
DOPAFIT_NOTIFICATION_PROVIDER=smtp
DOPAFIT_SMTP_HOST=<hostname провайдера>
DOPAFIT_SMTP_PORT=587
DOPAFIT_SMTP_USER=auth@dopafit.ru
DOPAFIT_SMTP_PASSWORD=<пароль ящика>
DOPAFIT_DEV_VERIFICATION_CODE=
DOPAFIT_ALLOW_FIXED_VERIFICATION_CODE=false
DOPAFIT_ALLOW_UNDELIVERED_NOTIFICATIONS=false
DOPAFIT_SMARTCAPTCHA_SITE_KEY=ysc1_6awhCKX7VRAK4f1ph7Qvv8RWxyVP7rmp1dEojEpx6b2c5d53
DOPAFIT_SMARTCAPTCHA_SECRET_KEY=<серверный ключ той же капчи>
DOPAFIT_SMARTCAPTCHA_ALLOWED_HOSTS=app.dopafit.ru
```

Пароль и серверный ключ хранятся только на сервере, не в git или `VITE_*`.
SMTP: 587 с обязательным STARTTLS либо 465 с TLS с начала соединения; проверка
сертификатов включена. Отправитель совпадает с логином ящика. Коды случайные,
срок действия указан в письме. SMTP-ошибка откатывает транзакцию выдачи кода и
возвращает понятную ошибку; автоматической повторной отправки писем нет.
SMS не подключён: отправка на телефон отклоняется явно.

Разрешить `app.dopafit.ru` в настройках SmartCaptcha. Бэкенд принимает только
успешную проверку с разрешённым `host`; таймаут, HTTP-ошибка и некорректный ответ
не пропускают запрос. Публичный ключ отдаёт `GET /api/v1/auth/captcha-config`;
серверный ключ остаётся в backend. Дополнительных build args не требуется.
Капча проверяется при входе по паролю (включая второй этап 2FA), регистрации,
запросе/повторе кода, восстановлении пароля, подтверждении/смене контакта,
смене способа входа и запросе удаления. Каждый запрос получает новый токен.
Лимиты отправки кодов сохраняются. Frontend использует невидимую проверку:
кнопка формы ожидает результат, задание показывается по решению Яндекса.
Для невидимого режима отдельные env-переменные и новые ключи не нужны.

После изменения env пересоздать `app`, чтобы обновилось окружение, например:
`docker compose -f docker-compose.prod.yml up -d --force-recreate app`.
Сам деплой кода и настройка env не выполняют проверочную рассылку.

В локальном dev капча отключена и письма логируются по умолчанию. Для реальной
капчи положить `DOPAFIT_SMARTCAPTCHA_SECRET_KEY` и при необходимости публичный ключ
в корневой `.env`, добавить `localhost` в домены Яндекса и выполнить
`docker compose up -d --force-recreate backend`. Для SMTP там же задать SMTP-переменные
и пустой `DOPAFIT_DEV_VERIFICATION_CODE`. Только сервис `backend` подхватывает эти
настройки: `backend-e2e` и `workspace` остаются на изолированных тестовых интеграциях.

Без серверного ключа SmartCaptcha API возвращает `site_key: null` и не требует
капчу. Непустой публичный ключ без серверного запрещён конфигурацией.
Старый закрытый стенд может явно оставить logging-провайдер и разрешённый
фиксированный код, но публичный шаблон выше рассчитан на реальные письма.
Production logging не печатает коды и не доставляет их пользователю.

## Административные сценарии

Админки нет: SQLAdmin удалён вместе с Python-бэкендом. Сейчас **недоступны** ответы
на обращения в поддержку, рассылки, ручное управление подписками и пользователями,
редактирование общего каталога упражнений (каталог наполняется только сидированием,
см. выше). Замена запланирована как отдельный CRM-интерфейс поверх текущего API —
`docs/techdebt.md`, этап 17.

## Premium на период тестового запуска

В настройках Premium кнопка «Подключить Premium бесплатно» сразу включает доступ
текущему пользователю. Платежи не создаются; тарифы, цены и подарки скрыты.
`POST /api/v1/subscriptions/activate` доступен после входа клиентам и тренерам.
Доступ хранится в `subscriptions` с `ends_at = null`, без автопродления.
Миграция перед запуском приложения снимает NOT NULL с этой колонки и добавляет
уникальный индекс для активного доступа без даты окончания.

Завершение тестового запуска требует отдельного выпуска: закрыть бесплатное
подключение и выставить фактическое время окончания таким подпискам. Обычные
срочные подписки сохраняют свои сроки. Mock-webhook в production закрыт.

## Мобильные сборки

Сейчас не собираем: таргет `make apk` удалён, нативные проекты `frontend/ios` и
`frontend/android` в репозитории не хранятся — они восстанавливаются через `npx cap add`.
Возобновление native-сборок, подписи и публикации — `docs/techdebt.md`, этап 18.
Пользователи стенда работают с PWA по адресу `https://app.dopafit.ru`.

## Дополнительные домены (редиректы на основной)

Произвольный список доменов-алиасов живёт на VPS в `~/dopafit/conf.d/` (в git не
попадает) — Caddy импортирует оттуда все `*.caddy`. Шаблон в репозитории:
`deploy/conf.d/redirects.caddy.example`. Пример `~/dopafit/conf.d/redirects.caddy`:

```caddyfile
app.dopa-fitness.ru, app.dopa-fit.ru {
	redir https://app.dopafit.ru{uri} permanent
}
```

Не забудьте A-записи алиасов на IP VPS. Применить изменения:
`docker compose -f docker-compose.prod.yml restart caddy` (сертификаты на новые
домены Caddy выпустит сам).

## Откат

Каждый деплой оставляет на VPS образ с тегом git-SHA. Вернуться на предыдущую версию:

```bash
ssh user@<vps-host> "cd ~/dopafit && DOPAFIT_IMAGE_TAG=<старый-sha> docker compose -f docker-compose.prod.yml up -d"
```

(`docker images | grep dopafit` на VPS покажет доступные теги. Вернуться на свежую: без переменной.)

⚠️ Откат образа не откатывает миграции: у Drizzle нет down-миграций. Если новая
версия добавила схему, старый образ обычно продолжает работать (лишние колонки его
не смущают), но обратную несовместимость проверяйте до деплоя.

## CI/CD (основной путь)

Пуш в `main` → GitHub Actions собирает образ, публикует в GHCR и выкатывает на стенд.
Ручной `make deploy` остаётся запасным вариантом (см. «Ручной деплой» выше).

Цепочка в `.github/workflows/ci.yml`:

```
push в main → backend │ frontend │ contract │ deploy-configs   (условные, по изменениям)
                              ↓ ни один не упал
                          prod-image  → ghcr.io/<owner>/dopafit-app:<sha> + :latest
                              ↓
                           deploy     → ssh → ci-deploy.sh на VPS
```

`prod-image` запускается **всегда** (фильтра по путям нет): до стенда должно доезжать
любое изменение кода, а не только правка `Dockerfile`. Пропущенные job'ы деплой не
блокируют, упавшие — блокируют. На pull request образ собирается, но не публикуется.

Публичный VAPID-ключ передаётся в сборку как build-arg `VITE_VAPID_PUBLIC_KEY`
(секрет `VAPID_PUBLIC_KEY`) — он резолвится в бандле на этапе сборки, см. «Web Push».

### Что делает `ci-deploy.sh` на VPS

Скрипт версионируется в `deploy/ci-deploy.sh` и копируется в `~/dopafit/`. Шаги:
пинит тег в `~/dopafit/.env` → `pull` → `up -d` (сервис `migrate` отрабатывает перед
`app`) → ждёт `/health/ready` до 60 с → чистит образы, оставляя 5 последних.

Проверка готовности идёт **изнутри контейнера**, а не через Caddy: так она говорит о
приложении и БД, а не заодно о TLS и DNS. Если стенд не поднялся, job краснеет, в лог
попадают последние строки `migrate` и `app` и готовая команда отката. Уборка образов —
только после успешной проверки, иначе можно остаться без версии для отката.

### Настройка (сделана один раз)

1. **Секреты репозитория** (Settings → Secrets and variables → Actions):
   `DEPLOY_SSH_KEY` (приватный ключ CI), `DEPLOY_HOST`, `DEPLOY_PORT`, `DEPLOY_USER`,
   `VAPID_PUBLIC_KEY`. Для GHCR отдельный токен не нужен — у workflow есть
   `GITHUB_TOKEN` с `packages: write`.
2. **Ключ на VPS** — отдельный ed25519, в `~/.ssh/authorized_keys` привязан к одной
   команде:

   ```
   command="/home/dopa/dopafit/ci-deploy.sh",no-agent-forwarding,no-port-forwarding,no-pty,no-user-rc,no-X11-forwarding ssh-ed25519 AAAA...
   ```

   Утёкший ключ позволяет только передеплоить образ: shell'а он не даёт, а тег
   проверяется регуляркой `^[0-9a-f]{7,40}$` до того, как попадёт в docker.
3. **Доступ к приватному пакету**: `docker login ghcr.io` на VPS под токеном с правом
   `read:packages` (для публичного пакета логин не нужен).
4. **`~/dopafit/.env`**: `DOPAFIT_IMAGE_PREFIX=ghcr.io/<owner>/dopafit`.
   `DOPAFIT_IMAGE_TAG` скрипт проставляет сам при каждом деплое.

### Ограничения, о которых стоит помнить

- **`.env.prod` в CI не попадает** — файл живёт только на VPS. Если код начнёт
  требовать новую переменную, деплой выкатит его, `app` упадёт на старте
  (`Insecure production configuration: ...`), health-check это поймает и покрасит
  workflow — но стенд будет лежать. **Новая переменная = правка на сервере до мержа
  в `main`.**
- **Отката нет** — по решению: job краснеет, стенд остаётся на сломанной версии,
  команда возврата печатается в лог. Откат не отменяет миграции (у Drizzle нет `down`).
- **Даунтайм несколько секунд**: `up -d` перезапускает контейнер. Для одного инстанса
  без балансировщика это цена вопроса.
- **Пакет в GHCR растёт**: на VPS хранятся 5 последних образов, а в registry — все.
  Чистить там можно вручную или настроить retention-политику пакета.

## Диагностика

```bash
ssh user@<vps-host> "cd ~/dopafit && docker compose -f docker-compose.prod.yml ps"
ssh user@<vps-host> "cd ~/dopafit && docker compose -f docker-compose.prod.yml logs --tail 100 app"
curl -fsS https://app.dopafit.ru/health/live
curl -fsS https://app.dopafit.ru/health/ready   # проверяет доступность БД
```

- `migrate` должен быть `Exited (0)`; ненулевой код = смотреть его логи (обычно БД
  недоступна). После починки: `docker compose -f docker-compose.prod.yml run --rm migrate`,
  затем `up -d` (упавший one-shot блокирует старт зависимых сервисов).
- `app` не стартует с `Insecure production configuration: ...` = не заполнен
  `.env.prod` (в сообщении перечислены конкретные переменные).
- `migrate`/`app` падают с SSL-ошибкой подключения к БД = проверьте
  `DOPAFIT_DATABASE_SSL_ROOT_CERT` и что файл сертификата лежит в `~/dopafit/certs/`.
- Стек не стартует с `set DOPAFIT_APP_DOMAIN in ~/dopafit/.env` = не создан/не заполнен `~/dopafit/.env` (шаг 4 первичной настройки).
- Сертификат не выпускается = проверить DNS-записи и что порты 80/443 открыты (firewall).
- Ошибка вида `Invalid DOPAFIT_S3_ENDPOINT` = endpoint задаётся **со схемой**
  (`https://s3.example.com`); отдельной переменной `DOPAFIT_S3_SECURE` больше нет.
- Открывается белая страница при переходе по прямой ссылке = проверьте, что запрос
  дошёл до `app` (SPA-fallback отдаёт `index.html` для всех не-`/api` путей;
  `/api/*` всегда отвечает JSON-ошибкой, а не HTML).
