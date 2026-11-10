# DopaFit — правила разработки

Главный документ для всех участников. Изменения проходят через PR в `main`.

Стек: backend — Node.js + Hono + TypeScript + Drizzle; frontend — React + React Router + Vite (PWA).
Репозиторий — один pnpm workspace с единым lock-файлом в корне.

## 1. Принципы

- **Контракт — источник правды.** API описан в `contracts/openapi.json`. Frontend и backend разрабатываются параллельно против контракта, а не друг против друга.
- **Связанные изменения идут вместе.** Backend, frontend, контракт, документация и конфиги
  одной задачи могут изменяться в одном PR. При параллельной работе явно назначаем владельцев файлов.
- **Локальная разработка — только через Docker.** На хосте нужны лишь Docker и `make`. Никаких `pnpm`/`node` на хосте. **Исключение:** нативные сборки Capacitor (iOS/Android), если они возобновятся, выполняются на хосте — см. §10.
- **Этапность.** Работаем итерациями: сначала база, затем надстройки. Итерация закрыта, когда фронт работает против реального API.
- **Offline-first.** Максимум функций работает без сети с синхронизацией при подключении; пользователь всегда видит офлайн-статус и какие действия недоступны (механика — в `docs/architecture.md`, раздел «Офлайн-режим»).

## 2. Структура репозитория и зоны ответственности

| Папка | Кто меняет | Как |
|---|---|---|
| `frontend/` | FE-разработчик | короткая ветка от `main` |
| `backend/` | BE-разработчик | та же ветка, если изменение связано с frontend |
| `contracts/` | оба | генерация в том же PR; проверка обеих сторон контракта |
| `e2e/` | оба | браузерные тесты в том же PR, что изменение пользовательского поведения |
| `docs/`, корневые конфиги (`docker-compose*`, `Makefile`, CI) | оба | вместе с относящимися к ним изменениями |

## 3. Git-процесс

- `main` — интеграционная ветка, всегда зелёная (CI обязателен).
- Короткие feature/refactor-ветки создаются от `main` и вливаются обратно через PR.
  Долгоживущие `frontend` и `backend` больше не используются для новых задач.
