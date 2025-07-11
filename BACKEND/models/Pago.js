const pagoSchema = {
        tipo: { type: 'string', required: true, enum:['cheque', 'gasoil', 'otro']},
        fechaPago: { type: 'date', required: true }
}

const pagoChequeSchema = {
    ...pagoSchema,
    fechaCheque: { type: 'date', required: true },
    nroCheque: { type: 'number', required: true, min: 0 },
    tercero: { type: 'string', required: true },
    destinatario: { type: 'string', required: true },
    importe: { type: 'number', required: true, min: 0 }
}

const pagoGasoilSchema = {
    ...pagoSchema,
    precioGasoil: { type: 'number', required: true, min: 0 },
    litros: { type: 'number', required: true, min: 0 },
}

const pagoOtroSchema = {
    ...pagoSchema,
    detalle: { type: 'string', required: true },
    importe: { type: 'number', required: true, min: 0 },
}

const validatePago = (data) => {
    // Si data es un array, validar cada pago individualmente
    if (Array.isArray(data)) {
        const results = data.map((pago, index) => ({
            index,
            ...validateSinglePago(pago)
        }));
        return {
            errors: results.flatMap(r => r.errors.map(e => `Pago ${r.index + 1}: ${e}`)),
            validatedData: results.map(r => r.validatedData)
        };
    }
    // Si data es un objeto único, validar como tal
    return validateSinglePago(data);
};

const validateSinglePago = (data) => {
    const errors = [];
    const validatedData = {};
    let requiredFields;
    switch (data.tipo){
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
            errors.push("El tipo del pago no fue especificado");
            console.log("El tipo del pago no fue especificado");
    }

    // Validar cada campo
    for (const [key, rules] of Object.entries(requiredFields)) {
        let value = data[key];

        // Verificar si el campo requerido está presente
        if (rules.required && (value === undefined || value === null || (typeof value === 'string' && value.trim() === ''))) {
            errors.push(`El campo ${key} es obligatorio.`);
            console.log(`El campo ${key} es obligatorio.`);
            continue;
        }

        // Aplicar valor por defecto si no está presente
        if (value === undefined && !rules.required && rules.default !== undefined) {
            validatedData[key] = rules.default;
            continue;
        }

        // Validar tipo y manejar valores
        if (value !== undefined) {
            if (rules.type === 'string' && typeof value !== 'string') {
                errors.push(`El campo ${key} debe ser una cadena.`);
                console.log(`El campo ${key} debe ser una cadena.`);
            } else if (rules.type === 'number') {
                // Convertir a número si es una cadena
                const parsedValue = typeof value === 'string' ? parseFloat(value) : value;
                if (isNaN(parsedValue)) {
                    errors.push(`El campo ${key} debe ser un número válido.`);
                    console.log(`El campo ${key} debe ser un número válido.`);
                } else if (rules.min !== undefined && parsedValue < rules.min) {
                    errors.push(`El campo ${key} debe ser mayor o igual a ${rules.min}.`);
                    console.log(`El campo ${key} debe ser mayor o igual a ${rules.min}.`);
                } else if (key === 'nroCheque' && !Number.isInteger(parsedValue)) {
                    errors.push(`El campo ${key} debe ser un número entero.`);
                    console.log(`El campo ${key} debe ser un número entero.`);
                } else {
                    validatedData[key] = parsedValue;
                }
            } else if (rules.enum && !rules.enum.includes(value)) {
                errors.push(`El campo ${key} debe ser uno de: ${rules.enum.join(', ')}.`);
                console.log(`El campo ${key} debe ser uno de: ${rules.enum.join(', ')}.`);
            } else if (rules.type === 'string' && (key === 'fechaPago' || key === 'fechaCheque')) {
                // Validar formato de fecha ISO (YYYY-MM-DD)
                if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
                    errors.push(`El campo ${key} debe estar en formato YYYY-MM-DD.`);
                    console.log(`El campo ${key} debe estar en formato YYYY-MM-DD.`);
                } else {
                    validatedData[key] = value;
                }
            } else {
                validatedData[key] = value === '' ? null : value; // Convertir cadenas vacías a null
            }
        }
    }

    return { errors, validatedData };
};

module.exports = validatePago;