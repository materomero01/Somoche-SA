// Función para parsear tarifa desde formato de moneda
const parseCurrency = (value) => {
    if (typeof value !== 'string') return NaN;
    const cleanValue = value.replace(/[^0-9.]/g, ''); // Elimina $, comas, etc.
    return parseFloat(cleanValue);
};

const validateViaje = (data) => {
    const errors = [];
    const validatedData = {};

    // Campos requeridos y sus tipos esperados
    const requiredFields = {
        cuil: { type: 'string', required: true },
        nombre: { type: 'string', required: true },
        fecha: { type: 'string', required: true },
        comprobante: { type: 'string', required: true, regex: /^(\d{4}-\d{8}|\d{11})$/ },
        campo: { type: 'string', required: true },
        kilometro: { type: 'number', required: true, min: 0 },
        tarifa: { type: 'string', required: true }, // Se valida como cadena, luego se parsea
        toneladas: { type: 'number', required: true, min: 0 },
        cargado: { type: 'number', required: true, min: 0 },
        descargado: { type: 'number', required: true, min: 0 },
        pagado: { type: 'boolean', required: false, default: false },
        variacion: { type: 'number', required: false, default: 0.1 }
    };

    // Validar cada campo
    for (const [key, rules] of Object.entries(requiredFields)) {
        const value = data[key];
        
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

        // Validar tipo
        if (value !== undefined) {
            if (rules.type === 'string' && typeof value !== 'string') {
                errors.push(`El campo ${key} debe ser una cadena.`);
            } else if (rules.type === 'number' && (isNaN(value) || typeof value !== 'number')) {
                errors.push(`El campo ${key} debe ser un número.`);
            } else if (rules.type === 'boolean' && typeof value !== 'boolean') {
                errors.push(`El campo ${key} debe ser un booleano.`);
            }

            // Validar regex para comprobante
            if (rules.regex && !rules.regex.test(value)) {
                errors.push(`El campo ${key} no cumple con el formato esperado (XXXX-XXXXXXXX o 11 dígitos).`);
            }

            // Validar valores mínimos para números
            if (rules.min !== undefined && !isNaN(value) && value <= rules.min) {
                errors.push(`El campo ${key} debe ser mayor a ${rules.min}.`);
            }

            // Parsear tarifa
            if (key === 'tarifa') {
                const parsedTarifa = parseCurrency(value);
                if (isNaN(parsedTarifa) || parsedTarifa <= 0) {
                    errors.push('La tarifa debe ser un número mayor a 0.');
                } else {
                    validatedData[key] = parsedTarifa;
                }
            } else {
                validatedData[key] = value;
            }
        }
    }

    return { errors, validatedData };
};

module.exports = validateViaje;