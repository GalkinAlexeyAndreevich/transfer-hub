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

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## PostgreSQL commands

Connect using the default credentials:

```bash
docker compose exec postgres psql -U root -d transfer_hub
```
