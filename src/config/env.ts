import 'dotenv/config';

export const ENV = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',

  // Database Credentials
  DB: {
    USER: process.env.DB_USER || 'root',
    PASSWORD: process.env.DB_PASSWORD || '',

    // Server 211 (Inventory / Dimensions)
    SERVER_211: process.env.DB_SERVER_211 || 'localhost',
    DATABASE_CTRL: process.env.DB_DATABASE_CTRL || 'test',
    DATABASE_COL: process.env.DB_DATABASE_COL || 'test',

    // Dynamics AX Server
    SERVER_AX: process.env.DB_SERVER_AX || 'server',
    DATABASE_AX: process.env.DB_DATABASE_AX || 'database',

    // Local Tracking Server
    SERVER_SQL: process.env.DB_SERVER_SQL || 'server',
    DATABASE_SQL: process.env.DB_DATABASE_SQL || 'database',
  },

  // API Endpoints
  API: {
    STYLES_BASE_URL: process.env.STYLES_API_BASE_URL || 'https://carnivaldevelop.ddns.net/stylesInformation/api',
    
    LIVEDASH_SOURCE_URL: process.env.LIVEDASH_SOURCE_URL || 'http://170.1.1.10:8012',
    LIVEDASH_TARGET_URL: process.env.LIVEDASH_TARGET_URL || 'http://localhost:3000/api/livedash',
    LIVEDASH_SYNC_KEY: process.env.LIVEDASH_SYNC_KEY || 'livedash-secret-key',

    SYNC_BASE_URL: process.env.SYNC_API_URL || `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/api/sync`,
    SYNC_API_KEY: process.env.SYNC_API_KEY || 'your-sync-api-key',
  }
} as const;
