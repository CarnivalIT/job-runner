import axios from 'axios';
import mssql from 'mssql';
import { createConnectionPool } from '../../config/database.js';
import { ENV } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import type { RawInventoryItem, InventoryPayloadItem } from './types.js';

export async function runUpdateInventory(): Promise<void> {
  const startTime = new Date();
  logger.info('[updateInventory] Starting inventory synchronization...');

  let pool: mssql.ConnectionPool | undefined;
  try {
    pool = await createConnectionPool('CTRLINVENT');

    const result = await pool.query<RawInventoryItem>(`
      SELECT [ESTILO]
            ,[DESCRIPCION]
            ,[COLOR]
            ,[TALLA]
            ,[COPA]
            ,[CALIDAD]
            ,[DISPONIBLE]
            ,[RESERVA]
      FROM CCVW_INVENMAYV3
    `);

    const recordset = result.recordset;
    logger.info(`[updateInventory] Fetched ${recordset.length} inventory records from database.`);

    const payload: InventoryPayloadItem[] = recordset.map((item) => ({
      style: item.ESTILO,
      size: item.TALLA,
      color: item.COLOR,
      cup: item.COPA,
      available: item.DISPONIBLE,
      reserved: item.RESERVA,
      description: item.DESCRIPCION ?? '',
      quality: item.CALIDAD,
    }));

    const targetUrl = `${ENV.API.STYLES_BASE_URL}/inventory/fill`;
    logger.info(`[updateInventory] Pushing payload to ${targetUrl}...`);

    const inventoryResponse = await axios.post(targetUrl, { inventory: payload });

    const endTime = new Date();
    const durationSeconds = (endTime.getTime() - startTime.getTime()) / 1000;
    const isSuccess = inventoryResponse.status === 200 || inventoryResponse.status === 201;

    let logMsg = `Start time: ${startTime.toString()}\n`;
    logMsg += `End time: ${endTime.toString()}\n`;
    logMsg += isSuccess ? `Inventory updated successfully (${recordset.length} items)\n` : `Inventory update failed\n`;
    if (!isSuccess) {
      logMsg += `Error: ${JSON.stringify(inventoryResponse.data)}\n`;
    }
    logMsg += `Total time: ${durationSeconds} seconds`;

    logger.logToFile('updateInventory', logMsg);

    if (isSuccess) {
      logger.success(`[updateInventory] Completed successfully in ${durationSeconds}s.`);
    } else {
      logger.warn(`[updateInventory] Completed with status ${inventoryResponse.status}.`);
    }
  } catch (err) {
    if (axios.isAxiosError(err)) {
      logger.error('[updateInventory] Task encountered an axios error:', err.response?.data);
      logger.logToFile('updateInventory', `Date: ${new Date().toString()} ,Error: ${err.response?.data}`);
    } else {
      logger.error('[updateInventory] Task encountered an unknown error:', err);
      logger.logToFile('updateInventory', `Date: ${new Date().toString()} ,Error: ${err}`);
    }
    throw err;
  } finally {
    if (pool) {
      await pool.close();
    }
  }
}
