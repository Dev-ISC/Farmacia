'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { account, tablesDB, APPWRITE_CONFIG, Query } from '@/lib/appwrite/client';
import type { Usuario } from '@/types/database';

/**
 * Helper fuera del componente para escribir las cookies de sesión sin violar
 * la regla `react-hooks/immutability` del compilador de React.
 */
function escribirCookiesSesion(usuarioId: string, rol: Usuario['rol']) {
  if (typeof document === 'undefined') return;
  document.cookie = `farmacia_session=${encodeURIComponent(usuarioId)}; path=/; max-age=86400; SameSite=Lax`;
  document.cookie = `farmacia_rol=${encodeURIComponent(rol)}; path=/; max-age=86400; SameSite=Lax`;
}

function limpiarCookiesSesion() {
  if (typeof document === 'undefined') return;
  document.cookie = 'farmacia_session=; path=/; max-age=0; SameSite=Lax';
  document.cookie = 'farmacia_rol=; path=/; max-age=0; SameSite=Lax';
}

export default function Login() {
  const router = useRouter();
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [cargando, setCargando] = useState<boolean>(true);

  // Estados para validación de login por correo y contraseña
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [validando, setValidando] = useState<boolean>(false);
  const [errorLogin, setErrorLogin] = useState<string | null>(null);

  // 1. Obtener la lista de usuarios desde la tabla `Usuarios` en Appwrite (TablesDB)
  useEffect(() => {
    const cargarUsuarios = async () => {
      try {
        const respuesta = await tablesDB.listRows<Usuario>({
          databaseId: APPWRITE_CONFIG.databaseId,
          tableId: APPWRITE_CONFIG.tables.usuarios,
          queries: [Query.limit(50)],
        });
        setUsuarios(respuesta.rows);
      } catch (error) {
        console.error('Error al cargar usuarios desde Appwrite:', error);
      } finally {
        setCargando(false);
      }
    };

    cargarUsuarios();
  }, []);

  // Guardar cookies y redirigir según el rol del usuario validado
  const guardarCookiesYRedirigir = (usuario: Usuario) => {
    escribirCookiesSesion(usuario.$id, usuario.rol);

    if (usuario.rol === 'admin') {
      router.push('/servidor');
    } else {
      router.push('/cliente');
    }
  };

  // 2. Validar inicio de sesión por formulario (Tabla Usuarios + Appwrite Auth)
  const manejarSubmitLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorLogin(null);

    const correoLimpio = email.trim().toLowerCase();
    if (!correoLimpio) {
      setErrorLogin('Por favor ingresa tu correo electrónico.');
      return;
    }

    setValidando(true);

    try {
      // Primero verificamos que el usuario exista en la tabla `Usuarios` sin destruir la sesión actual
      const resultado = await tablesDB.listRows<Usuario>({
        databaseId: APPWRITE_CONFIG.databaseId,
        tableId: APPWRITE_CONFIG.tables.usuarios,
        queries: [Query.equal('email', correoLimpio), Query.limit(1)],
      });

      const usuarioEncontrado = resultado.rows[0];

      if (!usuarioEncontrado) {
        setErrorLogin('El usuario no existe en la tabla Usuarios de la farmacia.');
        return;
      }

      // Si ingresó contraseña, autenticamos en Appwrite Auth manteniendo consistencia con la sesión
      if (password.trim()) {
        try {
          await account.createEmailPasswordSession({
            email: correoLimpio,
            password,
          });
        } catch {
          // Si ya existía una sesión previa activa en el navegador, la reemplazamos solo tras validar credenciales
          try {
            await account.deleteSession({ sessionId: 'current' });
          } catch {
            // Ignorar si no había sesión activa
          }

          try {
            await account.createEmailPasswordSession({
              email: correoLimpio,
              password,
            });
          } catch (retryErr) {
            limpiarCookiesSesion();
            throw retryErr;
          }
        }
      }

      // En `farmacia_session` guardamos siempre el ID canónico del usuario (`usuarioEncontrado.$id`)
      guardarCookiesYRedirigir(usuarioEncontrado);
    } catch (err) {
      const mensaje =
        err instanceof Error
          ? err.message
          : 'Credenciales inválidas o error al validar con Appwrite.';
      setErrorLogin(mensaje);
    } finally {
      setValidando(false);
    }
  };

  // 3. Selección rápida desde las tarjetas de usuario
  const iniciarSesionConPerfil = (usuario: Usuario) => {
    guardarCookiesYRedirigir(usuario);
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-zinc-950 px-4 py-12">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-white mb-3">
          Farmacia Doctor Simi
        </h1>
        <h2 className="text-2xl font-semibold text-zinc-300 mb-2">
          Bienvenido a la Plataforma de Farmacia
        </h2>
        <p className="text-zinc-400 text-lg">
          Inicia sesión o selecciona tu perfil
        </p>
      </div>

      {/* Formulario de Validación de Usuario (Appwrite Auth + Tabla Usuarios) */}
      <form
        onSubmit={manejarSubmitLogin}
        className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-6 mb-10 space-y-4 shadow-xl"
      >
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1">
            Correo electrónico
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ejemplo@farmacia.com"
            required
            className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-4 py-2.5 text-white placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1">
            Contraseña
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-4 py-2.5 text-white placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
          />
        </div>

        {errorLogin && (
          <p className="text-sm text-red-400 bg-red-950/50 border border-red-800 rounded-lg p-3">
            {errorLogin}
          </p>
        )}

        <button
          type="submit"
          disabled={validando}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-700 text-white font-semibold py-2.5 px-4 rounded-lg transition-colors cursor-pointer"
        >
          {validando ? 'Validando usuario...' : 'Iniciar Sesión'}
        </button>
      </form>

      {/* Grid de Perfiles obtenidos desde Appwrite */}
      {cargando ? (
        <p className="text-zinc-400">Cargando usuarios...</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-6 max-w-3xl w-full">
          {usuarios.map((usuario) => (
            <button
              key={usuario.$id}
              type="button"
              onClick={() => iniciarSesionConPerfil(usuario)}
              className="group flex flex-col items-center gap-4 p-6 bg-zinc-900 border border-zinc-800 rounded-2xl hover:bg-zinc-800 hover:border-blue-500 transition-all duration-300 transform hover:-translate-y-2 cursor-pointer"
            >
              {/* Avatar circular con la inicial del nombre */}
              <div className="w-24 h-24 rounded-full bg-blue-600 flex items-center justify-center text-3xl font-bold text-white shadow-lg group-hover:scale-110 transition-transform">
                {usuario.nombre.charAt(0).toUpperCase()}
              </div>

              <div className="text-center">
                <h2 className="text-xl font-semibold text-zinc-300 group-hover:text-white transition-colors">
                  {usuario.nombre}
                </h2>
                <p className="text-xs text-zinc-500 mt-1">{usuario.email}</p>
              </div>

              <span className="text-xs text-zinc-500 bg-zinc-950 px-3 py-1 rounded-full uppercase tracking-wider">
                {usuario.rol}
              </span>
            </button>
          ))}
        </div>
      )}
    </main>
  );
}
