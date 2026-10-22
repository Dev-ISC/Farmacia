
import { NextRequest, NextResponse } from 'next/server';
import {
    APPWRITE_CONFIG,
    createAdminClient,
    createSessionClient,
    Query,
} from '@/lib/appwrite/server';
import type { Usuario } from '@/types/database';

export async function validarAdmin(request: NextRequest) {
    const sesion =
        request.cookies.get('farmacia_session')?.value ||
        request.cookies.get('appwrite-session')?.value ||
        request.cookies.get(
            `a_session_${APPWRITE_CONFIG.projectId}`
        )?.value;

    if (!sesion) {
        return NextResponse.json(
            { error: 'Debes iniciar sesión' },
            { status: 401 }
        );
    }

    let email: string;

    try {
        // La cookie debe contener un secreto de sesión REAL
        // emitido por Appwrite, no un ID de usuario.
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
