import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import type { RolUsuario } from '@/types/database';

/**
 * Constantes de nombres de cookies para autenticación y control de acceso.
 * Tus compañeros de Autenticación pueden guardar cualquiera de estas cookies al iniciar sesión:
 * - `farmacia_session` o `a_session_<PROJECT_ID>`: Token/ID de sesión activa.
 * - `farmacia_rol` o `user_role`: Rol del usuario ('admin' | 'cliente').
 */
export const AUTH_COOKIES = {
  session: 'farmacia_session',
  role: 'farmacia_rol',
} as const;

/**
 * Extrae la sesión activa desde las cookies de la petición.
 * Soporta tanto la cookie estándar del proyecto (`farmacia_session`)
 * como la cookie nativa de Appwrite (`a_session_<projectId>`).
 */
function obtenerSesionActiva(request: NextRequest): string | undefined {
  const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || '';

  const customSession = request.cookies.get(AUTH_COOKIES.session)?.value;
  if (customSession) return customSession;

  const genericSession = request.cookies.get('appwrite-session')?.value;
  if (genericSession) return genericSession;

  if (projectId) {
    const appwriteCookie =
      request.cookies.get(`a_session_${projectId}`)?.value ||
      request.cookies.get(`a_session_${projectId}_legacy`)?.value;
    if (appwriteCookie) return appwriteCookie;
  }

  // Fallback: busca cualquier cookie que comience con `a_session_`
  const anyAppwriteSession = request.cookies
    .getAll()
    .find((cookie) => cookie.name.startsWith('a_session_'))?.value;

  return anyAppwriteSession;
}

/**
 * Extrae el rol del usuario ('admin' | 'cliente') desde las cookies.
 */
function obtenerRolUsuario(request: NextRequest): RolUsuario | undefined {
  const rol =
    request.cookies.get(AUTH_COOKIES.role)?.value ||
    request.cookies.get('user_role')?.value ||
    request.cookies.get('rol')?.value;

  if (rol === 'admin' || rol === 'cliente') {
    return rol;
  }

  return undefined;
}

/**
 * Middleware de Protección de Rutas:
 * 1. Protege `/servidor/:path*` validando sesión activa y rol `'admin'`.
 *    - Si no hay sesión -> redirige a `/login`.
 *    - Si el rol es `'cliente'` (o distinto de `'admin'`) -> redirige a `/cliente`.
 * 2. Protege `/cliente/:path*` validando sesión activa.
 *    - Si no hay sesión -> redirige a `/login`.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sesion = obtenerSesionActiva(request);
  const rol = obtenerRolUsuario(request);

  // 1. Protección de la Interfaz Servidor (/servidor y subrutas)
  if (pathname.startsWith('/servidor')) {
    if (!sesion) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }

    if (rol === 'cliente' || rol !== 'admin') {
      return NextResponse.redirect(new URL('/cliente', request.url));
    }

    return NextResponse.next();
  }

  // 2. Protección de la Interfaz Cliente (/cliente y subrutas como /cliente/carrito)
  if (pathname.startsWith('/cliente')) {
    if (!sesion) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }

    return NextResponse.next();
  }

  return NextResponse.next();
}

/**
 * En Next.js 16, la convención `middleware` también puede exportarse como `proxy`.
 * Exportamos ambos para máxima compatibilidad.
 */
export const middleware = proxy;

export const config = {
  matcher: [
    '/servidor',
    '/servidor/:path*',
    '/cliente',
    '/cliente/:path*',
  ],
};
