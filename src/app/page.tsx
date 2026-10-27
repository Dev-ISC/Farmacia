'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRealtimeStock } from '@/hooks/useRealtimeStock';
import { APPWRITE_CONFIG } from '@/lib/appwrite/config';

const INTEGRANTES = [
  { nombre: 'Daniel', rol: 'admin' },
  { nombre: 'Raul', rol: 'cliente' },
  { nombre: 'Jean', rol: 'cliente' },
  { nombre: 'Gabriela', rol: 'cliente' },
  { nombre: 'Giovany', rol: 'cliente' },
  { nombre: 'Juan', rol: 'cliente' },
];

const ENDPOINTS_API = [
  { metodo: 'POST', ruta: '/api/comprar', desc: 'Mutex FIFO, verificación de stock y rollback', rol: 'Sesión' },
  { metodo: 'GET', ruta: '/api/productos', desc: 'Catálogo de medicamentos y relaciones activas', rol: 'Público' },
  { metodo: 'POST', ruta: '/api/productos', desc: 'Alta de nuevos medicamentos en catálogo', rol: 'Admin' },
  { metodo: 'PATCH', ruta: '/api/productos/[id]', desc: 'Edición y baja lógica (activo = false)', rol: 'Admin' },
  { metodo: 'PATCH', ruta: '/api/productos/[id]/stock', desc: 'Ajuste manual de stock e inventario', rol: 'Admin' },
  { metodo: 'GET', ruta: '/api/categorias', desc: 'Clasificación de categorías activas', rol: 'Público' },
  { metodo: 'GET', ruta: '/api/pedidos', desc: 'Consulta de pedidos (propios o general)', rol: 'Sesión' },
  { metodo: 'PATCH', ruta: '/api/pedidos/[id]', desc: 'Cambio de estado (pagado, enviado, entregado)', rol: 'Admin' },
];

const CODIGOS_HTTP = [
  { codigo: '200 OK', desc: 'Peticiones exitosas y listados' },
  { codigo: '201 Created', desc: 'Pedido creado exitosamente con folio' },
  { codigo: '400 Bad Request', desc: 'Fallo de validación de payload' },
  { codigo: '401 Unauthorized', desc: 'Sin sesión o cookie expirada' },
  { codigo: '403 Forbidden', desc: 'Requiere permisos de administrador' },
  { codigo: '409 Conflict', desc: 'Concurrencia: stock agotado o insuficiente' },
];

