/**
 * Función de liberación de un candado (Mutex).
 */
export type ReleaseFunction = () => void;

/**
 * Implementación de un Mutex FIFO (First-In, First-Out) en memoria para Node.js.
 * Garantiza exclusión mutua estricta: si múltiples clientes envían una compra
 * en el mismo milisegundo, las peticiones se forman en fila y se ejecutan
 * estrictamente una tras otra.
 */
export class AsyncMutex {
  private locked = false;
  private readonly queue: Array<() => void> = [];

  /**
   * Adquiere el candado. Si ya está ocupado, espera su turno en la cola FIFO.
   * Devuelve una función `release()` que DEBE llamarse en un bloque `finally`.
   */
  public acquire(): Promise<ReleaseFunction> {
    return new Promise<ReleaseFunction>((resolve) => {
      const tryAcquire = () => {
        if (!this.locked) {
          this.locked = true;
          let released = false;

          const release: ReleaseFunction = () => {
            if (released) return;
            released = true;
            this.locked = false;

            const nextInQueue = this.queue.shift();
            if (nextInQueue) {
              nextInQueue();
            }
          };

          resolve(release);
        } else {
          this.queue.push(tryAcquire);
        }
      };

      tryAcquire();
    });
  }

  /**
   * Ejecuta una función asíncrona dentro de una sección crítica protegida por el Mutex,
   * garantizando que el candado siempre se libere al terminar o si ocurre una excepción.
   */
  public async runExclusive<T>(task: () => Promise<T>): Promise<T> {
    const release = await this.acquire();
    try {
      return await task();
    } finally {
      release();
    }
  }

  /** Número de peticiones esperando actualmente en la fila */
  public get pendingCount(): number {
    return this.queue.length;
  }

  /** Indica si hay una transacción ejecutándose en este instante */
  public get isLocked(): boolean {
    return this.locked;
  }
}

/**
 * Gestor de candados granulares por clave (ej. por ID de producto) + candado global.
 * - `runWithProductLocks(['prodB', 'prodA'], fn)` ordena alfabéticamente los IDs
 *   de los productos antes de adquirir sus candados para prevenir interbloqueos (Deadlocks).
 * - `runGlobal(fn)` encola todas las compras en una única fila global estricta.
 */
export class ConcurrencyManager {
  private readonly globalMutex = new AsyncMutex();
  private readonly keyMutexes = new Map<string, AsyncMutex>();

  private getMutexForKey(key: string): AsyncMutex {
    let mutex = this.keyMutexes.get(key);
    if (!mutex) {
      mutex = new AsyncMutex();
      this.keyMutexes.set(key, mutex);
    }
    return mutex;
  }

  /**
   * Ejecuta una tarea bajo el candado global de compras (Cola FIFO estricta).
   */
  public async runGlobal<T>(task: () => Promise<T>): Promise<T> {
    return this.globalMutex.runExclusive(task);
  }

  /**
   * Adquiere candados por cada producto involucrado en la compra (ordenados por ID
   * para evitar Deadlocks) además del candado de transacción, garantizando cero
   * condiciones de carrera (race conditions).
   */
  public async runPurchaseTransaction<T>(
    productoIds: string[],
    task: () => Promise<T>
  ): Promise<T> {
    const uniqueSortedIds = Array.from(new Set(productoIds)).sort();

    return this.globalMutex.runExclusive(async () => {
      const releases: ReleaseFunction[] = [];
      try {
        for (const id of uniqueSortedIds) {
          const productMutex = this.getMutexForKey(id);
          const release = await productMutex.acquire();
          releases.push(release);
        }
        return await task();
      } finally {
        for (let i = releases.length - 1; i >= 0; i--) {
          releases[i]();
        }
      }
    });
  }

  public get stats() {
    return {
      isLocked: this.globalMutex.isLocked,
      queueLength: this.globalMutex.pendingCount,
    };
  }
}

/**
 * Singleton persistido en `globalThis` para que el candado sobreviva a recargas
 * de Hot Module Replacement (HMR) en desarrollo con Next.js.
 */
const globalForConcurrency = globalThis as unknown as {
  __farmaciaConcurrencyManager?: ConcurrencyManager;
};

export const purchaseLockManager =
  globalForConcurrency.__farmaciaConcurrencyManager ?? new ConcurrencyManager();

if (process.env.NODE_ENV !== 'production') {
  globalForConcurrency.__farmaciaConcurrencyManager = purchaseLockManager;
}
