export interface RawInventoryItem {
  ALMACEN: string;
  ESTILO: string;
  DESCRIPCION: string | null;
  COLOR: string;
  TALLA: string;
  COPA: string | null;
  CALIDAD: string | null;
  LOTE: string | null;
  SERIE: string | null;
  LOCALIDAD: string | null;
  DISPONIBLE: number;
  RESERVA: number;
  FISICO: number;
}

export interface RawForma1Item {
  STYLE: string;
  BATCH: string;
  FIRST_ENTRY: Date | string;
}

export interface RawForma2Item {
  BATCH: string;
  FIRST_ENTRY: Date | string;
}

export interface RawForma3Item {
  STYLE: string;
  BATCH?: string;
  FIRST_ENTRY: Date | string;
}

export interface CsvCatalogItem {
  style: string;
  color: string;
  cost: number;
  description: string;
  colorDescription: string;
}

export interface StylesAgePayloadItem {
  style: string;
  description: string;
  availableInventory: number;
  reservedInventory: number;
  warehouseId: string;
  color: string;
  colorDescription: string;
  size: string;
  cup: string;
  productQuality: string;
  productSerialNumber: string;
  locality: string;
  batchId: string;
  firstEntry: string;
  cost: number;
}

export interface StylesAgePayload {
  data: StylesAgePayloadItem[];
}