- Коммиты делим на проверяемые логические части. Общий PR должен проходить интеграционные проверки.
- **Точка синка этапа:** совместная интеграционная проверка — фронт переключается с моков (`VITE_API_MOCK=true`) на реальный API и прогоняется smoke-сценарий задачи.
- Коммиты — [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`. Область — `feat(measurements): ...`.
- **Разовая настройка после клона:** `git config blame.ignoreRevsFile .git-blame-ignore-revs` —
  чтобы `git blame` не упирался в коммиты сплошного переформатирования. GitHub учитывает этот
  файл сам; локальному git его нужно указать явно.

## 4. Процесс изменения контракта

1. Инициатор меняет Zod-схемы и объявления эндпоинтов в `backend/src/modules/<модуль>/http/`
   (общий словарь объявления — `backend/src/endpoint.ts`). Пересборка контракта и типов —
   одной командой `make contracts` (Zod → `contracts/openapi.json` → типы фронта).
2. Контракт и сгенерированные типы включаются в тот же PR, что backend/frontend изменения.
   Контракт и типы вручную не редактируются.
3. Проверяем реализацию обеих сторон, обновляем моки и запускаем проверку отсутствия дрейфа.
4. Изменения пользовательского поведения предварительно описываем как «было → станет».

CI автоматически запускает lint, проверку типов, audit зависимостей и проверку контракта
для затронутых частей проекта. Тесты backend/frontend и сборки запускаются по запросу:
**Actions → Tests and builds (manual) → Run workflow**, выбрать ветку и нужные проверки.
Проверочная сборка Docker не публикует образ и не запускает деплой.
Браузерные тесты — **Actions → E2E (manual) → Run workflow**: `smoke`, `full`, `pwa`
или `all` (full + PWA). Расписания нет. Эти workflow станут доступны для ручного запуска
после попадания их файлов в `main`; затем можно выбирать любую ветку.
На push в `main` сохраняются сборка, публикация prod-образа и автодеплой после быстрых проверок.
Локальный Definition of Done ниже остаётся обязательным.

CI проверяет, что `contracts/openapi.json` соответствует коду бэкенда (повторный экспорт не даёт diff).

## 5. Definition of Done (для любой задачи)

- [ ] Код соответствует архитектуре (`docs/architecture.md`) и code style.
- [ ] Тесты написаны и проходят (`make be-test` / `make fe-test`).
- [ ] Линтеры и типы зелёные (`make be-lint` / `make fe-lint`).
- [ ] Контракт актуален (если менялся — через процесс из п. 4).
- [ ] Для FE: экран работает и на моках, и против реального API (если эндпоинты уже реализованы).
- [ ] Для FE: определено офлайн-поведение экрана — чтение из кэша; запись через outbox (для офлайн-способных модулей по `docs/architecture.md`, раздел «Офлайн-режим»); online-only действия задизейблены с пояснением.
- [ ] Для FE: экран корректен в светлой и тёмной теме (только семантические токены, без хардкод-цветов).
- [ ] Для BE: эндпоинт покрыт интеграционным тестом через `app.request()` (Hono); права доступа (клиент/тренер) проверены тестом.
- [ ] Для BE (офлайн-способные модули): create идемпотентен по клиентскому UUID, в ответах есть `updated_at`.
- [ ] Если менялось пользовательское поведение: сквозной путь покрыт e2e, `make e2e-smoke` зелёный
      (правила — `docs/TESTING.md`). При исправлении известного дефекта запись удалена из
      `e2e/support/known-issues.ts`, а его тест стал зелёным.
- [ ] CI на PR зелёный.

## 6. Code style

### Общее
- Язык кода, комментариев, коммитов — **английский**. Язык UI-текстов — **русский**.
- Комментарии — только там, где код не может выразить ограничение сам.

### Backend
- Слои: `http → modules/<домен>/application → infrastructure (repository) → domain`. Роутер не содержит бизнес-логики; сервис не знает про HTTP; репозиторий — единственное место с запросами к БД.
- Zod-схемы (DTO) отделены от Drizzle-таблиц; наружу никогда не отдаются строки ORM как есть.
- Типизация обязательна (`tsc --noEmit`, strict). Линт — eslint (`make be-lint` = eslint + tsc, `make be-format` = eslint --fix).
- Ошибки — доменные исключения сервисного слоя, маппятся в единый формат `{code, message, details}` middleware'ом.
- Миграции: одна логическая миграция на изменение схемы; drizzle-kit выводит её из схемы (`make be-makemigration`) + ручная проверка сгенерированного SQL перед коммитом.

### Frontend
- Feature-Sliced Design: `app → pages → features → entities → shared` (слоя `widgets` нет). Импорты только «вниз» по слоям; направление проверяет собственное eslint-правило `frontend/eslint-rules/fsd.js`.
- Слайсы одного слоя изолированы друг от друга: композиция — на слое выше, а если нужен доступ к соседней entity — через публичный `@x`-API (`entities/<slice>/@x/<consumer>`).
- Серверное состояние — TanStack Query (никаких данных API в Zustand); клиентское — Zustand.
- Формы — react-hook-form + zod-схемы (валидация согласована с контрактом API).
- Типы API — только сгенерированные (`make contracts`), руками типы ответов не пишем.
- Моки MSW лежат рядом с entity (`entities/*/api/mocks.ts`) и регистрируются в `shared/api/msw`.
- Логику и api-слой держим платформо-независимыми (без прямых обращений к DOM/localStorage вне `shared/lib`) — задел под React Native.
- **Темы (светлая/тёмная/системная).** Каждый компонент обязан корректно выглядеть во всех трёх режимах. Правила:
  - Цвета — только через семантические токены (`bg-surface`, `bg-card`, `bg-card-light`, `text-content`, `text-muted`, `border-line`). **Запрещены** хардкод-классы `bg-white/black/gray/slate/zinc`, `text-white/black` и литералы `#hex` в компонентах.
  - Бренд-акценты (`brand-*` оранжевый, `trainer-*` фиолетовый, `success`/`danger`) одинаковы в обеих темах; `text-white` допустим только как контраст на этих заливках (напр. primary-кнопка).
  - Палитра тем задаётся CSS-переменными в `app/styles/index.css` (`:root`, `[data-theme='dark']`, `@media (prefers-color-scheme: dark)`); токены `@theme` ссылаются на них. Новые семантические цвета добавляются сразу в обе палитры.
  - Тема применяется через `shared/lib/theme` (`setThemePreference`/`useThemePreference`); `system` снимает `data-theme` и отдаёт выбор ОС. Не обращаться к `document`/`matchMedia` напрямую из компонентов.
  - DoD экрана включает визуальную проверку в светлой и тёмной теме (скриншот или ручной прогон).

## 7. Команды (все — через Docker)

```
make up            # поднять окружение (postgres, minio, backend :8000, frontend :5173)
make down          # остановить
make logs          # логи всех сервисов
make ps            # статус контейнеров

make be-check      # весь DoD бэкенда: lint + test + build + контракт без дрейфа
make be-lint       # prettier --check + eslint + tsc --noEmit
make be-format     # prettier --write + eslint --fix
make be-test       # vitest (поднимает postgres)
make be-build      # tsc -p tsconfig.build.json
make be-migrate    # drizzle: применить миграции
make be-makemigration          # drizzle-kit generate (миграция выводится из схемы)
make be-seed       # каталог упражнений + демо-аккаунты (вне production)

make fe-lint       # eslint + tsc --noEmit
make fe-test       # vitest run
make fe-build      # production-сборка PWA

make e2e-up        # контур e2e: пересоздать базу dopafit_e2e, поднять backend-e2e и frontend-e2e
make e2e           # весь браузерный набор (Playwright в Docker)
make e2e-smoke     # критический путь; в CI — по запросу
make e2e-pwa       # PWA и service worker против прод-бандла (в dev SW выключен)
make e2e-issues    # сводка известных дефектов
make e2e-lint      # prettier + eslint + tsc для пакета e2e

make contracts     # Zod → contracts/openapi.json → типы фронта (одна команда)
make deps          # переустановить зависимости workspace (алиасы: be-deps / fe-deps)
make dev-lan       # dev-сервер фронта, доступный телефону по LAN (см. §11.2)
make deploy        # обёртка над deploy/deploy.sh (см. §12)
```

Production HTML собирается без HTML-комментариев; frontend JS/CSS минифицируются.
Backend build очищает `dist`, удаляет комментарии из JS и не выпускает sourcemap-файлы.

Разовые команды внутри контейнера — через escape hatch:
`make be-command ARGS='pnpm why zod'`, `make fe-command ARGS='pnpm exec vite --version'`.
Отдельные тесты — `make be-test args='auth-http'`, `make fe-test args='LoginForm'`,
`make e2e args='--grep PROG-06'`.

URL'ы в dev: фронт `http://localhost:5173`, API `http://localhost:8000`, MinIO console `http://localhost:9001`.
MinIO для dev/e2e использует готовую [сборку Coolify](https://github.com/coollabsio/minio)
с закреплёнными релизом и digest: официальный готовый образ больше недоступен.
Отдельного Swagger-UI нет: контракт — это `contracts/openapi.json`, который генерирует `make contracts`.

**Демо-аккаунты после `make be-seed`** (создаются только вне production):
`client@dopafit.dev` и `trainer@dopafit.dev`, пароль `Dopafit1Demo`.

> После изменения `package.json` обнови lock и запусти `make deps`: workspace один,
> lock-файл один (корневой `pnpm-lock.yaml`). Контейнеры держат `node_modules` в
> именованных volume'ах, поэтому обычного `make up` после новой зависимости недостаточно.

## 8. Тестирование

Правила, фикстуры, селекторы и работа с известными дефектами — **[docs/TESTING.md](TESTING.md)**;
каталог браузерных проверок — [docs/e2e-spec.md](e2e-spec.md). Ниже — только устройство уровней.

- **Backend:** vitest; HTTP-слой проверяется через `app.request()` (Hono, без сети). Тесты идут против
  **реального PostgreSQL**, а не моков: `createTestDatabase()` (`backend/tests-ts/database.ts`) на каждый
  тест-файл создаёт отдельную базу со случайным именем, прогоняет в ней drizzle-миграции и дропает её
  в конце. Поэтому `make be-test` сначала поднимает сервис `postgres`, а файлы гоняются последовательно
  (`fileParallelism: false`). Внешние сервисы (почта, платежи, S3) — за интерфейсами (`ports.ts`), в тестах фейки.
- **Frontend:** vitest + React Testing Library; сетевой слой в тестах — те же MSW-хендлеры, что и в dev-моках.
- **E2E:** Playwright в Docker против **изолированного контура** — своя база `dopafit_e2e`, свои
  `backend-e2e`/`frontend-e2e` со снятыми лимитами отправки кодов и коротким TTL токена. MSW там
  выключен: проверяется реальный API. PWA и service worker — только против прод-бандла (`make e2e-pwa`),
  потому что в dev-режиме service worker отключён (§11.2). Ручных прогонов нет.
- Минимум на этап: happy-path + ключевые ошибки валидации/доступа.
- Текущий объём: backend — 307 тестов, frontend — 804, e2e — наполняется по `docs/e2e-spec.md`.

## 9. Безопасность и доступы

- JWT: access 15 мин, refresh 30 дней с ротацией. httpOnly-cookie не используются (SPA + native
  из одного кода), поэтому токены лежат в IndexedDB на web и в Keychain/Keystore в native —
  за адаптером `shared/lib/platform/storage/secure-tokens`. Ротация и отзыв при
  logout/смене пароля ограничивают цену компрометации.
- Любой эндпоинт, читающий чужие данные (тренер → клиент), проверяет связь `trainer_clients` со статусом `active` на сервисном слое + тест на запрет доступа.
- Секреты — только через env (`.env` не коммитится, есть `.env.example`).
- **Как переменные попадают в бэкенд.** Приложение само `.env`-файлы **не читает**:
  ни `dotenv`, ни `--env-file` — `backend/src/config.ts` берёт только `process.env`.
  Положить `backend/.env` недостаточно, его никто не прочитает. Источники:
  - **dev** — `docker-compose.yml`, якорь `&env` на сервисах `workspace`/`backend`;
  - **prod** — `~/dopafit/.env.prod` на VPS (`env_file` в `deploy/docker-compose.prod.yml`),
    шаблон `deploy/.env.prod.example`;
  - `~/dopafit/.env` (шаблон `deploy/.env.example`) читает **сам compose** для
    интерполяции (домен, теги образа) — в контейнер приложения он не передаётся.

  Полный список переменных с дефолтами — `backend/.env.example` (справочник, все
  строки закомментированы). Фронтенд устроен иначе: `frontend/.env*` читает Vite и
  вшивает `VITE_*` в бандл при сборке, поэтому секретов там быть не может.
- **Сертификат БД.** TLS к Postgres включается непустым `DOPAFIT_DATABASE_SSL_ROOT_CERT`
  с путём **внутри контейнера** (`/certs/pg-root.crt`; том `./certs:/certs:ro` в
  prod-compose). Проверка строгая. Переменная libpq `PGSSLROOTCERT` драйвером `pg`
  не читается — значение берётся только из `DOPAFIT_*`.
- Auth-эндпоинты не раскрывают существование аккаунта (одинаковый ответ для известного/неизвестного контакта).
- Security-заголовки — `secureHeaders()` из Hono в `backend/src/http/app.ts`; HSTS включается только при `DOPAFIT_ENVIRONMENT=prod`.
- Лимит размера тела запроса (`DOPAFIT_MAX_REQUEST_BODY_BYTES`, по умолч. 2 МБ; медиа — `DOPAFIT_MAX_MEDIA_UPLOAD_BYTES`, 50 МБ) — middleware бэкенда; на проде дублируется в Caddy (`request_body max_size`).
- CI прогоняет `pnpm audit --prod --audit-level high` на каждом PR (backend и frontend).

### Чек-лист перед production-деплоем

Валидатор в `backend/src/config.ts` при `DOPAFIT_ENVIRONMENT=prod` **не даёт приложению
стартовать** с dev-дефолтами. Основные проверки:

- [ ] `DOPAFIT_JWT_SECRET` задан, не равен dev-дефолту и ≥32 символов (`openssl rand -hex 32`).
- [ ] `DOPAFIT_DATABASE_URL` задан явно (дефолт на dev-postgres в проде запрещён).
- [ ] `DOPAFIT_S3_SECRET_KEY` задан и не равен dev-значению `dopafit-minio`.
- [ ] `DOPAFIT_DEV_VERIFICATION_CODE` пуст, либо фиксированный код **осознанно** разрешён
  через `DOPAFIT_ALLOW_FIXED_VERIFICATION_CODE=true`. Тестовый стенд включает код `000000`
  этой парой переменных; при SMTP код должен быть пустым независимо от флага разрешения,
  и коды генерируются случайно, отправляются письмом и не логируются.
- [ ] `DOPAFIT_NOTIFICATION_PROVIDER=smtp`, host, порт 587/465, логин и пароль ящика заданы.
  `DOPAFIT_ALLOW_UNDELIVERED_NOTIFICATIONS=false`; true оставлен только для старого закрытого стенда.
- [ ] SmartCaptcha: серверный ключ, публичный ключ той же капчи и разрешённый домен заданы.
  Домен разрешён и в Яндексе; сервер проверяет `host` ответа. Подробнее — `docs/deploy.md`.

Остальное валидатор не проверяет — следим руками:

- [ ] `DOPAFIT_S3_ENDPOINT` / `DOPAFIT_S3_PUBLIC_ENDPOINT` / `DOPAFIT_S3_ACCESS_KEY` / `DOPAFIT_S3_BUCKET` — внешнее хранилище.
- [ ] `DOPAFIT_CORS_ORIGINS` — можно оставить пустым: PWA живёт на том же origin, что и API,
  кросс-доменных запросов нет. Записи нужны только native-сборкам (WebView-origin).
- [ ] `DOPAFIT_TRUST_PROXY=true` — иначе per-IP лимиты видят IP Caddy, а не клиента.
- [ ] HTTPS терминируется Caddy; лимит тела запроса (`request_body max_size`) выставлен.
- [ ] Шаблон полного набора переменных — `deploy/.env.prod.example`.

## 10. Нативные сборки (Capacitor) — вне текущего объёма

Сейчас продукт поставляется **только как PWA**. Нативные проекты `frontend/ios` и
`frontend/android` **удалены из репозитория** и добавлены в `frontend/.gitignore`:
это генерируемые артефакты, и хранить их, пока native-сборки не собираются, незачем.

Что **сохранено** как рабочая заготовка и продолжает поддерживаться:

- `@capacitor/*` в зависимостях и `frontend/capacitor.config.ts` (в т.ч. hardening
  `CAP_ENV=release` → `androidScheme: 'https'` без cleartext);
- платформенные адаптеры `frontend/src/shared/lib/platform/*` (camera, keyboard,
  network, push, storage, splash-screen, status-bar, …) — веб-реализации работают
  в PWA, нативные подключаются сами внутри WebView;
- скрипты `pnpm build:native` / `build:native-sim` / `build:native-android` и
  файлы `frontend/.env.native*`;
- `frontend/resources` для генерации иконок/сплэшей через `@capacitor/assets`.

**Восстановить платформы** (когда native-сборки вернутся в объём):

```sh
cd frontend
npx cap add ios          # macOS + Xcode
npx cap add android      # Android SDK + Java 21
```

Обе команды запускаются **на хосте**, не в Docker: iOS требует macOS + Xcode, Android —
Android SDK. Это единственное задокументированное исключение из правила «всё через
Docker»; линт, типы и тесты фронта в любом случае гоняются только через Docker
(`make fe-lint`, `make fe-test`).

### 10.1. Адрес API в native-сборке

В PWA адрес API не зашивается: фронт ходит на **свой origin** (`location.origin`, см.
`frontend/src/shared/config/env.ts`). В native WebView собственного origin нет, поэтому
абсолютный `VITE_API_URL` нужен **только** для native-режимов — под это и существуют три
режима сборки (`vite build --mode`, файлы `frontend/.env.native*`):

| Таргет | Скрипт | `VITE_API_URL` | Почему |
|---|---|---|---|
| iOS-симулятор | `pnpm build:native-sim` | `http://localhost:8000` | симулятор делит сеть с Mac |
| Android-эмулятор | `pnpm build:native-android` | `http://10.0.2.2:8000` | в эмуляторе хост = `10.0.2.2` |
| Реальное устройство | `pnpm build:native` | `http://<LAN-IP>:8000` | телефон видит Mac только по LAN |

Сам `.env.native` URL не содержит: для устройства копируется
`.env.native.local.example` → `.env.native.local` (gitignored) с LAN-IP хоста
(`ipconfig getifaddr en0`), для прода URL передаётся переменной окружения. Без URL сборка
падает на guard'е в `vite.config.ts` — молчаливый localhost-дефолт когда-то уехал в APK
как «вечный офлайн», и guard стоит именно от этого. `VITE_TARGET=native` во всех режимах
отключает service worker: в native кэширует сам WebView.

### 10.2. Справка на будущее: подпись и релизные артефакты

Ниже — детали, которые пригодятся **в момент возобновления native-сборок**. Сейчас они не
исполняются: ни `ios/`, ни `android/` в репозитории нет, платформы нужно сначала добавить
через `npx cap add` (§10).

- **Учётные записи:** Apple Developer Program ($99/год) для App Store, Google Play
  Console ($25 разово).
- **Hardening релиза:** `CAP_ENV=release npx cap sync` переключает `androidScheme` на
  `https` и убирает cleartext (логика в `capacitor.config.ts`); API задаётся прод-`VITE_API_URL`:
  `VITE_API_URL=https://<домен> pnpm build:native && CAP_ENV=release npx cap sync`.
- **Android keystore.** Подпись настраивается один раз: сгенерировать release-keystore и
  создать `android/keystore.properties` (`storeFile`/`storePassword`/`keyAlias`/`keyPassword`) —
  `app/build.gradle` подхватит его сам. Keystore и `keystore.properties` **в репо не
  коммитятся**. Без `keystore.properties` Gradle соберёт `app-release-unsigned.apk`,
  который не установится.
  ```sh
  keytool -genkeypair -v -keystore ~/dopafit-release.keystore -alias dopafit \
    -keyalg RSA -keysize 2048 -validity 10000
  ```
  Артефакты: `./gradlew bundleRelease` → `.aab` для Google Play;
  `./gradlew assembleRelease` → `.apk` для прямой раздачи (`adb install -r ...`).
- **Подпись iOS.** Личный Apple Team ID **не** коммитим: в `project.pbxproj` держим
  нейтральное `DEVELOPMENT_TEAM = "$(inherited)"`, реальный ID — в `ios/signing.xcconfig`
  (gitignored), подключённом из `ios/debug.xcconfig` через `#include?`.
  ⚠️ Выбор команды в панели Signing & Capabilities заставляет Xcode записать ID прямо в
  `project.pbxproj` — не трогать выпадашку Team. Релизный `.ipa` собирается Archive'ом:
  `npx cap open ios` → схема App + «Any iOS Device» → Product ▸ Archive ▸ Distribute App.
- **Отладка WebView.** Android — Chrome remote debugging
  (`adb forward tcp:9222 localabstract:webview_devtools_remote_$(adb shell pidof com.dopafit.app)`,
  затем `chrome://inspect`); iOS — Safari ▸ Develop ▸ Simulator.
  Скриншоты: `xcrun simctl io booted screenshot /tmp/s.png` / `adb exec-out screencap -p > /tmp/s.png`.
  Тёмная тема Android: `adb shell cmd uimode night yes|no`.

## 11. Запуск в браузере и на телефоне (всё через Docker)

Backend и фронт поднимаем **только через Docker** — никаких локальных `node`/`pnpm` на хосте.

### 11.1. Разработка на Mac (основной режим)

```sh
make up                              # postgres + minio + backend (:8000) + frontend (:5173)
make ps                              # убедиться, что контейнеры healthy
```

Открывай `http://localhost:5173`. Отдельно настраивать адрес API не нужно: фронт ходит на
свой же origin (`/api/...`), а dev-сервер Vite проксирует `/api` в `backend:8000`
(`server.proxy` в `vite.config.ts`). Отсюда же следует, что в вебе нет ни CORS-preflight'ов,
ни рассинхрона «страница на одном хосте, API на другом».

Работа против MSW-моков вместо реального API — `VITE_API_MOCK=true` (см. `frontend/.env.development`).

### 11.2. Просмотр UI на телефоне по LAN

Dev-сервер слушает `0.0.0.0:5173`, порт проброшен на хост, значит он виден телефону в той же
Wi-Fi. Узнать LAN-IP Mac: `ipconfig getifaddr en0`.

```sh
make dev-lan                         # пересоздаёт frontend-контейнер; печатает нужный URL
# LAN-IP берётся из en0; переопредели при необходимости: make dev-lan LAN=192.168.1.101
```

Открывай `http://<LAN-IP>:5173` на телефоне. API едет тем же origin'ом через прокси
Vite, поэтому «Офлайн»-баннера из-за неправильного адреса бэкенда быть не может.
Вернуться к обычному режиму: `make up`.

**Это не настоящая PWA.** В dev-режиме service worker выключен, а на `http://` по LAN-IP
браузер его и не зарегистрирует: SW и «Установить приложение» требуют secure context
(`https://` или `localhost`). Для проверки самой PWA — §11.3.

### 11.3. Проверка PWA (service worker + установка)

Локального HTTPS-контура с самоподписанными сертификатами больше нет — он и не нужен.
**PWA и API отдаются одним origin'ом** (`deploy/Caddyfile` → один upstream `app:8000` на весь
домен), поэтому mixed-content невозможен по построению, и проверять установку достаточно на
**развёрнутом стенде по HTTPS-домену** (§12): открыть домен на телефоне → Safari «Поделиться»
▸ «На экран „Домой“» / Chrome «Установить приложение». Ставить локальный CA на телефон не требуется.

Быстрая локальная проверка прод-бандла (на Mac, secure context `localhost`):

```sh
make fe-build                        # прод-бандл PWA (SW включён) → frontend/dist
docker compose run --rm -p 4173:4173 frontend pnpm preview --port 4173
```

**Android по USB** (secure context без сертификата): подключи телефон, Chrome на Mac →
`chrome://inspect` → **Port forwarding** → пробрось `4173 → localhost:4173` (или
`5173 → localhost:5173` для dev-сервера с live-reload). Телефон открывает
`http://localhost:4173` — origin `localhost` считается secure, SW и установка работают.
На iPhone проброса портов нет: для него — только §11.2 (просмотр UI) или HTTPS-стенд (§12).

## 12. Деплой тестового стенда (этап 15.1)

Тестовый MVP живёт на **одном домене**: Caddy отдаёт и PWA, и `/api/v1` с одного upstream'а,
поэтому фронт и API всегда same-origin. Полная инструкция — **`docs/deploy.md`** (первичная
настройка VPS/DNS/S3, сид каталога, smoke-проверка). Шпаргалка:

- **Деплой и обновление**: `DOPAFIT_VPS=user@<vps> make deploy` (обёртка над
  `deploy/deploy.sh`) — собирает **один образ** (Hono + собранная PWA) локально
  (linux/amd64, теги `latest` + git-SHA), доставляет по SSH, перезапускает стек;
  миграции выполняет one-shot сервис `migrate` до старта app. `VITE_API_URL` при сборке
  не нужен — PWA обращается к своему origin.
- **Конфигурация**: `deploy/docker-compose.prod.yml` + `deploy/Caddyfile`; секреты —
  в `~/dopafit/.env.prod` на VPS (шаблон `deploy/.env.prod.example`, в git не попадает);
  домен — `DOPAFIT_APP_DOMAIN` в `~/dopafit/.env` (см. `docs/deploy.md`).
- **Фоновые задачи**: планировщик работает внутри процесса app — отдельного сервиса нет
  (`DOPAFIT_SCHEDULER_INTERVAL_SECONDS`, `DOPAFIT_SCHEDULER_STALE_RUN_HOURS`).
- **Коды входа**: реальной почты нет — на стенде фиксированный код `000000` (пара env-переменных, см. `docs/deploy.md`).
- **Premium**: на период тестового запуска подключается бесплатно по кнопке, без платежей — `docs/deploy.md`.
- **Откат**: `DOPAFIT_IMAGE_TAG=<sha> docker compose -f docker-compose.prod.yml up -d` на VPS (sha-теги остаются).
- CI проверяет `deploy/**` (compose+Caddyfile). На PR сборка prod-образа запускается
  по запросу; на push в `main` образ автоматически собирается, публикуется и разворачивается.

SMTP, Web Push, SmartCaptcha и registry+CI/CD-доставка реализованы; настройки внешних
сервисов задаются окружением. Реальные платежи и наблюдаемость остаются отдельными работами.
