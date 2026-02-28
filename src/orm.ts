import { MikroORM, type Options } from '@mikro-orm/core';
import { PostgreSqlDriver } from '@mikro-orm/postgresql';
import { BetterSqliteDriver } from '@mikro-orm/better-sqlite';
import { allSchemas } from './domain/schemas/index.js';

const DRIVER_MAP = {
  postgres: PostgreSqlDriver,
  sqlite: BetterSqliteDriver,
} as const;

type DriverType = keyof typeof DRIVER_MAP;

export async function initOrm(overrides?: Partial<Options>): Promise<MikroORM> {
  const driverType = (process.env.DB_DRIVER ?? 'postgres') as DriverType;
  const driver = DRIVER_MAP[driverType] ?? PostgreSqlDriver;

  const config: Options = {
    driver,
    clientUrl:
      process.env.DATABASE_URL ?? 'postgres://loom:loom_dev_password@localhost:5432/loom',
    entities: allSchemas,
    debug: process.env.NODE_ENV === 'development',
    ...overrides,
  };

  const instance = await MikroORM.init(config);
  orm = instance;
  return instance;
}

// eslint-disable-next-line prefer-const
export let orm: MikroORM;
