const pool = require('../db');

/**
 * Crea o actualiza el trigger de auditoría en la base de datos.
 * Este trigger captura INSERT/UPDATE/DELETE y genera logs con:
 * - Usuario real de la app (no el de PostgreSQL)
 * - Entity ID correcto según la tabla
 */
const createLogsTable = async () => {
    //const query = `SELECT trigger_name, event_manipulation, event_object_table, action_statement FROM information_schema.triggers WHERE trigger_schema = 'public';`
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

            ELSIF TG_TABLE_NAME = 'cliente' THEN
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
    } catch (error) {
        console.error("Error al actualizar trigger de auditoría:", error);
    }
};

module.exports = { createLogsTable };
