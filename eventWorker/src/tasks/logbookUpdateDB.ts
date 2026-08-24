/* eslint-disable no-console */
/**
 * INTERNAL EXTRACTION SCRIPT (THE COURIER)
 *
 * Required Dependencies:
 * - npm install mssql axios dotenv
 * - npm install --save-dev @types/mssql @types/node
 *
 * Execution:
 * - npx ts-node scripts/internal-extraction.ts
 */

import mssql from 'mssql';
import axios from 'axios';
import 'dotenv/config';

// --- Configuration ---

const commonConfig = {
  connectionTimeout: 30000,
  requestTimeout: 90000,
  options: {
    encrypt: false,
  }
};

// AX ERP Server Configuration (10.1.1.212)
const dbConfigAX = {
  ...commonConfig,
  user: process.env.DB_USER || 'user',
  password: process.env.DB_PASSWORD || 'password',
  server: process.env.DB_SERVER_AX || 'server',
  database: process.env.DB_DATABASE_AX || 'database',
};

// Local SQL Server Configuration (170.1.1.10)
const dbConfigSQL = {
  ...commonConfig,
  user: process.env.DB_USER || 'user',
  password: process.env.DB_PASSWORD || 'password',
  server: process.env.DB_SERVER_SQL || 'server',
  database: process.env.DB_DATABASE_SQL || 'database',
};

const SYNC_CONFIG = {
  baseUrl: process.env.SYNC_API_URL || `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/api/sync`,
  apiKey: process.env.SYNC_API_KEY || 'your-sync-api-key',
  batchSize: 2000,
};

// --- SQL Queries ---

const QUERIES = {
  // AX ERP (CTRLINVENT)
  // WHERE a.FechaCreacion >= CAST(GETDATE() AS DATE)
  //   AND a.FechaCreacion < DATEADD(day, 1, CAST(GETDATE() AS DATE))
  // ORDER BY a.FechaCreacion, a.Cliente, a.OrdenVenta, a.Factura
  ORDERS: `
        SELECT
            a.OrdenVenta,
            a.NoCliente,
            a.Cliente,
            a.CantidadPzas,
            a.FechaCreacion,
            a.OrdenCliente,
            b.OEI_Id,
            b.OEI_Origin,
            a.Factura,
            c.Fecha_Facturacion
        FROM ccvw_OVS a
        INNER JOIN (
            SELECT
                OrdenVenta,
                MIN(FechaCreacionOEI) AS FechaCreacionOEI,
                OEI_Id,
                OEI_Origin
            FROM ccvw_OEIOVS
            GROUP BY OrdenVenta, OEI_Id, OEI_Origin
        ) b ON a.OrdenVenta = b.OrdenVenta
        LEFT JOIN Facturas_Cobranza_Coleccion AS c ON a.Factura = c.NoFactura
    `,
  LOGISTICS: `
        SELECT
            NoFactura,
            Piezas,
            EstatusEnvio
        FROM Facturas_Cobranza_Coleccion
    `,
  // SQL Server (SeguimientoPedidos)
  ORDER_DETAIL: `
        SELECT
            [OrdenEnvio],
            [Estilo],
            [Color],
            [Talla],
            [Copa],
            [Piezas]
        FROM [SeguimientoPedidos].[dbo].[DetalleOrdenEnvio]
    `,
  PACKING_PROGRESS: `
        SELECT
            OrdenEnvio,
            Operacion,
            SUM(Termino) AS Piezas
        FROM [SeguimientoPedidos].[dbo].[Bitacora]
        GROUP BY OrdenEnvio, Operacion
    `
};

// --- Types ---

interface SyncResult {
  success: boolean;
  endpoint: string;
  count: number;
  error?: string;
}

interface ExtractedOrder {
  OrdenVenta: string;
  NoCliente: string;
  Cliente: string;
  CantidadPzas: number;
  FechaCreacion: Date;
  OrdenCliente: string;
  OEI_Id?: string | null;
  OEI_Origin?: string | null;
  Factura?: string | null;
  Fecha_Facturacion?: Date | null;
}

