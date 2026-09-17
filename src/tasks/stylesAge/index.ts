import axios from 'axios';
import mssql from 'mssql';
import { createConnectionPool } from '../../config/database.js';
import { ENV } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { loadStylesCatalog, getCatalogItem } from './catalog.js';
import type {
  RawInventoryItem,
  RawForma1Item,
  RawForma2Item,
  RawForma3Item,
  StylesAgePayloadItem,
  StylesAgePayload,
} from './types.js';

function formatDate(dateInput: Date | string): string {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(d.getTime())) {
    return new Date().toISOString().split('T')[0]!;
  }
  return d.toISOString().split('T')[0]!;
}

function isYearBatch(batch: string | null | undefined): boolean {
  if (!batch) return false;
  const trimmed = batch.trim();
  if (trimmed.length !== 4) return false;
  const num = parseInt(trimmed, 10);
  return !isNaN(num) && num >= 2021;
}

export async function runStylesAge(): Promise<void> {
  const startTime = new Date();
  logger.info('[stylesAge] Starting Styles Age calculation task...');

  // 1. Load CSV Catalog
  const catalogMap = loadStylesCatalog();

  let pool: mssql.ConnectionPool | undefined;
  try {
    pool = await createConnectionPool('CTRLINVENT');

    // 2. Extract Base Inventory (Query 1)
    logger.info('[stylesAge] Extracting base physical inventory from CTRLINVENT...');
    const inventoryResult = await pool.query<RawInventoryItem>(`
      SELECT     
        b.inventlocationid AS ALMACEN,  
        a.itemid AS ESTILO,  
        d.Descripcion AS DESCRIPCION,  
        b.inventcolorid AS COLOR,  
        b.inventsizeid AS TALLA,  
        b.CONFIGID AS COPA,  
        b.INVENTSTYLEID AS CALIDAD,
        b.INVENTBATCHID AS LOTE,
        b.INVENTSERIALID AS SERIE,
        b.WMSLOCATIONID AS LOCALIDAD,
        sum(a.AVAILPHYSICAL) AS DISPONIBLE,  
        sum(a.ReservPhysical) AS RESERVA,  
        sum(a.PHYSICALINVENT) AS FISICO  
      FROM ColeccionIntima.dbo.inventsum a   
      INNER JOIN ColeccionIntima.dbo.inventdim b ON a.INVENTDIMID = b.INVENTDIMID    
      LEFT JOIN cctb_ArticulosAX d ON a.ITEMID = d.Articulo  
      WHERE 
        b.INVENTLOCATIONID in ('PN01', 'PN02', 'PN03','CR044')    
        AND a.PHYSICALINVENT <> 0    
        AND b.WMSLOCATIONID <> 'TALLER'    
        AND b.WMSLOCATIONID NOT LIKE 'MAQ%'    
        AND b.WMSLOCATIONID NOT LIKE 'RECIBO'    
      GROUP BY
        a.itemid,
        b.inventlocationid,
        b.inventcolorid,
        b.inventsizeid,
        b.CONFIGID,
        b.INVENTSTYLEID,
        d.Descripcion,
        b.INVENTBATCHID,
        b.INVENTSERIALID,
        b.WMSLOCATIONID
      HAVING sum(a.PHYSICALINVENT) > 0
    `);

    const inventoryRecords = inventoryResult.recordset;
    logger.info(`[stylesAge] Fetched ${inventoryRecords.length} inventory records.`);

    // 3. Extract Forma 1: (STYLE, BATCH) for PN01 Purchased
    logger.info('[stylesAge] Extracting history for Forma 1 (Style + Batch PN01)...');
    const forma1Result = await pool.query<RawForma1Item>(`
      SELECT 
        a.itemid AS STYLE,
        b.INVENTBATCHID AS BATCH,
        min(a.DATEPHYSICAL) AS FIRST_ENTRY
      FROM ColeccionIntima.dbo.INVENTTRANS a
      INNER JOIN ColeccionIntima.dbo.INVENTDIM b ON a.INVENTDIMID = b.INVENTDIMID
      INNER JOIN ColeccionIntima.dbo.inventTransOrigin c ON a.INVENTTRANSORIGIN = c.RECID
      WHERE a.STATUSRECEIPT IN ('1')
        AND c.REFERENCECATEGORY IN ('2', '3')
        AND b.INVENTLOCATIONID IN ('PN01')
      GROUP BY 
        a.itemid,
        b.INVENTBATCHID,
        c.REFERENCECATEGORY
    `);

    const forma1Map = new Map<string, Date>();
    for (const row of forma1Result.recordset) {
      if (!row.STYLE || !row.BATCH || !row.FIRST_ENTRY) continue;
      const key = `${row.STYLE.trim().toLowerCase()}_${row.BATCH.trim().toLowerCase()}`;
      const rowDate = new Date(row.FIRST_ENTRY);
      const existing = forma1Map.get(key);
      if (!existing || rowDate < existing) {
        forma1Map.set(key, rowDate);
      }
    }
    logger.info(`[stylesAge] Indexed ${forma1Map.size} unique style/batch keys for Forma 1.`);

    // 4. Extract Forma 2: BATCH only for PN01 Purchased
    logger.info('[stylesAge] Extracting history for Forma 2 (Batch only PN01)...');
    const forma2Result = await pool.query<RawForma2Item>(`
      SELECT 
        b.INVENTBATCHID AS BATCH,
        min(a.DATEPHYSICAL) AS FIRST_ENTRY
      FROM ColeccionIntima.dbo.INVENTTRANS a 
      INNER JOIN ColeccionIntima.dbo.INVENTDIM b ON a.INVENTDIMID = b.INVENTDIMID
      INNER JOIN ColeccionIntima.dbo.inventTransOrigin c ON a.INVENTTRANSORIGIN = c.RECID
      WHERE a.STATUSRECEIPT IN ('1')
        AND c.REFERENCECATEGORY IN ('2', '3')
        AND b.INVENTLOCATIONID IN ('PN01')
      GROUP BY 
        b.INVENTBATCHID, 
        c.REFERENCECATEGORY
    `);

    const forma2Map = new Map<string, Date>();
    for (const row of forma2Result.recordset) {
      if (!row.BATCH || !row.FIRST_ENTRY) continue;
      const key = row.BATCH.trim().toLowerCase();
      const rowDate = new Date(row.FIRST_ENTRY);
      const existing = forma2Map.get(key);
      if (!existing || rowDate < existing) {
        forma2Map.set(key, rowDate);
      }
    }
    logger.info(`[stylesAge] Indexed ${forma2Map.size} unique batches for Forma 2.`);

    // 5. Extract Forma 3: STYLE only (purchased anywhere)
    logger.info('[stylesAge] Extracting history for Forma 3 (Style only)...');
    const forma3Result = await pool.query<RawForma3Item>(`
      SELECT 
        a.itemid AS STYLE,
        b.INVENTBATCHID AS BATCH,
        min(a.DATEPHYSICAL) AS FIRST_ENTRY
      FROM ColeccionIntima.dbo.INVENTTRANS a 
      INNER JOIN ColeccionIntima.dbo.INVENTDIM b ON a.INVENTDIMID = b.INVENTDIMID
      INNER JOIN ColeccionIntima.dbo.inventTransOrigin c ON a.INVENTTRANSORIGIN = c.RECID
      WHERE a.STATUSRECEIPT IN ('1')
      GROUP BY 
        b.INVENTBATCHID, 
        c.REFERENCECATEGORY, 
        a.itemid
    `);

    const forma3Map = new Map<string, Date>();
    for (const row of forma3Result.recordset) {
      if (!row.STYLE || !row.FIRST_ENTRY) continue;
      const key = row.STYLE.trim().toLowerCase();
      const rowDate = new Date(row.FIRST_ENTRY);
      const existing = forma3Map.get(key);
      if (!existing || rowDate < existing) {
        forma3Map.set(key, rowDate);
      }
    }
    logger.info(`[stylesAge] Indexed ${forma3Map.size} unique styles for Forma 3.`);

    // 6. Transform and build payload using 4-step cascade and catalog
    const todayDate = new Date();
    let forma1Count = 0;
    let forma2Count = 0;
    let forma3Count = 0;
    let forma4Count = 0;

    const payloadItems: StylesAgePayloadItem[] = inventoryRecords.map((item) => {
      let resolvedDate: Date | undefined;

      const styleKey = (item.ESTILO || '').trim().toLowerCase();
      const batchKey = (item.LOTE || '').trim().toLowerCase();

      // Forma 1: Style + Batch (only when batch >= 2021)
      if (isYearBatch(item.LOTE)) {
        resolvedDate = forma1Map.get(`${styleKey}_${batchKey}`);
        if (resolvedDate) forma1Count++;
      }

      // Forma 2: Batch only
      if (!resolvedDate && batchKey) {
        resolvedDate = forma2Map.get(batchKey);
        if (resolvedDate) forma2Count++;
      }

      // Forma 3: Style only
      if (!resolvedDate && styleKey) {
        resolvedDate = forma3Map.get(styleKey);
        if (resolvedDate) forma3Count++;
      }

      // Forma 4: Default to current date
      if (!resolvedDate) {
        resolvedDate = todayDate;
        forma4Count++;
      }

      // Catalog lookup
      const catalogInfo = getCatalogItem(catalogMap, item.ESTILO, item.COLOR);

      return {
        style: item.ESTILO,
        description: catalogInfo.description,
        availableInventory: item.DISPONIBLE,
        reservedInventory: item.RESERVA,
        warehouseId: item.ALMACEN,
        color: item.COLOR,
        colorDescription: catalogInfo.colorDescription,
        size: item.TALLA,
        cup: item.COPA ?? '',
        productQuality: item.CALIDAD ?? '',
        productSerialNumber: item.SERIE ?? '',
        locality: item.LOCALIDAD ?? '',
        batchId: item.LOTE ?? '',
        firstEntry: formatDate(resolvedDate),
        cost: catalogInfo.cost,
      };
    });

    logger.info(
      `[stylesAge] First Entry cascade resolution stats: Forma 1: ${forma1Count}, Forma 2: ${forma2Count}, Forma 3: ${forma3Count}, Forma 4 (Default): ${forma4Count}.`
    );

    // 7. Load: Dispatch payload to target API
    const targetUrl = ENV.API.STYLES_AGE_URL;
    logger.info(`[stylesAge] Dispatching ${payloadItems.length} records to ${targetUrl}...`);

    const payload: StylesAgePayload = { data: payloadItems };
    const response = await axios.post(targetUrl, payload, {
      headers: {
        'Content-Type': 'application/json',
        'x-api-token': ENV.API.STYLES_AGE_TOKEN,
      },
      timeout: 120000,
    });

    const isSuccess = response.status === 200 || response.status === 201;
    const endTime = new Date();
    const durationSeconds = (endTime.getTime() - startTime.getTime()) / 1000;

    let logMsg = `Start time: ${startTime.toString()}\n`;
    logMsg += `End time: ${endTime.toString()}\n`;
    logMsg += isSuccess
      ? `Styles age calculation dispatched successfully (${payloadItems.length} items)\n`
      : `Styles age API dispatch failed with status ${response.status}\n`;
    logMsg += `Cascade stats: Forma1=${forma1Count}, Forma2=${forma2Count}, Forma3=${forma3Count}, Forma4=${forma4Count}\n`;
    if (!isSuccess) {
      logMsg += `Response: ${JSON.stringify(response.data)}\n`;
    }
    logMsg += `Total execution time: ${durationSeconds}s`;

    logger.logToFile('stylesAge', logMsg);
    logger.info(`[stylesAge] Task completed in ${durationSeconds} seconds.`);
  } catch (error) {
    const endTime = new Date();
    const durationSeconds = (endTime.getTime() - startTime.getTime()) / 1000;
    const errorMsg = (error as Error).message || String(error);

    logger.error(`[stylesAge] Task execution error: ${errorMsg}`);
    logger.logToFile('stylesAge', `Execution Failed at ${endTime.toString()}: ${errorMsg}\nDuration: ${durationSeconds}s`);
    throw error;
  } finally {
    if (pool) {
      await pool.close();
      logger.info('[stylesAge] Database connection pool closed.');
    }
  }
}
