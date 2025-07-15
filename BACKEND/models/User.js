const validateUser = (data) => {
    const errors = [];
    const validatedData = {};

    // Campos requeridos y sus reglas
    const requiredFields = {
        cuil: { type: 'string', required: true, regex: /^\d{2}-\d{8}-\d{1}$/ },
        nombre_y_apellido: { type: 'string', required: true },
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
        console.log(key + " " + value)

        // Si el campo no está en requiredFields, incluirlo en validatedData sin validar
        if (!rules) {
            validatedData[key] = value;
            continue;
        }

        // Verificar si el campo requerido está presente
        if (rules.required && (value === undefined || value === null || (typeof value === 'string' && value.trim() === ''))) {
            errors.push(key);
            continue;
        }

        // Aplicar valor por defecto si no está presente
        if (value === undefined && !rules.required && rules.default !== undefined) {
            validatedData[key] = rules.default;
            continue;
        }

        // Validar tipo y manejar valores
        if (value !== undefined && value !== null) {
            if (rules.type === 'string') {
                if (typeof value !== 'string') {
                    errors.push(key);
                    continue;
                }
                // Validar regex si existe y el valor no es null
                if (rules.regex && !rules.regex.test(value)) {
                    errors.push(key);
                    continue;
                }
                validatedData[key] = value.trim() === '' ? null : value;
            } else if (rules.type === 'number') {
                const parsedValue = typeof value === 'string' ? parseFloat(value) : value;
                if (isNaN(parsedValue)) {
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
            // Asignar null a campos opcionales que son null
            validatedData[key] = null;
        }
    }

    return { errors, validatedData };
};

module.exports = validateUser;