// --- Helper Functions ---

/**
 * Splits an array into smaller batches
 */
const chunkArray = <T>(array: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
};

/**
 * Generic function to send data to the Sync API in batches
 */
const pushToApi = async (endpoint: string, data: unknown[]): Promise<SyncResult> => {
  const url = `${SYNC_CONFIG.baseUrl}${endpoint}`;
  const batches = chunkArray(data, SYNC_CONFIG.batchSize);

  console.log(`[Push] Sending ${data.length} records to ${endpoint} in ${batches.length} batches...`);

  try {
    for (let i = 0; i < batches.length; i++) {
      await axios.post(url, batches[i], {
        headers: {
          'X-SYNC-API-KEY': SYNC_CONFIG.apiKey,
          'Content-Type': 'application/json'
        }
      });
      console.log(`  - Batch ${i + 1}/${batches.length} sent successfully.`);
    }
    return { success: true, endpoint, count: data.length };
  } catch (error: unknown) {
    const errorMsg = axios.isAxiosError(error)
      ? error.response?.data?.error || error.message
      : error instanceof Error
        ? error.message
        : String(error);
    console.error(`[Error] Failed to push to ${endpoint}:`, errorMsg);
    return { success: false, endpoint, count: 0, error: errorMsg };
  }
};

/**
 * Connects to DB, executes query, and closes connection
 */
const executeQuery = async (config: mssql.config, query: string): Promise<unknown[]> => {
  let pool;
  try {
    console.log(`[DB] Connecting to ${config.server}/${config.database}...`);
    pool = await mssql.connect(config);
    const result = await pool.request().query(query);
    return result.recordset;
  } catch (err) {
    console.error(`[Database Error] on ${config.server}:`, err);
    throw err;
  } finally {
    if (pool) await pool.close();
  }
};

// --- Extraction Functions ---

const extractOrders = async (): Promise<{ result: SyncResult; orders: ExtractedOrder[] }> => {
  console.log('[Extract] Starting Orders extraction (AX)...');
  const data = (await executeQuery(dbConfigAX, QUERIES.ORDERS)) as ExtractedOrder[];
  const result = await pushToApi('/orders', data);
  return { result, orders: data };
};

const extractLogistics = async (): Promise<SyncResult> => {
  console.log('[Extract] Starting Logistics extraction (AX)...');
  const data = await executeQuery(dbConfigAX, QUERIES.LOGISTICS);
  return await pushToApi('/logistics', data);
};

const extractOrderDetail = async (oeiIds: string[]): Promise<SyncResult> => {
  console.log('[Extract] Starting Order Detail extraction (SQL Server)...');

  if (oeiIds.length === 0) {
    console.log('  - No order IDs found. Skipping Order Detail extraction.');
    return { success: true, endpoint: '/order-detail', count: 0 };
  }

  // Chunk oeiIds into batches of 1000 to avoid SQL Server's 2100 parameters limit
  const batches = chunkArray(oeiIds, 1000);
  let allRecords: any[] = [];

  let pool;
  try {
    console.log(`[DB] Connecting to ${dbConfigSQL.server}/${dbConfigSQL.database}...`);
    pool = await mssql.connect(dbConfigSQL);

    for (let b = 0; b < batches.length; b++) {
      const batch = batches[b];
      const request = pool.request();

      batch.forEach((id, index) => {
        request.input(`id${index}`, id);
      });

      const query = `
          SELECT
              [OrdenEnvio],
              [Estilo],
              [Color],
              [Talla],
              [Copa],
              [Piezas]
          FROM [SeguimientoPedidos].[dbo].[DetalleOrdenEnvio]
          WHERE [OrdenEnvio] IN (${batch.map((_, index) => `@id${index}`).join(', ')})
      `;

      const result = await request.query(query);
      allRecords = allRecords.concat(result.recordset);
    }

    return await pushToApi('/order-detail', allRecords);
  } catch (err) {
    console.error(`[Database Error] on ${dbConfigSQL.server}:`, err);
    throw err;
  } finally {
    if (pool) await pool.close();
  }
};

