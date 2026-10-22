
import { NextRequest, NextResponse } from 'next/server';
import {
    APPWRITE_CONFIG,
    createAdminClient,
    Query,
} from '@/lib/appwrite/server';
import { validarAdmin } from '@/lib/auth/validar-admin';

export async function GET(request: NextRequest) {
    const accesoDenegado = await validarAdmin(request);
    if (accesoDenegado) return accesoDenegado;

    try {
        const { tablesDB } = createAdminClient();

        const resultado = await tablesDB.listRows({
            databaseId: APPWRITE_CONFIG.databaseId,
            tableId: APPWRITE_CONFIG.tables.pedidos,
            queries: [
                Query.orderDesc('$createdAt'),
                Query.limit(100),
            ],
        });

        return NextResponse.json({
            total: resultado.total,
            pedidos: resultado.rows,
        });
    } catch (error) {
        console.error('Error al consultar pedidos:', error);

        return NextResponse.json(
            { error: 'No se pudieron obtener los pedidos' },
            { status: 500 }
        );
    }
}
