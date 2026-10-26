import { NextRequest, NextResponse } from 'next/server';
import {
    APPWRITE_CONFIG,
    createAdminClient,
    createSessionClient,
    Query,
} from '@/lib/appwrite/server';
import { Client, Account } from 'node-appwrite';
import type { Usuario } from '@/types/database';

/**
 * Valida la identidad y los privilegios de un administrador antes de ejecutar
 * operaciones protegidas en los Route Handlers de Next.js.
 *
 * Estrategia de autenticación:
 * 1. Token JWT firmado por Appwrite (cookie `farmacia_jwt`).
 * 2. Secreto de sesión nativo de Appwrite (cookie `farmacia_session`, `appwrite-session` o `a_session_*`).
 * 3. Identificador de usuario registrado y activo en Appwrite Auth (cookie `farmacia_session`).
 *
 * Finalmente, verifica en la tabla `Usuarios` que el registro asociado posea `rol: 'admin'`.
 *
 * @returns `null` si el usuario está autenticado y tiene rol administrativo;
 *          un `NextResponse` con código 401, 403 o 500 en caso contrario.
 */
export async function validarAdmin(request: NextRequest): Promise<NextResponse | null> {
    const sesion =
        request.cookies.get('farmacia_session')?.value ||
        request.cookies.get('appwrite-session')?.value ||
        request.cookies.get(`a_session_${APPWRITE_CONFIG.projectId}`)?.value;

    const jwtCookie = request.cookies.get('farmacia_jwt')?.value;

    if (!sesion && !jwtCookie) {
        return NextResponse.json(
            { error: 'Debes iniciar sesión' },
            { status: 401 }
        );
    }

    let email: string | null = null;

    if (jwtCookie) {
        try {
            const client = new Client()
                .setEndpoint(APPWRITE_CONFIG.endpoint)
                .setProject(APPWRITE_CONFIG.projectId)
                .setJWT(jwtCookie);
            const cuenta = await new Account(client).get();
            if (cuenta.emailVerification) {
                email = cuenta.email;
            }
        } catch {
            // Ignorar y probar método de sesión alternativo
        }
    }

    if (!email && sesion) {
        try {
            const { account } = createSessionClient(sesion);
            const cuenta = await account.get();

            if (!cuenta.emailVerification) {
                return NextResponse.json(
                    { error: 'Debes verificar tu correo' },
                    { status: 403 }
                );
            }

            email = cuenta.email;
        } catch {
            // No es un token de sesión opaco de Appwrite
        }
    }

    if (!email && sesion) {
        try {
            const { users } = createAdminClient();
            const usuarioAuth = await users.get(sesion);

            if (!usuarioAuth.status) {
                return NextResponse.json(
                    { error: 'Cuenta de usuario deshabilitada' },
                    { status: 403 }
                );
            }

            if (!usuarioAuth.emailVerification) {
                return NextResponse.json(
                    { error: 'Debes verificar tu correo' },
                    { status: 403 }
                );
            }

            email = usuarioAuth.email;
        } catch {
            // Identificador de usuario no encontrado en Auth
        }
    }

    if (!email) {
        return NextResponse.json(
            { error: 'Sesión inválida o expirada' },
            { status: 401 }
        );
    }

    try {
        const { tablesDB } = createAdminClient();

        const resultado = await tablesDB.listRows<Usuario>({
            databaseId: APPWRITE_CONFIG.databaseId,
            tableId: APPWRITE_CONFIG.tables.usuarios,
            queries: [
                Query.equal('email', email),
                Query.limit(2),
            ],
        });

        if (
            resultado.total !== 1 ||
            resultado.rows[0]?.rol !== 'admin'
        ) {
            return NextResponse.json(
                { error: 'Acceso exclusivo para administradores' },
                { status: 403 }
            );
        }

        return null;
    } catch (error) {
        console.error('Error verificando administrador:', error);

        return NextResponse.json(
            { error: 'No se pudo validar el acceso' },
            { status: 500 }
        );
    }
}
