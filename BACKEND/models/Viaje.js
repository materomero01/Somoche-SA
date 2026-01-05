// Función para parsear tarifa desde formato de moneda
const parseCurrency = (value) => {
    if (typeof value !== 'string') return NaN;
    const cleanValue = value.replace(/[^0-9.]/g, ''); // Elimina $, comas, etc.
    return parseFloat(cleanValue);
};

// Función para validar si es una fecha válida
const isValidDate = (value) => {
    if (typeof value !== 'string') return false;
    const date = Date.parse(value);
    return !isNaN(date); // Verifica si la fecha es parseable
};

const validateViaje = (data, partial = false) => {
    const errors = [];
    const validatedData = {};

    // Campos y sus reglas de validación
    const fields = {
        chofer_cuil: { type: 'string', required: true, regex: /^\d{2}-\d{8}-\d{1}$/, error: 'El CUIL es obligatorio.' },
        cliente_cuit: { type: 'string', required: true, regex: /^\d{2}-\d{8}-\d{1}$/, error: 'El CUIT del cliente es obligatorio.' },
        nombre: { type: 'string', required: true, error: 'El nombre es obligatorio.' },
        fecha: { type: 'string', required: true, error: 'La fecha es obligatoria.', validate: isValidDate },
        comprobante: { type: 'string', required: true, regex: /^(\d{4}-\d{8}|\d{11})$/, error: 'El comprobante debe cumplir con el formato XXXX-XXXXXXXX o 11 dígitos.' },
        campo: { type: 'string', required: true, error: 'El campo es obligatorio.' },
        producto: { type: 'string', required: true, error: 'El producto es obligatorio.' },
        kilometros: { type: 'number', required: true, min: 0, error: 'El kilómetro debe ser un número mayor a 0.' },
        tarifa: { type: 'number', required: true, error: 'La tarifa debe ser un número mayor a 0.' },
        toneladas: { type: 'number', required: true, min: 0, max: 100, error: 'Las toneladas deben ser un número mayor a 0 y menor a 100.' },
        cargado: { type: 'number', required: true, min: 0, max: 100, error: 'El cargado debe ser un número   mayor a 0 y menor a 100.' },
        descargado: { type: 'number', required: true, min: 0, max: 100, error: 'El descargado debe ser un número mayor a 0 y menor a 100.' },
        pagado: { type: 'boolean', required: false, default: false, error: 'El pagado debe ser un booleano.' },
        variacion: { type: 'number', required: false, default: 0.1, min: 0, max: 1, error: 'La variación debe ser un número mayor o igual a 0.' },
        group: { type: 'date', required: false, error: 'El grupo debe ser una fecha válida.', validate: isValidDate },
        tabla: { type: 'string', required: false, tablas: ['viaje', 'viaje_cliente', 'viaje_clienteV'], error: 'La tabla proporcionada no es válida.' },
    };

    // Validar cada campo
    for (const [key, rules] of Object.entries(fields)) {
        const value = data[key];

        // Para validación completa (insert), los campos requeridos deben estar presentes
        if (!partial && rules.required && (value === undefined || value === null || (typeof value === 'string' && value.trim() === ''))) {
            errors.push(rules.error);
            continue;
        }

        // Para validación parcial (update), ignorar campos no proporcionados
        if ((partial || !rules.required) && (value === undefined || value === null)) {
            continue;
        }

        // Validar tipo
        if (rules.type === 'string' && typeof value !== 'string') {
            errors.push(`El campo ${key} debe ser una cadena.`);
        } else if (rules.type === 'number' && key !== 'tarifa' && (isNaN(value) || typeof value !== 'number')) {
            errors.push(`El campo ${key} debe ser un número.`);
        } else if (rules.type === 'boolean' && typeof value !== 'boolean') {
            errors.push(`El campo ${key} debe ser un booleano.`);
        } else if (rules.type === 'date' && !rules.validate(value)) {
            errors.push(rules.error);
        }

        // Validar tarifa (acepta string o number)
        if (key === 'tarifa' && value !== undefined) {
            let parsedTarifa;
            if (typeof value === 'string') {
                parsedTarifa = parseCurrency(value);
            } else if (typeof value === 'number') {
                parsedTarifa = value;
            } else {
                errors.push(rules.error);
                continue;
            }
            if (isNaN(parsedTarifa) || parsedTarifa <= 0) {
                errors.push(rules.error);
            } else {
                validatedData[key] = parsedTarifa;
            }
        }

        if(key === "tabla" && !rules.tablas.some( tabla => tabla === value))
            errors.push(rules.error);

        // Validar regex para comprobante
        if (rules.regex && !rules.regex.test(value)) {
            errors.push(rules.error);
        }

        // Validar valores mínimos para números
        if (rules.min !== undefined && !isNaN(value) && value < rules.min) {
            errors.push(rules.error);
        }

        // Validar valores maximos para numeros
        if (rules.max !== undefined && !isNaN(value) && value > rules.max) {
            errors.push(rules.error);
        }

        // Validar fecha para group y fecha
        if (rules.validate && value !== undefined && !rules.validate(value)) {
            errors.push(rules.error);
        }

        // Guardar valor en validatedData si no es tarifa (tarifa ya se manejó arriba)
        if (key !== 'tarifa' && value !== undefined) {
            validatedData[key] = value;
        }

        // Aplicar valor por defecto si no está presente y no es requerido
        if (value === undefined && !rules.required && rules.default !== undefined) {
            validatedData[key] = rules.default;
        }
    }

    return { errors, validatedData };
};

module.exports = validateViaje;