export default function Home() {
  const { productos, conectadoRealtime, cargando, error: errorStock } = useRealtimeStock({ soloActivos: true });
  const [latenciaMs, setLatenciaMs] = useState<number | null>(null);
  const [errorLatencia, setErrorLatencia] = useState(false);

  const totalProductos = productos.length;
  const totalStock = productos.reduce((acc, p) => acc + (p.stock || 0), 0);

  useEffect(() => {
    const inicio = performance.now();
    fetch('/api/categorias')
      .then((res) => {
        if (res.ok) {
          setLatenciaMs(Math.round(performance.now() - inicio));
          setErrorLatencia(false);
        } else {
          setLatenciaMs(null);
          setErrorLatencia(true);
        }
      })
      .catch(() => {
        setLatenciaMs(null);
        setErrorLatencia(true);
      });
  }, []);

  return (
    <div className="min-h-screen flex flex-col justify-between bg-zinc-50 font-sans dark:bg-black text-black dark:text-zinc-50">
      {/* Barra superior estilo Vercel */}
      <header className="w-full border-b border-black/[.08] dark:border-white/[.145] bg-white dark:bg-black px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="font-semibold tracking-tight text-lg">Farmacia</span>
          <span className="text-xs font-mono text-zinc-400 dark:text-zinc-500">
            / Estado del Sistema
          </span>
        </div>

        <Link
          href="/login"
          className="flex h-9 items-center justify-center rounded-full border border-solid border-black/[.08] dark:border-white/[.145] px-4 text-xs font-medium hover:border-black dark:hover:border-white transition-colors"
        >
          Iniciar Sesión
        </Link>
      </header>

      {/* Contenido principal */}
      <main className="flex-1 w-full max-w-5xl mx-auto px-6 py-10 flex flex-col gap-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
            Panel de Estado & Accesos
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            Información técnica de backend, conexión a base de datos y accesos rápidos del sistema.
          </p>
        </div>

        {/* Panel de Estado y Diagnóstico en Tiempo Real */}
        <section className="rounded-2xl border border-black/[.08] dark:border-white/[.145] bg-white dark:bg-black p-6 flex flex-col gap-5">
          <div className="flex items-center justify-between pb-4 border-b border-black/[.06] dark:border-white/[.08]">
            <div className="flex items-center gap-2">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  conectadoRealtime ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'
                }`}
              />
              <span className="text-xs font-mono font-medium">
                Appwrite Backend: {conectadoRealtime ? 'En Línea' : 'Conectando...'}
              </span>
            </div>
            <span className="text-xs font-mono text-zinc-400">
              {errorLatencia
                ? 'API: No disponible'
                : latenciaMs !== null
                ? `Latencia API: ${latenciaMs} ms`
                : 'Midiendo latencia...'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 font-mono text-xs">
            <div className="p-3 rounded-xl border border-black/[.06] dark:border-white/[.08] bg-zinc-50/50 dark:bg-zinc-950/50">
              <span className="text-[11px] text-zinc-400 block mb-1">Servidor API</span>
              <span className="text-zinc-800 dark:text-zinc-200 truncate block font-medium" title={APPWRITE_CONFIG.endpoint}>
                {APPWRITE_CONFIG.endpoint.replace('https://', '')}
              </span>
            </div>

            <div className="p-3 rounded-xl border border-black/[.06] dark:border-white/[.08] bg-zinc-50/50 dark:bg-zinc-950/50">
              <span className="text-[11px] text-zinc-400 block mb-1">Base de Datos (TablesDB)</span>
              <span className="text-zinc-800 dark:text-zinc-200 truncate block font-medium" title={APPWRITE_CONFIG.databaseId}>
                {APPWRITE_CONFIG.databaseId || 'Configurada'}
              </span>
            </div>

            <div className="p-3 rounded-xl border border-black/[.06] dark:border-white/[.08] bg-zinc-50/50 dark:bg-zinc-950/50">
              <span className="text-[11px] text-zinc-400 block mb-1">Canal Realtime</span>
              <span className={`block font-medium truncate ${conectadoRealtime ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600'}`} title={`tablesdb.${APPWRITE_CONFIG.databaseId}.tables.${APPWRITE_CONFIG.tables.productos}.rows`}>
                {conectadoRealtime ? '🟢 Suscrito a Productos' : '⚪ Reconectando'}
              </span>
            </div>

            <div className="p-3 rounded-xl border border-black/[.06] dark:border-white/[.08] bg-zinc-50/50 dark:bg-zinc-950/50">
              <span className="text-[11px] text-zinc-400 block mb-1">Stock Activo en Vivo</span>
              <span className="text-zinc-800 dark:text-zinc-200 block font-medium">
                {cargando
                  ? '...'
                  : errorStock
                  ? 'No disponible'
                  : `${totalProductos} medicamentos (${totalStock} unid.)`}
              </span>
            </div>
          </div>
        </section>

        {/* 3 Tarjetas de Acceso */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Card 1: Tienda Cliente */}
          <Link
            href="/cliente"
            prefetch={false}
            className="group rounded-2xl border border-black/[.08] dark:border-white/[.145] bg-white dark:bg-black p-6 flex flex-col justify-between transition-all hover:border-black/[.25] dark:hover:border-white/[.3]"
          >
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-500">
                  Cliente
                </span>
                <span className="text-xs font-mono text-emerald-600 dark:text-emerald-400">
                  {cargando ? '...' : errorStock ? 'Sin conexión' : `${totalProductos} productos`}
                </span>
              </div>
              <h2 className="text-lg font-semibold tracking-tight mb-2 group-hover:text-black dark:group-hover:text-white">
                Tienda y Catálogo
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                Catálogo de medicamentos con stock en vivo, filtros de búsqueda,
                carrito y checkout protegido contra concurrencia.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-black/[.06] dark:border-white/[.08] flex items-center justify-between text-xs font-medium">
              <span>Ir a la Tienda</span>
              <span className="transition-transform group-hover:translate-x-1">&rarr;</span>
            </div>
          </Link>

          {/* Card 2: Panel Servidor (PENDIENTE) */}
          <div
            className="rounded-2xl border border-dashed border-black/[.15] dark:border-white/[.15] bg-zinc-50/60 dark:bg-zinc-950/60 p-6 flex flex-col justify-between opacity-80 cursor-default select-none"
          >
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400">
                  Administrador
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full border border-amber-300 dark:border-amber-800/80 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 font-medium">
                  Pendiente
                </span>
              </div>
              <h2 className="text-lg font-semibold tracking-tight mb-2 text-zinc-700 dark:text-zinc-300">
                Interfaz Servidor
              </h2>
              <p className="text-xs text-zinc-400 dark:text-zinc-500 leading-relaxed">
                Dashboard administrativo para supervisión de stock, gestión de catálogo
                y monitor de pedidos y ventas en tiempo real.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-black/[.06] dark:border-white/[.08] flex items-center justify-between text-xs font-mono text-zinc-400 dark:text-zinc-500">
              <span>En desarrollo</span>
              <span>&bull;</span>
            </div>
          </div>

          {/* Card 3: Iniciar Sesión / Selector */}
          <Link
            href="/login"
            className="group rounded-2xl border border-black/[.08] dark:border-white/[.145] bg-white dark:bg-black p-6 flex flex-col justify-between transition-all hover:border-black/[.25] dark:hover:border-white/[.3]"
          >
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-500">
                  Autenticación
                </span>
                <span className="text-xs font-mono text-zinc-400">
                  6 usuarios demo
                </span>
              </div>
              <h2 className="text-lg font-semibold tracking-tight mb-2 group-hover:text-black dark:group-hover:text-white">
                Selector de Usuario
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                Accede rápidamente como Daniel (admin) o como cliente
                (Raul, Jean, Gabriela, Giovany, Juan) para probar roles y sesiones.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-black/[.06] dark:border-white/[.08] flex items-center justify-between text-xs font-medium">
              <span>Cambiar Usuario</span>
              <span className="transition-transform group-hover:translate-x-1">&rarr;</span>
            </div>
          </Link>
        </div>

        {/* Endpoints de la API Backend */}
        <section className="rounded-2xl border border-black/[.08] dark:border-white/[.145] bg-white dark:bg-black p-6 flex flex-col gap-4">
          <div className="flex items-center justify-between pb-3 border-b border-black/[.06] dark:border-white/[.08]">
            <h3 className="text-sm font-semibold tracking-tight">
              Endpoints de la API Backend
            </h3>
            <span className="text-xs font-mono text-zinc-400">
              8 Rutas REST Disponibles
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 font-mono text-xs">
            {ENDPOINTS_API.map((ep) => (
              <div
                key={`${ep.metodo}-${ep.ruta}`}
                className="p-3 rounded-xl border border-black/[.06] dark:border-white/[.08] bg-zinc-50/50 dark:bg-zinc-950/50 flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`px-1.5 py-0.5 rounded-sm text-[10px] font-bold ${
                      ep.metodo === 'POST'
                        ? 'bg-blue-600 text-white'
                        : ep.metodo === 'PATCH'
                        ? 'bg-amber-600 text-white'
                        : 'bg-emerald-600 text-white'
                    }`}
                  >
                    {ep.metodo}
                  </span>
                  <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                    {ep.ruta}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-sans text-zinc-400 hidden sm:block truncate">
                    {ep.desc}
                  </span>
                  <span
                    className={`text-[9px] px-1.5 py-0.5 rounded-full border ${
                      ep.rol === 'Admin'
                        ? 'border-red-300 dark:border-red-900 text-red-600 dark:text-red-400'
                        : ep.rol === 'Sesión'
                        ? 'border-blue-300 dark:border-blue-900 text-blue-600 dark:text-blue-400'
                        : 'border-zinc-300 dark:border-zinc-700 text-zinc-500'
                    }`}
                  >
                    {ep.rol}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Códigos de Respuesta HTTP Documentados */}
        <section className="rounded-2xl border border-black/[.08] dark:border-white/[.145] bg-white dark:bg-black p-6 flex flex-col gap-4">
          <div className="flex items-center justify-between pb-3 border-b border-black/[.06] dark:border-white/[.08]">
            <h3 className="text-sm font-semibold tracking-tight">
              Protocolo de Respuestas HTTP del Sistema
            </h3>
            <span className="text-xs font-mono text-zinc-400">
              Estándar RFC & Manejo de Errores
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 font-mono text-xs">
            {CODIGOS_HTTP.map((item) => (
              <div
                key={item.codigo}
                className="p-2.5 rounded-xl border border-black/[.06] dark:border-white/[.08] bg-zinc-50/50 dark:bg-zinc-950/50 flex flex-col justify-between gap-1"
              >
                <span className={`font-bold text-[11px] ${
                  item.codigo.startsWith('2')
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : item.codigo.startsWith('409')
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-zinc-600 dark:text-zinc-300'
                }`}>
                  {item.codigo}
                </span>
                <span className="text-[10px] text-zinc-500 font-sans leading-tight">
                  {item.desc}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Detalles de Arquitectura y Concurrencia */}
        <section className="rounded-2xl border border-black/[.08] dark:border-white/[.145] bg-white dark:bg-black p-6 flex flex-col gap-4">
          <h3 className="text-sm font-semibold tracking-tight pb-3 border-b border-black/[.06] dark:border-white/[.08]">
            Arquitectura del Sistema & Concurrencia
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs font-mono">
            <div className="p-3 rounded-xl border border-black/[.06] dark:border-white/[.08] bg-zinc-50/50 dark:bg-zinc-950/50">
              <span className="text-[11px] text-zinc-400 block mb-1">Manejo de Concurrencia</span>
              <strong className="text-zinc-800 dark:text-zinc-200 block font-semibold mb-1">
                FIFO Mutex en Memoria
              </strong>
              <p className="text-[11px] text-zinc-500 font-sans">
                Serialización estricta de compras concurrentes para evitar sobreventa.
              </p>
            </div>

            <div className="p-3 rounded-xl border border-black/[.06] dark:border-white/[.08] bg-zinc-50/50 dark:bg-zinc-950/50">
              <span className="text-[11px] text-zinc-400 block mb-1">Respuesta a Conflictos</span>
              <strong className="text-zinc-800 dark:text-zinc-200 block font-semibold mb-1">
                HTTP 409 Conflict + Rollback
              </strong>
              <p className="text-[11px] text-zinc-500 font-sans">
                Devolución inmediata y rollback compensatorio cuando el stock se agota simultáneamente.
              </p>
            </div>

            <div className="p-3 rounded-xl border border-black/[.06] dark:border-white/[.08] bg-zinc-50/50 dark:bg-zinc-950/50">
              <span className="text-[11px] text-zinc-400 block mb-1">Seguridad de Sesiones</span>
              <strong className="text-zinc-800 dark:text-zinc-200 block font-semibold mb-1">
                Proxy Perimetral + Appwrite
              </strong>
              <p className="text-[11px] text-zinc-500 font-sans">
                Protección perimetral en middleware con validación de roles en tiempo de ejecución.
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* Pie de página con Next.js, Appwrite y los Integrantes */}
      <footer className="w-full border-t border-black/[.08] dark:border-white/[.145] px-6 py-6 text-xs font-mono text-zinc-500 dark:text-zinc-400 flex flex-col md:flex-row items-center justify-between gap-4 max-w-5xl mx-auto">
        <p>Sistema de Farmacia &bull; Next.js 16 + Appwrite Cloud</p>

        {/* Nombres de los Integrantes (Usuarios) */}
        <div className="flex flex-wrap items-center justify-center md:justify-end gap-2 text-xs font-mono">
          <span className="text-zinc-400">Integrantes:</span>
          {INTEGRANTES.map((persona) => (
            <span
              key={persona.nombre}
              className={`px-2.5 py-0.5 rounded-full border text-[11px] ${
                persona.rol === 'admin'
                  ? 'border-black/20 dark:border-white/30 text-black dark:text-white font-medium bg-zinc-100 dark:bg-zinc-900'
                  : 'border-black/[.08] dark:border-white/[.12] text-zinc-600 dark:text-zinc-400'
              }`}
            >
              {persona.nombre} {persona.rol === 'admin' && '(admin)'}
            </span>
          ))}
        </div>
      </footer>
    </div>
  );
}
