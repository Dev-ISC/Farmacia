import {
  Client,
  Account,
  TablesDB,
  Databases,
  Storage,
  Realtime,
  Channel,
  ID,
  Query,
} from 'appwrite';
import { APPWRITE_CONFIG } from './config';

/**
 * Cliente Web de Appwrite para el navegador.
 * Se utiliza para autenticación del usuario, lecturas permitidas y
 * suscripciones Realtime (ej. actualización de stock en vivo).
 *
 * RECORDATORIO DE ARQUITECTURA:
 * El cliente NUNCA debe descontar el stock directamente en Appwrite.
 * Toda compra debe pasar por `POST /api/comprar`.
 */
export const client = new Client();

if (APPWRITE_CONFIG.endpoint && APPWRITE_CONFIG.projectId) {
  client
    .setEndpoint(APPWRITE_CONFIG.endpoint)
    .setProject(APPWRITE_CONFIG.projectId);
}

/** Servicio de Autenticación de Cuentas (Web SDK) */
export const account = new Account(client);

/**
 * Servicio TablesDB (Nueva API SQL/Tablas de Appwrite con createRow, listRows, updateRow, etc.)
 */
export const tablesDB = new TablesDB(client);

/**
 * Servicio Databases clásico (para compatibilidad en caso de que algún integrante use listDocuments)
 */
export const databases = new Databases(client);

/** Servicio de Almacenamiento (para subir recetas médicas o imágenes de productos) */
export const storage = new Storage(client);

/**
 * Servicio Realtime de Appwrite v29+ (WebSockets para suscripciones en tiempo real)
 */
export const realtime = new Realtime(client);

export { APPWRITE_CONFIG, Channel, ID, Query };
