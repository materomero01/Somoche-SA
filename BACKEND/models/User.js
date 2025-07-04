const userSchema = {
    cuil: { type: String, required: true },
    nombre_y_apellido: { type: String, required: true },
    password: { type: String, required: true },
    trabajador: { type: String, required: true, enum: ['Monotributista', 'Responsable Inscripto']},
    patente_chasis: { type: String, required: true }, // Asumiendo que es requerido si es chofer
    patente_acoplado: { type: String, default: null },
    telefono: { type: String, default: null },
    email: { type: String, default: null },
    role: { type: String, default: 'chofer', enum: ['chofer', 'admin'] }
};

module.exports = userSchema;