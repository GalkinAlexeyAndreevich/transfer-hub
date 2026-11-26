## Project setup

### Install dependencies

```bash
$ npm install
```

### Configure environment variables

Copy `.env.example` to `.env`.

Generate a JWT secret:

```bash
node -e "console.log('JWT_SECRET='+require('node:crypto').randomBytes(32).toString('hex'))"
```

Paste the generated line into `.env`, replacing `JWT_SECRET`.

### Configure MinIO

Docker Compose pulls a MinIO Community Edition image published by Lithus. [Image release](https://github.com/golithus/minio-builds/releases/tag/RELEASE.2025-10-15T17-29-55Z)

Set `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY` in `.env`. Use the same values to sign into the local MinIO console. Generate a secret with the following command and save it to `S3_SECRET_ACCESS_KEY`.

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

`S3_ENDPOINT=http://localhost:9000` is the S3 API address used by the application. The browser console is available at `http://localhost:9001`. The bucket name comes from `S3_BUCKET`.

### Start PostgreSQL and MinIO

```bash
$ docker compose up -d
```

Data is stored in Docker volumes.

Create the configured bucket after MinIO starts. This command also works when the bucket already exists.

```bash
npm run storage:init
```

### Apply migrations

```bash
npx kysely migrate latest
```
### Start the application

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

### Swagger

После запуска приложения открой [Swagger UI](http://localhost:3000/docs).
Если в `.env` указан другой `PORT`, замени `3000` в адресе на его значение.

Для проверки защищённых маршрутов:

1. Зарегистрируйся через `POST /auth/register` или войди через `POST /auth/login`.
2. Скопируй `access_token` из ответа.
3. Нажми **Authorize** в Swagger и вставь токен без префикса `Bearer`.

## Run tests

```bash
# unit tests
$ npm run test

# integration tests (PostgreSQL must be running)
$ npm run test:integration

# test coverage
$ npm run test:cov
```

Интеграционные тесты создают и удаляют отдельную временную схему в БД из `DATABASE_URL`.
Проверки загрузки аватаров подменяют файловое хранилище, поэтому для них достаточно PostgreSQL и заполненных переменных S3.

## Avatar upload

Авторизованный пользователь загружает собственный аватар через `POST /users/me/avatar`. Передай файл в поле `file` формы `multipart/form-data`. Поддерживаются JPEG и PNG размером до 10 МиБ, то есть 10 485 760 байт включительно.

```bash
curl -X POST http://localhost:3000/users/me/avatar \
  -H "Authorization: Bearer ACCESS_TOKEN" \
  -F "file=@avatar.png"
```

Fastify `FileInterceptor` ограничивает размер файла при чтении потока. `AvatarFilePipe` повторно проверяет размер буфера и определяет формат по содержимому через `FileTypeValidator` и `file-type`. Тип объекта и расширение ключа выбираются по результату этой проверки.

Ответ содержит `id`, `avatarKey` и `uploadedAt`. В PostgreSQL таблица `avatars` хранит владельца, ключ объекта вида `avatars/123/UUID.png`, дату загрузки и дату удаления. Профиль и список пользователей возвращают активные аватары в массиве `avatars`, начиная с последнего загруженного.

Лимит на пользователя составляет 5 активных аватаров. При достижении лимита загрузка возвращает `409`. Чтобы освободить место, вызови `DELETE /users/me/avatars/:avatarId` со своим токеном. Успешное удаление возвращает `204`, скрывает запись из массива `avatars` и оставляет файл в MinIO. Для чужого, уже удалённого или отсутствующего аватара API возвращает `404`.

Ошибка записи в БД вызывает очистку новой загрузки. Ошибка очистки записывается в лог с событием `avatar.cleanup_failed`.

Для проверки открой `http://localhost:9001`, войди со значениями `S3_ACCESS_KEY_ID` и `S3_SECRET_ACCESS_KEY` из локального `.env`, открой bucket из `S3_BUCKET` и найди объект по возвращённому ключу.

## PostgreSQL commands

Connect using the default credentials:

```bash
docker compose exec postgres psql -U root -d transfer_hub
```
