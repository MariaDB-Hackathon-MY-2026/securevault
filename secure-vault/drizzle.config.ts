import { defineConfig } from 'drizzle-kit';

const DATABASE_URL = process.env.DATABASE_URL;
if(!DATABASE_URL) throw new Error('DATABASE_URL is required');

export default defineConfig({
    dialect: 'mysql',
    schema: './src/Schemas/*',
    out: './drizzle',
    dbCredentials: {
        url: DATABASE_URL,
    }
})