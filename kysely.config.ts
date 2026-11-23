import 'dotenv/config';
import { defineConfig } from 'kysely-ctl';
import { Pool } from 'pg';
import databaseConfig from './src/config/database.config';

const { url } = databaseConfig();

export default defineConfig({
  dialect: 'pg',

  dialectConfig: {
    pool: new Pool({
      connectionString: url,
    }),
  },

  migrations: {
    migrationFolder: './src/database/migrations',
  },
});
