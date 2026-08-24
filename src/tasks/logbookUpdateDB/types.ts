export interface SyncResult {
  success: boolean;
  endpoint: string;
  count: number;
  error?: string;
}

export interface ExtractedOrder {
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
