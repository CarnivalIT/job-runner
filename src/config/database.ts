import mssql from 'mssql';
import { ENV } from './env.js';

const commonConfig: Partial<mssql.config> = {
  connectionTimeout: 30000,
  requestTimeout: 90000,
  options: {
    encrypt: false,
  },
};

export type DatabaseTarget = 'CTRL' | 'COL' | 'AX' | 'SQL';

export function getDatabaseConfig(target: DatabaseTarget): mssql.config {
  switch (target) {
    case 'CTRL':
      return {
        ...commonConfig,
        user: ENV.DB.USER,
        password: ENV.DB.PASSWORD,
        server: ENV.DB.SERVER_211,
        database: ENV.DB.DATABASE_CTRL,
      };
    case 'COL':
      return {
        ...commonConfig,
        user: ENV.DB.USER,
        password: ENV.DB.PASSWORD,
        server: ENV.DB.SERVER_211,
        database: ENV.DB.DATABASE_COL,
      };
    case 'AX':
      return {
        ...commonConfig,
        user: ENV.DB.USER,
        password: ENV.DB.PASSWORD,
        server: ENV.DB.SERVER_AX,
        database: ENV.DB.DATABASE_AX,
      };
    case 'SQL':
      return {
        ...commonConfig,
        user: ENV.DB.USER,
        password: ENV.DB.PASSWORD,
        server: ENV.DB.SERVER_SQL,
        database: ENV.DB.DATABASE_SQL,
      };
  }
}

/**
 * Creates and connects a new MSSQL Connection Pool for a given database target.
 * Caller is responsible for closing the pool when done.
 */
export async function createConnectionPool(target: DatabaseTarget): Promise<mssql.ConnectionPool> {
  const config = getDatabaseConfig(target);
  const pool = new mssql.ConnectionPool(config);
  await pool.connect();
  return pool;
}
