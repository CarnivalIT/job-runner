import axios from 'axios';
import mssql from 'mssql';
import { createConnectionPool } from '../../config/database.js';
import { ENV } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import type { SyncResult, ExtractedOrder } from './types.js';

const BATCH_SIZE = 2000;
const PARAMETER_CHUNK_SIZE = 1000;

const QUERIES = {
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
  `,
};

function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

async function pushToApi(endpoint: string, data: unknown[]): Promise<SyncResult> {
  const url = `${ENV.API.SYNC_BASE_URL}${endpoint}`;
  const batches = chunkArray(data, BATCH_SIZE);

  logger.info(`[logbookUpdateDB] Sending ${data.length} records to ${endpoint} in ${batches.length} batches...`);

  try {
    for (let i = 0; i < batches.length; i++) {
      await axios.post(url, batches[i], {
        headers: {
          'X-SYNC-API-KEY': ENV.API.SYNC_API_KEY,
          'Content-Type': 'application/json',
        },
      });
      logger.info(`  - Batch ${i + 1}/${batches.length} sent successfully to ${endpoint}.`);
    }
    return { success: true, endpoint, count: data.length };
  } catch (error: unknown) {
    const errorMsg = axios.isAxiosError(error)
      ? error.response?.data?.error || error.message
      : error instanceof Error
        ? error.message
        : String(error);
    logger.error(`[logbookUpdateDB] Failed to push to ${endpoint}:`, errorMsg);
    return { success: false, endpoint, count: 0, error: errorMsg };
  }
}

async function extractOrders(): Promise<{ result: SyncResult; orders: ExtractedOrder[] }> {
  logger.info('[logbookUpdateDB] Extracting Orders (AX)...');
  let pool: mssql.ConnectionPool | undefined;
  try {
    pool = await createConnectionPool('CTRLINVENT');
    const result = await pool.request().query(QUERIES.ORDERS);
    const data = result.recordset as ExtractedOrder[];
    const syncResult = await pushToApi('/orders', data);
    return { result: syncResult, orders: data };
  } finally {
    if (pool) await pool.close();
  }
}

async function extractOrderDetail(oeiIds: string[]): Promise<SyncResult> {
  logger.info('[logbookUpdateDB] Extracting Order Details (SQL Server)...');

  if (oeiIds.length === 0) {
    logger.info('  - No order IDs found. Skipping Order Detail extraction.');
    return { success: true, endpoint: '/order-detail', count: 0 };
  }

  const batches = chunkArray(oeiIds, PARAMETER_CHUNK_SIZE);
  let allRecords: unknown[] = [];

  let pool: mssql.ConnectionPool | undefined;
  try {
    pool = await createConnectionPool('CTRLINVENT');

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
  } finally {
    if (pool) await pool.close();
  }
}

async function extractOrderStatus(salesOrderIds: string[]): Promise<SyncResult> {
  logger.info('[logbookUpdateDB] Extracting Order Status (AX)...');

  if (salesOrderIds.length === 0) {
    logger.info('  - No order IDs found. Skipping Order Status extraction.');
    return { success: true, endpoint: '/order-status', count: 0 };
  }

  const batches = chunkArray(salesOrderIds, PARAMETER_CHUNK_SIZE);
  let allRecords: unknown[] = [];

  let pool: mssql.ConnectionPool | undefined;
  try {
    pool = await createConnectionPool('CTRLINVENT');

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
  } finally {
    if (pool) await pool.close();
  }
}

export async function runLogbookUpdateDB(): Promise<void> {
  const startTime = new Date();
  logger.info('--- STARTING INTERNAL EXTRACTION PROCESS (The Courier) ---');

  const results: SyncResult[] = [];

  try {
    // 1. Sync Orders (AX)
    const { result: ordersResult, orders } = await extractOrders();
    results.push(ordersResult);

    // Extract unique OEI IDs
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

    // 2. Sync Order Details (SQL Server)
    results.push(await extractOrderDetail(oeiIds));

    // 3. Sync Order Status (AX)
    results.push(await extractOrderStatus(salesOrderIds));

    const endTime = new Date();
    const durationSeconds = (endTime.getTime() - startTime.getTime()) / 1000;

    let summary = `\n--- SYNC SUMMARY (${durationSeconds}s) ---\n`;
    results.forEach((res) => {
      const status = res.success ? 'SUCCESS' : 'FAILED';
      summary += `${res.endpoint}: ${status} (${res.count} records) ${res.error ? `- Error: ${res.error}` : ''}\n`;
    });

    logger.info(summary);
    logger.logToFile('logbookUpdateDB', `[${startTime.toISOString()}] Sync completed:\n${summary}`);
    logger.success('[logbookUpdateDB] Extraction process completed.');
  } catch (error) {
    logger.error('[logbookUpdateDB] Extraction process interrupted:', error);
    logger.logToFile('logbookUpdateDB', `[${startTime.toISOString()}] Critical Error: ${error}`);
    throw error;
  }
}
