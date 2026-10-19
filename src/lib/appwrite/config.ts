/**
 * Centraliza los IDs de configuración de Appwrite leídos desde las variables de entorno (.env).
 */
export const APPWRITE_CONFIG = {
  endpoint:
    process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1',
  projectId: process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || '',
  databaseId: process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || '',
  tables: {
    usuarios: process.env.NEXT_PUBLIC_APPWRITE_TABLE_USUARIOS_ID || '',
    categorias: process.env.NEXT_PUBLIC_APPWRITE_TABLE_CATEGORIAS_ID || '',
    productos: process.env.NEXT_PUBLIC_APPWRITE_TABLE_PRODUCTOS_ID || '',
    carritoItems: process.env.NEXT_PUBLIC_APPWRITE_TABLE_CARRITO_ITEMS_ID || '',
    pedidos: process.env.NEXT_PUBLIC_APPWRITE_TABLE_PEDIDOS_ID || '',
    detallePedido:
      process.env.NEXT_PUBLIC_APPWRITE_TABLE_DETALLE_PEDIDO_ID || '',
  },
} as const;
