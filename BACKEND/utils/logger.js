const pool = require('../db');

/**
 * Crea o actualiza el trigger de auditoría en la base de datos.
 * Este trigger captura INSERT/UPDATE/DELETE y genera logs con:
 * - Usuario real de la app (no el de PostgreSQL)
 * - Entity ID correcto según la tabla
 */
const createLogsTable = async () => {
    // Índices para optimización (ejecutados individualmente para evitar fallos en bloque)
    try { await pool.query("CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);"); } catch (e) { console.warn('Aviso índice created_at:', e.message); }
    try { await pool.query("CREATE INDEX IF NOT EXISTS idx_audit_logs_composite ON audit_logs(table_name, operation, created_at);"); } catch (e) { console.warn('Aviso índice composite:', e.message); }
    try { await pool.query("CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_id);"); } catch (e) { console.warn('Aviso índice entity:', e.message); }
    try { await pool.query("CREATE INDEX IF NOT EXISTS idx_audit_logs_before_json ON audit_logs USING GIN (before_data);"); } catch (e) { console.warn('Aviso índice GIN before:', e.message); }
    try { await pool.query("CREATE INDEX IF NOT EXISTS idx_audit_logs_after_json ON audit_logs USING GIN (after_data);"); } catch (e) { console.warn('Aviso índice GIN after:', e.message); }

    const query = `
        CREATE OR REPLACE FUNCTION audit_trigger()
        RETURNS trigger AS $$
        DECLARE
            v_user_cuil TEXT;
            v_user_name TEXT;
            v_entity_id TEXT;
        BEGIN
            -- Obtener usuario de sesión
            BEGIN
                v_user_cuil := current_setting('app.user_cuil', true);
            EXCEPTION WHEN OTHERS THEN
                v_user_cuil := NULL;
            END;

            -- Buscar nombre completo
            v_user_name := NULL;
            IF v_user_cuil IS NOT NULL THEN
                SELECT nombre_apellido INTO v_user_name
                FROM usuario
                WHERE cuil = v_user_cuil
                LIMIT 1;
            END IF;

            -- ENTITY_ID según la tabla (evita acceder a campos que no existen)
            v_entity_id := NULL;

            IF TG_TABLE_NAME IN ('usuario', 'chofer') THEN
                IF TG_OP = 'DELETE' THEN
                    v_entity_id := OLD.cuil::text;
                ELSE
                    v_entity_id := NEW.cuil::text;
                END IF;

            ELSIF TG_TABLE_NAME IN ('cliente', 'proveedor') THEN
                IF TG_OP = 'DELETE' THEN
                    v_entity_id := OLD.cuit::text;
                ELSE
                    v_entity_id := NEW.cuit::text;
                END IF;

            ELSIF TG_TABLE_NAME IN ('pagos_gasoil', 'pagos_otro', 'viaje') THEN
                IF TG_OP = 'DELETE' THEN
                    v_entity_id := OLD.comprobante::text;
                ELSE
                    v_entity_id := NEW.comprobante::text;
                END IF;

            ELSIF TG_TABLE_NAME = 'carta_porte' THEN
                IF TG_OP = 'DELETE' THEN
                    v_entity_id := OLD.viaje_comprobante::text;
                ELSE
                    v_entity_id := NEW.viaje_comprobante::text;
                END IF;

            ELSIF TG_TABLE_NAME = 'pagos_cheque' THEN
                IF TG_OP = 'DELETE' THEN
                    v_entity_id := OLD.nro::text;
                ELSE
                    v_entity_id := NEW.nro::text;
                END IF;

            ELSIF TG_TABLE_NAME IN ('factura', 'factura_arca') THEN
                IF TG_OP = 'DELETE' THEN
                    v_entity_id := OLD.id::text;
                ELSE
                    v_entity_id := NEW.id::text;
                END IF;

            ELSIF TG_TABLE_NAME = 'viaje_cliente' THEN
                IF TG_OP = 'DELETE' THEN
                    v_entity_id := OLD.viaje_comprobante::text;
                ELSE
                    v_entity_id := NEW.viaje_comprobante::text;
                END IF;
            END IF;

            -- INSERT
            IF TG_OP = 'INSERT' THEN
                INSERT INTO audit_logs(
                    table_name, operation, user_cuil, user_name, entity_id, after_data, created_at
                )
                VALUES (
                    TG_TABLE_NAME,
                    'INSERT',
                    v_user_cuil,
                    v_user_name,
                    v_entity_id,
                    to_jsonb(NEW),
                    now()
                );
                RETURN NEW;

            -- UPDATE
            ELSIF TG_OP = 'UPDATE' THEN
                INSERT INTO audit_logs(
                    table_name, operation, user_cuil, user_name, entity_id, before_data, after_data, created_at
                )
                VALUES (
                    TG_TABLE_NAME,
                    'UPDATE',
                    v_user_cuil,
                    v_user_name,
                    v_entity_id,
                    to_jsonb(OLD),
                    to_jsonb(NEW),
                    now()
                );
                RETURN NEW;

            -- DELETE
            ELSIF TG_OP = 'DELETE' THEN
                INSERT INTO audit_logs(
                    table_name, operation, user_cuil, user_name, entity_id, before_data, created_at
                )
                VALUES (
                    TG_TABLE_NAME,
                    'DELETE',
                    v_user_cuil,
                    v_user_name,
                    v_entity_id,
                    to_jsonb(OLD),
                    now()
                );
                RETURN OLD;
            END IF;

            RETURN NULL;
        END;
        $$ LANGUAGE plpgsql;
    `;

    try {
        const result = await pool.query(query);
        console.log(result);
        console.log('[Logger] Trigger de auditoría actualizado correctamente');

        // Crear trigger para la tabla proveedor si no existe
        await pool.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.triggers 
                    WHERE trigger_name = 'audit_trigger_proveedor' 
                    AND event_object_table = 'proveedor'
                ) THEN
                    CREATE TRIGGER audit_trigger_proveedor
                    AFTER INSERT OR UPDATE OR DELETE ON proveedor
                    FOR EACH ROW EXECUTE FUNCTION audit_trigger();
                    RAISE NOTICE 'Trigger audit_trigger_proveedor creado';
                END IF;
            END $$;
        `);
        console.log('[Logger] Trigger de proveedor verificado/creado');

    } catch (error) {
        console.error("Error al actualizar trigger de auditoría:", error);
    }
};

module.exports = { createLogsTable };
