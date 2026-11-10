# DopaFit

Фитнес-PWA для клиентов и тренеров: тренировки, антропометрия, аналитика, взаимодействие тренер-клиент. Offline-first: максимум функций работает без сети и синхронизируется при подключении.

## Быстрый старт

Нужны только Docker и make:

```sh
make deps          # установка зависимостей (один раз и после смены зависимостей)
make up            # postgres, minio, API, frontend
make be-migrate    # применить миграции
make be-seed       # каталог упражнений + демо-аккаунты
```

| Сервис | URL |
|---|---|
| Frontend (dev, hot-reload) | <http://localhost:5173> |
| API | <http://localhost:8000/api/v1> |
| MinIO console | <http://localhost:9001> |

Контракт API — `contracts/openapi.json` (генерируется из кода, руками не правится).

Демо-аккаунты (`make be-seed`, только вне production): клиент `client@dopafit.dev`,
тренер `trainer@dopafit.dev`, пароль `Dopafit1Demo`. Код подтверждения в dev — `000000`.

## Документация

- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) — правила разработки (git-процесс, контракты, DoD). **Читать первым.**
- [docs/architecture.md](docs/architecture.md) — архитектура frontend и backend.
- [docs/TESTING.md](docs/TESTING.md) — уровни тестов, контур e2e, фикстуры и известные дефекты.
- [docs/e2e-spec.md](docs/e2e-spec.md) — каталог браузерных проверок.
- [docs/techdebt.md](docs/techdebt.md) — техдолг backend и отложенные этапы.
- [docs/deploy.md](docs/deploy.md) — развёртывание стенда.

## Структура

```text
contracts/openapi.json   # контракт API — источник правды
backend/                 # Hono + Drizzle + TypeScript
frontend/                # React + React Router (PWA, Capacitor для native)
e2e/                     # браузерные тесты (Playwright в Docker)
docs/                    # документация и спецификация
deploy/                  # прод-стек: Caddy + один образ приложения
```
# dopafit
