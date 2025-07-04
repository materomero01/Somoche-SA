const pool = require('../db');
const bcrypt = require('bcryptjs');
const userSchema = require('../models/User.js');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;

exports.insertUser = async (req, res) => {
    const user = {};
    try{
        for (var key of Object.keys(userSchema)){
            user[key] = req.body[key];
        }
    } catch (error){
        return res.status(500).json({message: 'Faltan valores estrictamente requeridos'});
    }
    for (var key of ['patente_acoplado', 'telefono', 'email'])
        if (user.key === '')
            user.key = null;
    try {
        var userExists = await pool.query(
            'SELECT cuil FROM usuario WHERE cuil = $1 OR email = $2',
            [user.cuil, user.email]
        );
        if (userExists.rows.length > 0) {
            return res.status(409).json({ message: 'El CUIL o el Email ya están registrados.' });
        }

        // HASH DE LA CONTRASEÑA
        var salt = await bcrypt.genSalt(10); // Genera un "salt" (cadena aleatoria)
        var hashedPassword = await bcrypt.hash(user.password, salt); // Hashea la contraseña
        user.password = hashedPassword; // Almacena la contraseña hasheada
        await pool.query(
            `INSERT INTO usuario (
                cuil, nombre_apellido, password, telefono, email, role
            ) VALUES ($1, $2, $3, $4, $5, $6)`,
            [
                user.cuil,
                user.nombre_y_apellido,
                user.password,
                user.telefono,
                user.email,
                user.role
            ]
        );

        await pool.query(
            `INSERT INTO chofer (
                cuil, tipo_trabajador, patente_chasis, patente_acoplado
            ) VALUES ($1, $2, $3, $4)`,
            [
                user.cuil,
                user.trabajador,
                user.patente_chasis,
                user.patente_acoplado
            ]
        );
        res.status(200).json({message:'Usuario registrado con exito'});
    } catch(error){
        console.log(error)
        res.status(500).json({ message: 'Error interno del servidor al registrar usuario.' });
    }
};

exports.loginUser = async (req, res) => {
    const { cuil, password } = req.body;
    try {
        const userResult = await pool.query('SELECT cuil, password AS hashedPassword, role FROM usuario WHERE cuil = $1', [cuil]);
        if (userResult.rows.length === 0) {
            return res.status(401).json({ message: 'El CUIL proporcionado no se encuentra registrado' });
        }
        const user = userResult.rows[0];
        const passwordIsValid = await bcrypt.compare(password, user.hashedpassword);

        if (passwordIsValid) {
            // Si las credenciales son correctas, genera el token
            const payload = {
                cuil: user.cuil,
                role: user.role
            };
            const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' }); // Token expira en 1 hora

            res.status(200).json({ message: 'Inicio de sesión exitoso.', token: token });
        } else {
            res.status(401).json({ message: 'La contraseña no es correcta' });
        }
    } catch (error) {
        console.error('Error en el login:', error);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
};