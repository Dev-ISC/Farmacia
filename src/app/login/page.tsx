'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { account, tablesDB, APPWRITE_CONFIG, Query } from '@/lib/appwrite/client';
import type { Usuario } from '@/types/database';

const DEFAULT_DEMO_PASSWORD = 'Farmacia123!';

interface SesionActivaInfo {
  $id: string;
  name: string;
  email: string;
  rol: 'admin' | 'cliente';
}

function sincronizarCookieParaMiddleware(usuarioId: string, rol: 'admin' | 'cliente') {
  if (typeof document === 'undefined') return;
  document.cookie = `farmacia_session=${encodeURIComponent(usuarioId)}; path=/; max-age=86400; SameSite=Lax`;
  document.cookie = `farmacia_rol=${encodeURIComponent(rol)}; path=/; max-age=86400; SameSite=Lax`;
}

function limpiarCookieDeMiddleware() {
  if (typeof document === 'undefined') return;
  document.cookie = 'farmacia_session=; path=/; max-age=0; SameSite=Lax';
  document.cookie = 'farmacia_rol=; path=/; max-age=0; SameSite=Lax';
}

function ContenidoLogin() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectParam = searchParams.get('redirect');

  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [cargando, setCargando] = useState<boolean>(true);
  const [usuarioActivo, setUsuarioActivo] = useState<SesionActivaInfo | null>(null);

  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [procesando, setProcesando] = useState<boolean>(false);
  const [errorLogin, setErrorLogin] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;

    tablesDB
      .listRows<Usuario>({
        databaseId: APPWRITE_CONFIG.databaseId,
        tableId: APPWRITE_CONFIG.tables.usuarios,
        queries: [Query.limit(50)],
      })
      .then((respuesta) => {
        if (!cancelado) setUsuarios(respuesta.rows);
      })
      .catch((error) => {
        if (!cancelado) console.error('Error al cargar usuarios:', error);
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });

    account
      .get()
      .then((user) => {
        if (!cancelado) {
          const esAdmin = Array.isArray(user.labels) && user.labels.includes('admin');
          const rol: 'admin' | 'cliente' = esAdmin ? 'admin' : 'cliente';
          setUsuarioActivo({
            $id: user.$id,
            name: user.name,
            email: user.email,
            rol,
          });
        }
      })
      .catch(() => {
        if (!cancelado) setUsuarioActivo(null);
      });

    return () => {
      cancelado = true;
    };
  }, []);

  const autenticarConAppwrite = async (correo: string, contrasena: string) => {
    setErrorLogin(null);
    setProcesando(true);

    try {
      try {
        await account.createEmailPasswordSession({
          email: correo,
          password: contrasena,
        });
      } catch (err: unknown) {
        const mensajeError = err instanceof Error ? err.message.toLowerCase() : '';
        if (
          mensajeError.includes('session is active') ||
          mensajeError.includes('already exists')
        ) {
          try {
            await account.deleteSession({ sessionId: 'current' });
          } catch {
            // Ignorar
          }
          await account.createEmailPasswordSession({
            email: correo,
            password: contrasena,
          });
        } else {
          throw err;
        }
      }

      const authUser = await account.get();
      const esAdmin = Array.isArray(authUser.labels) && authUser.labels.includes('admin');
      const rol: 'admin' | 'cliente' = esAdmin ? 'admin' : 'cliente';

      setUsuarioActivo({
        $id: authUser.$id,
        name: authUser.name,
        email: authUser.email,
        rol,
      });

      sincronizarCookieParaMiddleware(authUser.$id, rol);

      const destinoSeguro =
        redirectParam &&
        redirectParam.startsWith('/') &&
        !redirectParam.startsWith('//') &&
        !redirectParam.startsWith('/\\')
          ? redirectParam
          : null;
      if (destinoSeguro) {
        router.push(destinoSeguro);
      } else if (rol === 'admin') {
        router.push('/servidor');
      } else {
        router.push('/cliente');
      }
    } catch (err) {
      console.error('Error en autenticación Appwrite Auth:', err);
      const mensaje =
        err instanceof Error
          ? err.message
          : 'Credenciales inválidas o error de conexión.';
      setErrorLogin(mensaje);
    } finally {
      setProcesando(false);
    }
  };

  const cerrarSesion = async () => {
    try {
      await account.deleteSession({ sessionId: 'current' });
    } catch {
      // Ignorar
    }
    limpiarCookieDeMiddleware();
    setUsuarioActivo(null);
  };

  const manejarSubmitManual = async (e: React.FormEvent) => {
    e.preventDefault();
    const correoLimpio = email.trim().toLowerCase();
    if (!correoLimpio || !password.trim()) {
      setErrorLogin('Por favor ingresa tu correo y contraseña.');
      return;
    }
    await autenticarConAppwrite(correoLimpio, password);
  };

  const loginRapido = async (usuario: Usuario) => {
    setEmail(usuario.email);
    setPassword(DEFAULT_DEMO_PASSWORD);
    await autenticarConAppwrite(usuario.email, DEFAULT_DEMO_PASSWORD);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-50 font-sans dark:bg-black px-4 py-16">
      <main className="w-full max-w-4xl flex flex-col items-center sm:items-start bg-white dark:bg-black border border-black/[.08] dark:border-white/[.145] rounded-3xl p-8 sm:p-12 shadow-xs">
        {/* Cabecera estilo Vercel */}
        <div className="flex flex-col gap-2 mb-8 text-center sm:text-left w-full">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Farmacia &bull; Autenticación
            </span>
            {usuarioActivo && (
              <span className="inline-flex items-center gap-1.5 text-xs font-mono text-zinc-600 dark:text-zinc-400">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                Conectado como {usuarioActivo.name}
              </span>
            )}
          </div>
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-black dark:text-zinc-50">
            Iniciar Sesión
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Selecciona tu perfil o ingresa tus credenciales.
          </p>
        </div>

        {/* Banner de sesión activa */}
        {usuarioActivo && (
          <div className="w-full flex items-center justify-between p-3.5 mb-8 rounded-xl border border-black/[.08] dark:border-white/[.145] bg-black/[.02] dark:bg-white/[.03] text-sm">
            <div className="flex items-center gap-2">
              <span className="font-medium text-black dark:text-white">
                {usuarioActivo.name}
              </span>
              <span className="text-xs font-mono text-zinc-500">
                ({usuarioActivo.email})
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full border border-zinc-300 dark:border-zinc-700 bg-zinc-100/80 dark:bg-zinc-800/80 text-[10px] font-mono font-medium uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                {usuarioActivo.rol}
              </span>
            </div>
            <button
              type="button"
              onClick={() => void cerrarSesion()}
              className="text-xs text-zinc-500 hover:text-black dark:hover:text-white transition-colors cursor-pointer underline underline-offset-4"
            >
              Cerrar sesión
            </button>
          </div>
        )}

        {/* Selector Rápido de Usuarios (Cards estilo Vercel) */}
        <div className="w-full mb-10">
          <h2 className="text-xs font-mono uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-3">
            Selección Rápida de Perfiles:
          </h2>

          {cargando ? (
            <div className="p-8 text-center text-xs font-mono text-zinc-400">
              Cargando perfiles...
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {usuarios.map((usuario) => {
                const esActivo = usuario.$id === usuarioActivo?.$id;

                return (
                  <button
                    key={usuario.$id}
                    type="button"
                    disabled={procesando}
                    onClick={() => void loginRapido(usuario)}
                    className={`flex flex-col justify-between p-4 rounded-xl border text-left transition-colors cursor-pointer disabled:opacity-50 ${
                      esActivo
                        ? 'border-black dark:border-white bg-black/[.04] dark:bg-white/[.06]'
                        : 'border-black/[.08] dark:border-white/[.145] hover:border-black/[.3] dark:hover:border-white/[.3] hover:bg-black/[.02] dark:hover:bg-white/[.02]'
                    }`}
                  >
                    <div>
                      <div className="w-8 h-8 rounded-full border border-black/[.08] dark:border-white/[.145] flex items-center justify-center font-mono text-xs font-medium text-black dark:text-white bg-black/[.03] dark:bg-white/[.05] mb-3">
                        {usuario.nombre.charAt(0).toUpperCase()}
                      </div>
                      <div className="text-sm font-semibold tracking-tight text-black dark:text-zinc-100 truncate">
                        {usuario.nombre}
                      </div>
                      <div className="text-[11px] font-mono text-zinc-400 dark:text-zinc-500 truncate mt-0.5">
                        {usuario.email}
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-between">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full border border-zinc-300 dark:border-zinc-700 bg-zinc-100/80 dark:bg-zinc-800/80 text-[10px] font-mono font-medium uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                        {usuario.rol}
                      </span>
                      {esActivo && (
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Formulario Manual estilo Vercel */}
        <div className="w-full max-w-md pt-6 border-t border-black/[.08] dark:border-white/[.145]">
          <h3 className="text-sm font-medium tracking-tight text-black dark:text-zinc-100 mb-1">
            O inicia con credenciales
          </h3>
          <p className="text-xs text-zinc-500 mb-4">
            Ingresa tu correo electrónico y contraseña.
          </p>

          <form onSubmit={manejarSubmitManual} className="flex flex-col gap-3">
            <div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="correo@farmacia.com"
                required
                className="w-full h-10 rounded-lg border border-solid border-black/[.08] dark:border-white/[.145] bg-transparent px-3 text-sm text-black dark:text-white placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-black dark:focus:ring-white transition-colors"
              />
            </div>

            <div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Contraseña"
                required
                className="w-full h-10 rounded-lg border border-solid border-black/[.08] dark:border-white/[.145] bg-transparent px-3 text-sm text-black dark:text-white placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-black dark:focus:ring-white transition-colors"
              />
            </div>

            {errorLogin && (
              <div className="p-3 rounded-lg border border-red-500/30 bg-red-500/[.05] text-xs font-mono text-red-600 dark:text-red-400">
                {errorLogin}
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <button
                type="submit"
                disabled={procesando}
                className="flex h-10 flex-1 cursor-pointer items-center justify-center rounded-full bg-black text-white hover:bg-[#383838] dark:bg-white dark:text-black dark:hover:bg-[#ccc] text-sm font-medium transition-colors disabled:opacity-50"
              >
                {procesando ? 'Verificando...' : 'Iniciar Sesión'}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}

export default function Login() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-black font-mono text-xs text-zinc-500">
          Cargando sesión...
        </div>
      }
    >
      <ContenidoLogin />
    </Suspense>
  );
}
