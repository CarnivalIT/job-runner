export interface RawInventoryItem {
  ESTILO: string;
  DESCRIPCION: string | null;
  COLOR: string;
  TALLA: string;
  COPA: string;
  CALIDAD: string;
  DISPONIBLE: number;
  RESERVA: number;
  FISICO: number;
}

export interface InventoryPayloadItem {
  style: string;
  size: string;
  color: string;
  cup: string;
  available: number;
  reserved: number;
  description: string;
  quality: string;
}
