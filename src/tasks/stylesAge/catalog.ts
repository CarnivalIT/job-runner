import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../../utils/logger.js';
import type { CsvCatalogItem } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const DEFAULT_CATALOG_PATH = path.resolve(__dirname, 'data', 'styles-catalog.csv');

/**
 * Splits a CSV line taking quotes into account.
 */
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let insideQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (insideQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === ',' && !insideQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * Loads and indexes the CSV catalog into memory by composite key (estilo_color).
 */
export function loadStylesCatalog(customPath?: string): Map<string, CsvCatalogItem> {
  const catalogMap = new Map<string, CsvCatalogItem>();
  const catalogPath = customPath || DEFAULT_CATALOG_PATH;

  if (!fs.existsSync(catalogPath)) {
    logger.warn(`[stylesAge] CSV Catalog file not found at: ${catalogPath}. Defaults ('', 0) will be used.`);
    return catalogMap;
  }

  try {
    const fileContent = fs.readFileSync(catalogPath, 'utf-8');
    const lines = fileContent.split(/\r?\n/).filter((l) => l.trim().length > 0);

    if (lines.length <= 1) {
      logger.warn(`[stylesAge] CSV Catalog at ${catalogPath} contains no data rows.`);
      return catalogMap;
    }

    const headers = parseCsvLine(lines[0]!).map((h) => h.toLowerCase().trim());

    const idxEstilo = headers.findIndex((h) => h === 'estilo');
    const idxColor = headers.findIndex((h) => h === 'color');
    const idxCosto = headers.findIndex((h) => h === 'costo');
    const idxDescripcion = headers.findIndex((h) => h === 'descripcion');
    const idxDesColor = headers.findIndex((h) => h === 'des color' || h === 'descolor');

    if (idxEstilo === -1 || idxColor === -1) {
      logger.error(`[stylesAge] CSV Catalog header is missing required columns ('estilo' and 'color'). Found: ${headers.join(', ')}`);
      return catalogMap;
    }

    for (let i = 1; i < lines.length; i++) {
      const cols = parseCsvLine(lines[i]!);
      if (cols.length < 2) continue;

      const style = cols[idxEstilo]?.trim() || '';
      const color = cols[idxColor]?.trim() || '';
      if (!style) continue;

      const rawCost = idxCosto !== -1 ? cols[idxCosto] : '0';
      const parsedCost = parseFloat(rawCost?.replace(/[^0-9.-]+/g, '') || '0');

      const item: CsvCatalogItem = {
        style,
        color,
        cost: isNaN(parsedCost) ? 0 : parsedCost,
        description: (idxDescripcion !== -1 ? cols[idxDescripcion]?.trim() : '') || '',
        colorDescription: (idxDesColor !== -1 ? cols[idxDesColor]?.trim() : '') || '',
      };

      const key = `${style.toLowerCase()}_${color.toLowerCase()}`;
      catalogMap.set(key, item);
    }

    logger.info(`[stylesAge] Loaded ${catalogMap.size} style/color entries from catalog ${catalogPath}.`);
  } catch (error) {
    logger.error(`[stylesAge] Error reading CSV catalog: ${(error as Error).message}`);
  }

  return catalogMap;
}

/**
 * Look up style & color from the catalog map with safe fallback defaults.
 */
export function getCatalogItem(
  catalogMap: Map<string, CsvCatalogItem>,
  style: string,
  color: string
): { description: string; colorDescription: string; cost: number } {
  const key = `${style.trim().toLowerCase()}_${color.trim().toLowerCase()}`;
  const found = catalogMap.get(key);

  if (found) {
    return {
      description: found.description,
      colorDescription: found.colorDescription,
      cost: found.cost,
    };
  }

  return {
    description: '',
    colorDescription: '',
    cost: 0,
  };
}
