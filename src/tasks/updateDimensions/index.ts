import axios from 'axios';
import mssql from 'mssql';
import { createConnectionPool } from '../../config/database.js';
import { ENV } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import type { RawProductRecord, SizeItem, ColorItem } from './types.js';

export async function runUpdateDimensions(): Promise<void> {
  const startTime = new Date();
  logger.info('[updateDimensions] Starting product dimensions synchronization...');

  let pool: mssql.ConnectionPool | undefined;
  try {
    pool = await createConnectionPool('CTRLINVENT');

    const result = await pool.query(`
      SELECT DISPLAYPRODUCTNUMBER
      FROM ECORESPRODUCT
      WHERE DISPLAYPRODUCTNUMBER LIKE '%ALTA%'
        AND DISPLAYPRODUCTNUMBER NOT LIKE '%# : #%'
        AND DISPLAYPRODUCTNUMBER NOT LIKE '[qQwWzZ]%';
    `);

    const records = (result as { recordset: RawProductRecord[] }).recordset;
    logger.info(`[updateDimensions] Fetched ${records.length} product records from ECORESPRODUCT.`);

    // Expected structure: "20038 : C : 32 : 226 : ALTA" -> parts: [style, cup, size, color, suffix]
    const cleanData = records.map((item) => {
      const parts = item.DISPLAYPRODUCTNUMBER.split(' : ');
      return {
        style: parts[0]?.trim() || '',
        cup: parts[1]?.trim() || '',
        size: parts[2]?.trim() || '',
        color: parts[3]?.trim() || '',
      };
    });

    const dataForSizes: SizeItem[] = [];
    const dataForColors: ColorItem[] = [];
    const sizesSet = new Set<string>();
    const colorsSet = new Set<string>();

    cleanData.forEach((item) => {
      // Unique size key: style|size|cup
      const sizeKey = `${item.style}|${item.size}|${item.cup}`;
      if (!sizesSet.has(sizeKey)) {
        sizesSet.add(sizeKey);
        dataForSizes.push({
          style: item.style,
          size: item.size,
          cup: item.cup,
        });
      }

      // Unique color key: style|color
      const colorKey = `${item.style}|${item.color}`;
      if (!colorsSet.has(colorKey)) {
        colorsSet.add(colorKey);
        dataForColors.push({
          style: item.style,
          color: /^\d+$/.test(item.color) ? item.color.padStart(3, '0') : item.color,
        });
      }
    });

    logger.info(`[updateDimensions] Extracted ${dataForSizes.length} unique sizes and ${dataForColors.length} unique colors.`);

    // Send data to endpoints
    const sizesUrl = `${ENV.API.STYLES_BASE_URL}/style/sizes`;
    const colorsUrl = `${ENV.API.STYLES_BASE_URL}/style/colors`;

    const [sizesResponse, colorsResponse] = await Promise.all([
      axios.post(sizesUrl, { sizes: dataForSizes }),
      axios.post(colorsUrl, { colors: dataForColors }),
    ]);

    const endTime = new Date();
    const durationSeconds = (endTime.getTime() - startTime.getTime()) / 1000;

    let logMsg = `Start time: ${startTime.toString()}\n`;
    logMsg += `End time: ${endTime.toString()}\n`;
    logMsg += sizesResponse.status === 200 ? `Sizes updated successfully (${dataForSizes.length} items)\n` : `Sizes update failed\n`;
    logMsg += colorsResponse.status === 200 ? `Colors updated successfully (${dataForColors.length} items)\n` : `Colors update failed\n`;
    logMsg += `Total time: ${durationSeconds} seconds`;

    logger.logToFile('updateDimensions', logMsg);

    if (sizesResponse.status === 200 && colorsResponse.status === 200) {
      logger.success(`[updateDimensions] Completed successfully in ${durationSeconds}s.`);
    } else {
      logger.warn(`[updateDimensions] Finished with responses - Sizes: ${sizesResponse.status}, Colors: ${colorsResponse.status}`);
    }
  } catch (err) {
    logger.error('[updateDimensions] Task encountered an error:', err);
    logger.logToFile('updateDimensions', `Date: ${new Date().toString()} ,Error: ${err}`);
    throw err;
  } finally {
    if (pool) {
      await pool.close();
    }
  }
}
