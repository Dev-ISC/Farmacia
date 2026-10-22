
import { NextResponse } from 'next/server';
import {
    createAdminClient,
    APPWRITE_CONFIG,
    Query,
} from '@/lib/appwrite/server';

export async function GET() {
    try {
        const { tablesDB } = createAdminClient();

        const resultado = await tablesDB.listRows({
            databaseId: APPWRITE_CONFIG.databaseId,
            tableId: APPWRITE_CONFIG.tables.categorias,
            queries: [Query.limit(100)],
        });

        const categorias = resultado.rows.map((categoria) => ({
            id: categoria.$id,
            nombre: categoria.nombre,
        }));

        return NextResponse.json({
            total: resultado.total,
            categorias,
        });
    } catch (error) {
        console.error('Error al obtener categorías:', error);

        return NextResponse.json(
            { error: 'No se pudieron obtener las categorías' },
            { status: 500 }
        );
    }
}
