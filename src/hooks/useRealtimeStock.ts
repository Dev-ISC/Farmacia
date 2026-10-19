'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  realtime,
  tablesDB,
  APPWRITE_CONFIG,
  Channel,
  Query,
} from '@/lib/appwrite/client';
import type { Producto } from '@/types/database';
import type { RealtimeResponseEvent } from 'appwrite';

export interface UseRealtimeStockOptions {
  /**
   * Lista inicial de productos (por ejemplo, si la página los cargó en un Server Component).
   * Si no se pasa, el hook cargará automáticamente el catálogo desde Appwrite al montarse.
   */
  productosIniciales?: Producto[];
  /**
   * Si es `true`, solo carga inicialmente los productos con `activo: true`.
   * Por defecto es `false` para que el dashboard `/servidor` también vea los inactivos.
   */
  soloActivos?: boolean;
  /**
   * Callback opcional que se dispara cada vez que un producto cambia en tiempo real
   * (creación, actualización de stock/precio o eliminación).
   */
  onProductoChange?: (
    evento: 'create' | 'update' | 'delete',
    producto: Producto
  ) => void;
}

export interface UseRealtimeStockReturn {
  /** Lista de productos siempre sincronizada en vivo */
  productos: Producto[];
  /** Mapa rápido `{ [productoId]: stockActual }` para consultar stock en O(1) */
  stockPorId: Record<string, number>;
  /** Estado de carga inicial */
  cargando: boolean;
  /** Indica si la conexión WebSocket Realtime está activa */
  conectadoRealtime: boolean;
  /** Error en caso de fallo al cargar el catálogo */
  error: string | null;
  /** Función para forzar una recarga manual del catálogo si se desea */
  recargar: () => Promise<void>;
}

/**
 * Custom Hook `useRealtimeStock` (1 línea para Interfaz `/cliente` e Interfaz `/servidor`).
 *
 * Ejemplo de uso en `/cliente` o `/servidor`:
 * ```tsx
 * const { productos, stockPorId, cargando, conectadoRealtime } = useRealtimeStock();
 * ```
 *
 * Se suscribe por WebSocket a la tabla `Productos` en Appwrite (`TablesDB` y `Databases`),
 * actualizando automáticamente el `stock` y los datos de cualquier producto en todas
 * las pantallas abiertas en el mismo instante en que se realiza una compra o ajuste de inventario.
 */
export function useRealtimeStock(
  options: UseRealtimeStockOptions = {}
): UseRealtimeStockReturn {
  const {
    productosIniciales,
    soloActivos = false,
    onProductoChange,
  } = options;

  const [productos, setProductos] = useState<Producto[]>(
    productosIniciales ?? []
  );
  const [cargando, setCargando] = useState<boolean>(!productosIniciales);
  const [conectadoRealtime, setConectadoRealtime] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const onProductoChangeRef = useRef(onProductoChange);

  useEffect(() => {
    onProductoChangeRef.current = onProductoChange;
  }, [onProductoChange]);

  const fetchCatalogo = useCallback(async () => {
    const queries = [Query.limit(100)];
    if (soloActivos) {
      queries.push(Query.equal('activo', true));
    }

    const respuesta = await tablesDB.listRows<Producto>({
      databaseId: APPWRITE_CONFIG.databaseId,
      tableId: APPWRITE_CONFIG.tables.productos,
      queries,
    });

    return respuesta.rows;
  }, [soloActivos]);

  const recargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const filas = await fetchCatalogo();
      setProductos(filas);
    } catch (err) {
      const mensaje =
        err instanceof Error
          ? err.message
          : 'Error al cargar el inventario de productos.';
      setError(mensaje);
    } finally {
      setCargando(false);
    }
  }, [fetchCatalogo]);

  // Carga inicial si no se proveyeron productosIniciales (actualiza estado solo en callbacks asíncronos)
  useEffect(() => {
    if (productosIniciales) return;

    let cancelado = false;

    fetchCatalogo()
      .then((filas) => {
        if (!cancelado) {
          setProductos(filas);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelado) {
          const mensaje =
            err instanceof Error
              ? err.message
              : 'Error al cargar el inventario de productos.';
          setError(mensaje);
        }
      })
      .finally(() => {
        if (!cancelado) {
          setCargando(false);
        }
      });

    return () => {
      cancelado = true;
    };
  }, [productosIniciales, fetchCatalogo]);

  // Suscripción en tiempo real a Appwrite (soporta canales TablesDB y Databases)
  useEffect(() => {
    const dbId = APPWRITE_CONFIG.databaseId;
    const tableId = APPWRITE_CONFIG.tables.productos;

    if (!dbId || !tableId) return;

    let activa = true;
    let unsubscribeFn: (() => Promise<void>) | null = null;

    // Escuchamos tanto el canal nuevo de TablesDB (`tablesdb.[DB].tables.[TABLE].rows`)
    // como el canal clásico (`databases.[DB].collections.[TABLE].documents`) para máxima compatibilidad
    const canales = [
      Channel.tablesdb(dbId).table(tableId).row(),
      `databases.${dbId}.collections.${tableId}.documents`,
    ];

    const manejarEventoRealtime = (
      response: RealtimeResponseEvent<Producto>
    ) => {
      if (!activa || !response?.payload) return;

      const productoEvento = response.payload;
      const eventos = response.events || [];

      const esEliminacion = eventos.some((ev) => ev.endsWith('.delete'));
      const esCreacion = eventos.some((ev) => ev.endsWith('.create'));

      if (esEliminacion) {
        setProductos((prev) =>
          prev.filter((item) => item.$id !== productoEvento.$id)
        );
        onProductoChangeRef.current?.('delete', productoEvento);
        return;
      }

      if (esCreacion) {
        setProductos((prev) => {
          if (soloActivos && !productoEvento.activo) return prev;
          const existe = prev.some((item) => item.$id === productoEvento.$id);
          if (existe) {
            return prev.map((item) =>
              item.$id === productoEvento.$id ? productoEvento : item
            );
          }
          return [productoEvento, ...prev];
        });
        onProductoChangeRef.current?.('create', productoEvento);
        return;
      }

      // Evento de actualización (ej. descuento de stock tras una compra en /api/comprar)
      setProductos((prev) => {
        if (soloActivos && !productoEvento.activo) {
          return prev.filter((item) => item.$id !== productoEvento.$id);
        }

        const existe = prev.some((item) => item.$id === productoEvento.$id);
        if (!existe) {
          return [...prev, productoEvento];
        }

        return prev.map((item) =>
          item.$id === productoEvento.$id
            ? { ...item, ...productoEvento }
            : item
        );
      });

      onProductoChangeRef.current?.('update', productoEvento);
    };

    realtime
      .subscribe(canales, manejarEventoRealtime)
      .then((sub) => {
        if (!activa) {
          void sub.unsubscribe();
          return;
        }
        unsubscribeFn = () => sub.unsubscribe();
        setConectadoRealtime(true);
      })
      .catch((err) => {
        console.error('[useRealtimeStock] Error al suscribir Realtime:', err);
        setConectadoRealtime(false);
      });

    return () => {
      activa = false;
      if (unsubscribeFn) {
        void unsubscribeFn();
      }
    };
  }, [soloActivos]);

  // Mapa rápido { [productoId]: stock } para lecturas inmediatas en la UI
  const stockPorId: Record<string, number> = {};
  for (const prod of productos) {
    stockPorId[prod.$id] = Number(prod.stock);
  }

  return {
    productos,
    stockPorId,
    cargando,
    conectadoRealtime,
    error,
    recargar,
  };
}
