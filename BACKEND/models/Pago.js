    // Función para validar si es una fecha válida
const isValidDate = (value) => {
    if (typeof value !== 'string') return false;
    const date = Date.parse(value);
    return !isNaN(date); // Verifica si la fecha es parseable
};

const pagoSchema = {
    tipo: { type: 'string', required: true, enum: ['cheque', 'gasoil', 'otro'], error: 'El tipo debe ser uno de: cheque, gasoil, otro.' },
    fecha_pago: { type: 'date', required: true, validate: isValidDate, error: 'La fechaPago debe ser una fecha válida en formato YYYY-MM-DD.' },
    group: { type: 'date', required: false, validate: isValidDate, error: 'El grupo debe ser una fecha válida en formato YYYY-MM-DD.' }
};

const pagoChequeSchema = {
    ...pagoSchema,
    fecha_cheque: { type: 'date', required: true, validate: isValidDate, error: 'La fechaCheque debe ser una fecha válida en formato YYYY-MM-DD.' },
    nroCheque: { type: 'number', required: true, min: 0, integer: true, error: 'El nroCheque debe ser un número entero mayor o igual a 0.' },
    tercero: { type: 'string', required: true, error: 'El tercero es obligatorio.' },
    destinatario: { type: 'string', required: true, error: 'El destinatario es obligatorio.' },
    importe: { type: 'number', required: true, min: 0, error: 'El importe debe ser un número mayor o igual a 0.' },
    cliente_cuit: { type: 'string', required: false, default: null, regex: /^\d{2}-\d{7,9}-\d{1}$/, error: 'El Cuit del cliente no es valido'},
    proveedor_cuit: { type: 'string', required: false, default: null, regex: /^\d{2}-\d{7,9}-\d{1}$/, error: 'El Cuit del proveedor no es valido'},
    chofer_cuil: { type: 'string', required: false, default: null, regex: /^\d{2}-\d{7,9}-\d{1}$/, error: 'El Cuil del chofer no es valido'},
    pagado: { type: 'boolean', required: false, default: false, error: 'El pagado debe ser un booleano.' }
};

const pagoGasoilSchema = {
    ...pagoSchema,
    proveedor_cuit: { type: 'string', required: true, default: null, regex: /^\d{2}-\d{7,9}-\d{1}$/, error: 'El Cuit del proveedor no es valido'},
    comprobante: { type: 'string', required: true, error: 'El comprobante de la orden de gasoil no fue ingresado o no es válido'},
    precioGasoil: { type: 'number', required: true, min: 0, error: 'El precioGasoil debe ser un número mayor o igual a 0.' },
    litros: { type: 'number', required: true, min: 0, error: 'Los litros deben ser un número mayor o igual a 0.' }
};

const pagoOtroSchema = {
    ...pagoSchema,
    comprobante: { type: 'string', required: true, error: 'El comprobante del pago no fue ingresado o no es válido'},
    detalle: { type: 'string', required: true, error: 'El detalle es obligatorio.' },
    importe: { type: 'number', required: true, min: 0, error: 'El importe debe ser un número mayor o igual a 0.' }
};

const validatePago = (data, partial = false) => {
    // Si data es un array, validar cada pago individualmente
    if (Array.isArray(data)) {
        const results = data.map((pago, index) => ({
            index,
            ...validateSinglePago(pago, partial)
        }));
        return {
            errors: results.flatMap(r => r.errors.map(e => `Pago ${r.index + 1}: ${e}`)),
            validatedData: results.map(r => r.validatedData)
        };
    }
    // Si data es un objeto único, validar como tal
    return validateSinglePago(data, partial);
};

const validateSinglePago = (data, partial = false) => {
    const errors = [];
    const validatedData = {};

    // Determinar el esquema según el tipo de pago
    let requiredFields;
    if (!data || !data.tipo) {
        errors.push('El tipo del pago no fue especificado.');
        return { errors, validatedData };
    }
    switch (data.tipo.toLowerCase()) {
        case 'cheque':
            requiredFields = pagoChequeSchema;
            break;
        case 'gasoil':
            requiredFields = pagoGasoilSchema;
            break;
        case 'otro':
            requiredFields = pagoOtroSchema;
            break;
        default:
            errors.push('El tipo del pago debe ser uno de: cheque, gasoil, otro.');
            return { errors, validatedData };
    }

    // Validar cada campo
    for (const [key, rules] of Object.entries(requiredFields)) {
        let value = data[key];

        // Para validación completa (insert), los campos requeridos deben estar presentes
        if (!partial && rules.required && (value === undefined || value === null || (typeof value === 'string' && value.trim() === ''))) {
            errors.push(rules.error);
            continue;
        }

        // Para validación parcial (update), ignorar campos no proporcionados
        if ((partial || !rules.required) && (value === undefined || value === null)) {
            continue;
        }

        // Validar tipo y manejar valores
        if (value !== undefined) {
            if (rules.type === 'string' && typeof value !== 'string') {
                errors.push(`El campo ${key} debe ser una cadena.`);
            } else if (rules.type === 'number') {
                const parsedValue = typeof value === 'string' ? parseFloat(value) : value;
                if (isNaN(parsedValue)) {
                    console.log(data.tipo);
                    errors.push(rules.error);
                } else if (rules.min !== undefined && data.tipo.toLowerCase() !== 'otro' && parsedValue < rules.min  ) {
                    errors.push(rules.error);
                } else if (rules.integer && !Number.isInteger(parsedValue)) {
                    console.log(data.tipo + " 1");
                    errors.push(rules.error);
                } else {
                    validatedData[key] = parsedValue;
                }
            } else if (rules.type === 'boolean' && typeof value !== 'boolean') {
                errors.push(rules.error);
            } else if (rules.type === 'date' && !rules.validate(value)) {
                errors.push(rules.error);
            } else if (rules.enum && !rules.enum.includes(value.toLowerCase())) {
                errors.push(rules.error);
            } else {
                validatedData[key] = value === '' ? null : value;
            }
        }

        // Validar regex para comprobante
        if (rules.regex && !rules.regex.test(value)) {
            errors.push(rules.error);
        }

        // Aplicar valor por defecto si no está presente y no es requerido
        if (value === undefined && !rules.required && rules.default !== undefined) {
            validatedData[key] = rules.default;
        }
    }

    return { errors, validatedData };
};

module.exports = validatePago;