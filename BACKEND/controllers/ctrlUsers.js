const pool = require('../db');
const bcrypt = require('bcryptjs');
const userSchema = require('../models/User.js');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;

exports.insertUser = async (req, res) => {
    let client;
   try {
        // Validar datos de entrada
        console.log(req.body);
        const { errors, validatedData } = userSchema(req.body);
        if (errors.length > 0) {
            return res.status(400).json({ message: `Los datos ingresados para ${errors.join(', ')} no son validos` });
        }

        client = await pool.connect();
        await client.query('BEGIN');

        // Verificar si el CUIL o email ya están registrados
        const userExists = await client.query(
            'SELECT cuil FROM usuario WHERE cuil = $1 OR email = $2',
            [validatedData.cuil, validatedData.email]
        );
        if (userExists.rows.length > 0) {
            return res.status(409).json({ message: 'El CUIL o el Email ya están registrados.' });
        }

        // Hash de la contraseña
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(validatedData.password, salt);

        // Insertar en la tabla usuario
        await client.query(
            `INSERT INTO usuario (
                cuil, nombre_apellido, password, telefono, email, role
            ) VALUES ($1, $2, $3, $4, $5, $6)`,
            [
                validatedData.cuil,
                validatedData.nombre_y_apellido? validatedData.nombre_y_apellido : validatedData.nombre,
                hashedPassword,
                validatedData.telefono,
                validatedData.email,
                'chofer'
            ]
        );

        // Insertar en la tabla chofer
        await client.query(
            `INSERT INTO chofer (
                cuil, tipo_trabajador, patente_chasis, patente_acoplado
            ) VALUES ($1, $2, $3, $4)`,
            [
                validatedData.cuil,
                validatedData.trabajador,
                validatedData.patente_chasis.toUpperCase(),
                validatedData.patente_acoplado?.toUpperCase()
            ]
        );

        await client.query('COMMIT');

        res.status(201).json({ message: 'Usuario registrado con éxito' });
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        console.error('Error en insertUser:', error);
        res.status(500).json({ message: 'Error interno del servidor al registrar usuario.' });
    } finally {
        client?.release();
    }
};

exports.loginUser = async (req, res) => {
    const { cuil, password } = req.body;
    // Validar que se proporcionen cuil y password
    if (!cuil || !password) {
        return res.status(400).json({ message: 'CUIL y contraseña son obligatorios.' });
    }

    try {
        const userResult = await pool.query(
            'SELECT cuil, nombre_apellido, password AS hashedPassword, role FROM usuario WHERE cuil = $1',
            [cuil]
        );
        if (userResult.rows.length === 0) {
            return res.status(401).json({ message: 'El CUIL proporcionado no se encuentra registrado.' });
        }

        const user = userResult.rows[0];
        const passwordIsValid = await bcrypt.compare(password, user.hashedpassword);

        if (!passwordIsValid) {
            return res.status(401).json({ message: 'La contraseña no es correcta.' });
        }

        let choferTrabajador;
        if (user.role === "chofer"){
            const choferResult = await pool.query(
                'SELECT tipo_trabajador FROM chofer WHERE cuil = $1',
                [cuil]
            );
            if (choferResult.rows.length === 0) {
                return res.status(401).json({ message: 'El CUIL proporcionado no se encuentra registrado como chofer.' });
            }
            choferTrabajador = choferResult.rows[0];
        }

        // Generar token JWT
        const payload = {
            cuil: user.cuil,
            nombre_apellido: user.nombre_apellido,
            role: user.role,
            cuil: cuil
        };
        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });

        res.status(200).json({
            message: 'Inicio de sesión exitoso.',
            token,
            nombre_apellido: user.nombre_apellido,
            role: user.role,
            cuil: cuil,
            trabajador: choferTrabajador
        });
    } catch (error) {
        console.error('Error en loginUser:', error);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
};