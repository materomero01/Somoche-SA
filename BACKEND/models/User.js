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

    // Validar cada campo
    for (const [key, rules] of Object.entries(requiredFields)) {
        let value = data[key];

        // Verificar si el campo requerido está presente
        if (rules.required && (value === undefined || value === null || (typeof value === 'string' && value.trim() === ''))) {
            errors.push(`El campo ${key} es obligatorio.`);
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
                    errors.push(`El campo ${key} debe ser una cadena.`);
                    continue;
                }
                // Validar regex si existe y el valor no es null
                if (rules.regex && !rules.regex.test(value)) {
                    errors.push(`El campo ${key} no cumple con el formato esperado.`);
                    continue;
                }
                validatedData[key] = value.trim() === '' ? null : value;
            } else if (rules.type === 'number') {
                const parsedValue = typeof value === 'string' ? parseFloat(value) : value;
                if (isNaN(parsedValue)) {
                    errors.push(`El campo ${key} debe ser un número válido.`);
                    continue;
                }
                if (rules.min !== undefined && parsedValue < rules.min) {
                    errors.push(`El campo ${key} debe ser mayor o igual a ${rules.min}.`);
                    continue;
                }
                validatedData[key] = parsedValue;
            } else if (rules.type === 'boolean') {
                if (typeof value !== 'boolean') {
                    errors.push(`El campo ${key} debe ser un booleano.`);
                    continue;
                }
                validatedData[key] = value;
            }

            // Validar enum si existe
            if (rules.enum && !rules.enum.includes(value)) {
                errors.push(`El campo ${key} debe ser uno de: ${rules.enum.join(', ')}.`);
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