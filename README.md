## Project setup

### Install dependencies

```bash
$ npm install
```

### Configure environment variables

Copy `.env.example` to `.env`.

Generate two independent JWT secrets:

```bash
node -e "const {randomBytes}=require('node:crypto'); for (const name of ['JWT_SECRET','JWT_REFRESH_SECRET']) console.log(name+'='+randomBytes(32).toString('hex'))"
```

Paste the generated lines into `.env`, replacing `JWT_SECRET` and
`JWT_REFRESH_SECRET`. The jwt in .env and .env.example should be different.

### Start PostgreSQL

```bash
$ docker compose up
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

## PostgreSQL commands

Connect using the default credentials:

```bash
docker compose exec postgres psql -U root -d transfer_hub
```
