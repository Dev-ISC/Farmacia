import {
  Client,
  Account,
  TablesDB,
  Databases,
  Storage,
  Users,
  ID,
  Query,
  Permission,
  Role,
} from 'node-appwrite';
import { APPWRITE_CONFIG } from './config';

/**
 * Crea una instancia privilegiada de Appwrite para el Servidor (Node.js)
 * autenticada con `APPWRITE_API_KEY`.
 *
 * Úsese exclusivamente en Route Handlers (`app/api/...`), Server Actions o Server Components
 * para operaciones administrativas y transaccionales (como descontar stock en `/api/comprar`).
 */
export function createAdminClient() {
  const apiKey = process.env.APPWRITE_API_KEY;

  if (!apiKey) {
    throw new Error(
      '[Appwrite Server] Falta la variable de entorno privada APPWRITE_API_KEY.'
    );
  }

  const client = new Client()
    .setEndpoint(APPWRITE_CONFIG.endpoint)
    .setProject(APPWRITE_CONFIG.projectId)
    .setKey(apiKey);

  return {
    client,
    get account() {
      return new Account(client);
    },
    /** API de Tablas SQL de Appwrite (`listRows`, `getRow`, `createRow`, `updateRow`, `deleteRow`, `decrementRowColumn`) */
    get tablesDB() {
      return new TablesDB(client);
    },
    /** API de Documentos compatible (`listDocuments`, `getDocument`, etc.) */
    get databases() {
      return new Databases(client);
    },
    get storage() {
      return new Storage(client);
    },
    get users() {
      return new Users(client);
    },
  };
}

/**
 * Crea una instancia de Appwrite en el servidor actuando en nombre de la sesión de un usuario.
 * Útil para verificar la sesión en Middleware / Server Components.
 */
export function createSessionClient(sessionSecret: string) {
  const client = new Client()
    .setEndpoint(APPWRITE_CONFIG.endpoint)
    .setProject(APPWRITE_CONFIG.projectId)
    .setSession(sessionSecret);

  return {
    client,
    get account() {
      return new Account(client);
    },
    get tablesDB() {
      return new TablesDB(client);
    },
    get databases() {
      return new Databases(client);
    },
  };
}

export { APPWRITE_CONFIG, ID, Query, Permission, Role };
