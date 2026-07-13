import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';
import { validateEnv } from '../config/env.validation';
import { buildDataSourceOptions } from './data-source.options';

// Entry point for the TypeORM CLI (migration:generate/run/revert). Runs outside Nest's DI, so it
// loads and validates env the same way `ConfigModule` does (fail-fast, AC-002) rather than
// duplicating a second, looser config path.
dotenv.config();
const env = validateEnv(process.env);

export const AppDataSource = new DataSource(buildDataSourceOptions(env));