const extractOrderStatus = async (salesOrderIds: string[]): Promise<SyncResult> => {
  console.log('[Extract] Starting Order Status extraction (AX)...');

  if (salesOrderIds.length === 0) {
    console.log('  - No order IDs found. Skipping Order Status extraction.');
    return { success: true, endpoint: '/order-status', count: 0 };
  }

  // Chunk salesOrderIds into batches of 1000 to avoid SQL Server's 2100 parameters limit
  const batches = chunkArray(salesOrderIds, 1000);
  let allRecords: any[] = [];

  let pool;
  try {
    console.log(`[DB] Connecting to ${dbConfigAX.server}/${dbConfigAX.database}...`);
    pool = await mssql.connect(dbConfigAX);

    for (let b = 0; b < batches.length; b++) {
      const batch = batches[b];
      const request = pool.request();

      batch.forEach((id, index) => {
        request.input(`id${index}`, id);
      });

      const query = `
          SELECT
              [SALESID] AS [OrdenVenta],
              [SALESSTATUS] AS [StatusOrder]
          FROM [ColeccionIntima].[dbo].[SALESTABLE]
          WHERE [SALESID] IN (${batch.map((_, index) => `@id${index}`).join(', ')})
      `;

      const result = await request.query(query);
      allRecords = allRecords.concat(result.recordset);
    }

    return await pushToApi('/order-status', allRecords);
  } catch (err) {
    console.error(`[Database Error] on ${dbConfigAX.server}:`, err);
    throw err;
  } finally {
    if (pool) await pool.close();
  }
};

const extractPackingProgress = async (): Promise<SyncResult> => {
  console.log('[Extract] Starting Packing Progress extraction (SQL Server)...');
  const data = await executeQuery(dbConfigSQL, QUERIES.PACKING_PROGRESS);
  return await pushToApi('/packing-progress', data);
};

// --- Main Runner ---

/**
 * Orchestrates the full extraction and sync process.
 * This function is the primary entry point for the cron job.
 */
const runExtraction = async () => {
  console.log('--- STARTING INTERNAL EXTRACTION PROCESS ---');
  console.log(`Timestamp: ${new Date().toISOString()}`);

  const results: SyncResult[] = [];

  try {
    // 1. Sync Orders (AX)
    const { result: ordersResult, orders } = await extractOrders();
    results.push(ordersResult);

    // Extract unique OEI IDs (using OEI_Id, fallback to OEI_Origin)
    const oeiIds = Array.from(
      new Set(
        orders
          .map((order) => order.OEI_Id || order.OEI_Origin)
          .filter((id): id is string => typeof id === 'string' && id.trim() !== '')
      )
    );

    // Extract unique Sales Order (OV) IDs
    const salesOrderIds = Array.from(
      new Set(
        orders
          .map((order) => order.OrdenVenta)
          .filter((id): id is string => typeof id === 'string' && id.trim() !== '')
      )
    );

    // 2. Sync Logistics (AX)
    // results.push(await extractLogistics());

    // 3. Sync Order Details (SQL Server)
    results.push(await extractOrderDetail(oeiIds));

    // 4. Sync Order Status (AX)
    results.push(await extractOrderStatus(salesOrderIds));

    // 5. Sync Packing/Warehouse Progress (SQL Server)
    // results.push(await extractPackingProgress());

    console.log('\n--- SYNC SUMMARY ---');
    results.forEach(res => {
      const status = res.success ? 'SUCCESS' : 'FAILED';
      console.log(`${res.endpoint}: ${status} (${res.count} records) ${res.error ? `- Error: ${res.error}` : ''}`);
    });

  } catch (error) {
    console.error('[Critical Error] Extraction process interrupted:', error);
  } finally {
    console.log('\n--- EXTRACTION PROCESS FINISHED ---');
  }
};

export default runExtraction;

// Execute if run directly
runExtraction().catch(err => {
  console.error('[Fatal Error] Script failed:', err);
  process.exit(1);
});
