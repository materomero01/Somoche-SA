const validateUser = (data) => {
    const errors = [];
    const validatedData = {};

    // Campos requeridos y sus reglas
    const requiredFields = {
        cuil: { type: 'string', required: true, regex: /^\d{2}-\d{7,9}-\d{1}$/ },
        nombre: { type: 'string', required: true },
        password: { type: 'string', required: true },
        trabajador: { type: 'string', required: true, enum: ['Monotributista', 'Responsable Inscripto'] },
        patente_chasis: { type: 'string', required: true, regex: /^(?:[A-Za-z]{3} \d{3}|[A-Za-z]{2} \d{3} [A-Za-z]{2})$/ },
        patente_acoplado: { type: 'string', required: false, default: null, regex: /^(?:[A-Za-z]{3} \d{3}|[A-Za-z]{2} \d{3} [A-Za-z]{2})$/ },
        telefono: { type: 'number', required: false, default: null },
        email: { type: 'string', required: false, default: null, regex: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
        role: { type: 'string', required: false, default: 'chofer', enum: ['chofer', 'admin'] }
    };

    // Validar solo los campos presentes en data
    for (const key of Object.keys(data)) {
        const value = data[key];
        const rules = requiredFields[key];

        // Si el campo no está en requiredFields, incluirlo en validatedData sin validar
        if (!rules) {
            validatedData[key] = value;
            continue;
        }

        // NUEVA LÓGICA: Convertir cadena vacía a null para campos opcionales ANTES de cualquier validación
        if (value === '' && !rules.required) {
            validatedData[key] = null;
            continue; // Saltar el resto de las validaciones para este campo
        }

        // Verificar si el campo requerido está presente (y no es cadena vacía)
        // La validación de cadena vacía para requeridos se hizo en el bloque anterior,
        // pero aquí se asegura que si es requerido, no sea undefined, null o cadena vacía.
        if (rules.required && (value === undefined || value === null || (typeof value === 'string' && value.trim() === ''))) {
            errors.push(key);
            continue;
        }

        // Aplicar valor por defecto si no está presente (y es undefined, no cadena vacía)
        if (value === undefined && !rules.required && rules.default !== undefined) {
            validatedData[key] = rules.default;
            continue;
        }

        // Validar tipo y manejar valores
        // Esta parte ahora solo se ejecuta si el valor no es undefined, null, ni cadena vacía (si es opcional)
        if (value !== undefined && value !== null) {
            if (rules.type === 'string') {
                if (typeof value !== 'string') {
                    errors.push(key);
                    continue;
                }
                // Validar regex si existe y el valor no es null (ya manejado el vacío)
                if (rules.regex && !rules.regex.test(value)) {
                    errors.push(key);
                    continue;
                }

                if (['patente_chasis', 'patente_acoplado'].includes(key)){
                    validatedData[key] = value.toUpperCase();
                }
                else validatedData[key] = value; // Ya no necesitamos trim() === '' ? null : value; aquí
            } else if (rules.type === 'number') {
                const parsedValue = typeof value === 'string' ? parseFloat(value) : value;
                if (isNaN(parsedValue)) { // Esto ahora no debería fallar en '' porque se convierte a null antes
                    errors.push(key);
                    continue;
                }
                if (rules.min !== undefined && parsedValue < rules.min) {
                    errors.push(key);
                    continue;
                }
                validatedData[key] = parsedValue;
            } else if (rules.type === 'boolean') {
                if (typeof value !== 'boolean') {
                    errors.push(key);
                    continue;
                }
                validatedData[key] = value;
            }

            // Validar enum si existe
            if (rules.enum && !rules.enum.includes(value)) {
                errors.push(key);
                continue;
            }
        } else if (!rules.required) {
            // Asignar null a campos opcionales que son null (si vienen explícitamente como null del frontend)
            validatedData[key] = null;
        }
    }

    return { errors, validatedData };
};

module.exports = validateUser;