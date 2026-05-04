# Linka

Linka - веб-приложение для общения с авторизацией, профилями пользователей, приватными чатами, групповыми чатами, каналами, сообщениями в реальном времени и загрузкой медиафайлов.

Проект разделен на две части:

- `apps/api` - backend на NestJS, Prisma и PostgreSQL.
- `apps/web` - frontend на Next.js, React и Tailwind CSS.

## Возможности

- Регистрация и вход по email или username.
- JWT-авторизация: access token и refresh token в httpOnly cookie.
- Профиль пользователя: имя, username, bio, emoji, аватар.
- Настройки пользователя: приватность, звуки, превью сообщений, read receipts.
- Поиск пользователей.
- Приватные чаты, группы и каналы.
- Сообщения через Socket.IO в реальном времени.
- Статусы доставки и прочтения сообщений.
- Индикатор набора сообщения.
- Загрузка аватаров и медиа в сообщениях.

## Технологии

Backend:

- Node.js
- NestJS
- Prisma ORM
- PostgreSQL
- Socket.IO
- JWT
- Argon2
- Multer

Frontend:

- Next.js
- React
- TypeScript
- Tailwind CSS
- Zustand
- Socket.IO Client
- Framer Motion
- Lucide React

## Структура проекта

```text
.
├── apps
│   ├── api
│   │   ├── prisma
│   │   │   ├── migrations
│   │   │   └── schema.prisma
│   │   └── src
│   │       ├── auth
│   │       ├── chats
│   │       ├── messages
│   │       ├── prisma
│   │       └── users
│   └── web
│       ├── public
│       └── src
│           ├── app
│           ├── lib
│           ├── providers
│           └── store
├── package.json
└── package-lock.json
```

## Требования

- Node.js 20 или выше.
- npm.
- PostgreSQL.

## Переменные окружения

Backend читает переменные из `apps/api/.env`.

Создайте файл:

```bash
cd apps/api
cp .env.example .env
```

Если `.env.example` отсутствует, создайте `apps/api/.env` вручную:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/linka"
PORT=3002
WEB_URL="http://localhost:3000"
JWT_ACCESS_SECRET="local-access-secret"
JWT_REFRESH_SECRET="local-refresh-secret"
```

Описание переменных:

- `DATABASE_URL` - строка подключения к PostgreSQL.
- `PORT` - порт backend-сервера. По умолчанию используется `3002`.
- `WEB_URL` или `FRONTEND_URL` - адрес frontend для CORS. По умолчанию `http://localhost:3000`.
- `JWT_ACCESS_SECRET` - секрет для access token.
- `JWT_REFRESH_SECRET` - секрет для refresh token.
- `JWT_ACCESS_EXPIRES_IN` - время жизни access token. Необязательно, по умолчанию `15m`.
- `JWT_REFRESH_EXPIRES_IN` - время жизни refresh token. Необязательно, по умолчанию `30d`.
- `JWT_REFRESH_TTL_MS` - срок хранения refresh token в базе в миллисекундах. Необязательно.

Frontend может читать переменные из `apps/web/.env.local`.

Создайте файл:

```bash
cd apps/web
cp .env.example .env.local
```

Для локального запуска достаточно такого значения:

```env
NEXT_PUBLIC_API_URL="http://localhost:3002"
```

Если переменная не задана, frontend сам использует `http://localhost:3002`.

## Подготовка базы данных

Создайте PostgreSQL-базу, например `linka`.

После настройки `DATABASE_URL` выполните миграции и сгенерируйте Prisma Client:

```bash
cd apps/api
npm install
npx prisma migrate deploy
npm run prisma:generate
```

Для разработки вместо `migrate deploy` можно использовать:

```bash
npx prisma migrate dev
```

Проверить Prisma-схему:

```bash
npm run prisma:validate
```

## Установка зависимостей

Установите зависимости отдельно для backend и frontend:

```bash
cd apps/api
npm install
```

```bash
cd apps/web
npm install
```

## Запуск backend на localhost

Backend запускается на `http://localhost:3002`.

```bash
cd apps/api
npm run build
node dist/main.js
```

Перед первым запуском убедитесь, что:

- PostgreSQL запущен.
- `apps/api/.env` содержит правильный `DATABASE_URL`.
- Миграции Prisma применены.

После запуска API будет принимать HTTP-запросы и Socket.IO-подключения на том же порту.

Основные HTTP-маршруты:

- `POST /auth/register` - регистрация.
- `POST /auth/login` - вход.
- `POST /auth/refresh` - обновление access token.
- `POST /auth/logout` - выход.
- `GET /auth/me` - текущий пользователь.
- `GET /users/me` - профиль текущего пользователя.
- `PATCH /users/me` - обновление профиля.
- `GET /users/search?q=...` - поиск пользователей.
- `GET /chats` - список чатов.
- `POST /chats/private` - создать приватный чат.
- `POST /chats/group` - создать группу.
- `POST /chats/channel` - создать канал.
- `GET /chats/:chatId/messages` - сообщения чата.
- `POST /chats/:chatId/media` - загрузить медиа в чат.

## Запуск frontend на localhost

Frontend запускается на `http://localhost:3000`.

```bash
cd apps/web
npm run dev
```

Откройте в браузере:

```text
http://localhost:3000
```

Главная страница перенаправляет на `/login`.

## Полный локальный запуск

В первом терминале запустите PostgreSQL и backend:

```bash
cd apps/api
npm install
npx prisma migrate deploy
npm run prisma:generate
npm run build
node dist/main.js
```

Во втором терминале запустите frontend:

```bash
cd apps/web
npm install
npm run dev
```

После этого приложение будет доступно на:

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:3002`

## Сборка и проверки

Backend:

```bash
cd apps/api
npm run build
npm run prisma:validate
```

Frontend:

```bash
cd apps/web
npm run build
npm run typecheck
```

## Загрузка файлов

Backend сохраняет загруженные файлы в `apps/api/uploads`:

- `uploads/avatars` - аватары пользователей.
- `uploads/messages` - медиафайлы сообщений.

Статика раздается по URL с префиксом `/uploads`, например:

```text
http://localhost:3002/uploads/avatars/file.jpg
```

## Примечания для разработки

- Backend использует CORS с адресом из `WEB_URL` или `FRONTEND_URL`.
- Refresh token хранится в httpOnly cookie `refreshToken` с путем `/auth`.
- Access token хранится на frontend в Zustand store и передается в `Authorization: Bearer ...`.
- Socket.IO подключается к `NEXT_PUBLIC_API_URL` и передает access token через `auth.accessToken`.
- После изменения Prisma-схемы нужно создать миграцию и обновить Prisma Client:

```bash
cd apps/api
npx prisma migrate dev
npm run prisma:generate
```
