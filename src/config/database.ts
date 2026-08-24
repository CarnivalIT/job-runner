import mssql from 'mssql';
import { ENV } from './env.js';

const commonConfig: Partial<mssql.config> = {
  connectionTimeout: 30000,
  requestTimeout: 90000,
  options: {
    encrypt: false,
  },
};

export type DatabaseTarget = 'CTRLINVENT';

export function getDatabaseConfig(target: DatabaseTarget): mssql.config {
  switch (target) {
    case 'CTRLINVENT':
      return {
        ...commonConfig,
        user: ENV.DB.CTRL_DB_USER,
        password: ENV.DB.CTRL_DB_PASSWORD,
        server: ENV.DB.CTRL_DB_SERVER,
        database: ENV.DB.CTRL_DB_DATABASE,
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
