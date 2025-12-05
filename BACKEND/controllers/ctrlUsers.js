const pool = require('../db');
const bcrypt = require('bcryptjs');
const userSchema = require('../models/User.js');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer')
const { getIO } = require('../socket');

const JWT_SECRET = process.env.JWT_SECRET;

exports.insertUser = async (req, res) => {
    let client;
   try {
        // Validar datos de entrada
        const { errors, validatedData } = userSchema(req.body);
        const { admin } = req.query;
        if (errors.length > 0) {
            return res.status(400).json({ message: `Los datos ingresados para ${errors.join(', ')} no son validos` });
        }

        client = await pool.connect();
        await client.query('BEGIN');

        // Verificar si el CUIL o email ya están registrados
        const userExists = await client.query(
            'SELECT cuil, valid FROM usuario WHERE cuil = $1 OR email = $2',
            [validatedData.cuil, validatedData.email]
        );
        
        // Hash de la contraseña
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(validatedData.password, salt);
        let usuarioRecuperado = false;
        if (userExists.rows.length > 0) {
            console.log(admin);
            if(!userExists.rows[0].valid && admin === "true"){
                const responseRecuperar = await client.query('UPDATE usuario SET valid = true, nombre_apellido = $2, password = $3, telefono = $4, email = $5 WHERE valid = false AND cuil = $1', [validatedData.cuil, validatedData.nombre, hashedPassword, validatedData.telefono, validatedData.email]);
                const responseRecuperarChofer = await client.query('UPDATE chofer SET valid = true, tipo_trabajador = $2, patente_chasis = $3, patente_acoplado = $4 WHERE valid = false AND cuil = $1', [validatedData.cuil, validatedData.trabajador, validatedData.patente_chasis, validatedData.patente_acoplado]);
                if (responseRecuperar.rowCount > 0 && responseRecuperarChofer.rowCount > 0)
                    usuarioRecuperado = true;
                    res.status(202).json({ message: `Se recupero un usuario anteriormente registrado con el cuit ${validatedData.cuil}, y se actualizaron sus datos`});

            }
            if (!usuarioRecuperado) {
                await client.query('ROLLBACK');
                return res.status(409).json({ message: 'El CUIL o el Email ya están registrados.' });
            }
        }

        
        if (!usuarioRecuperado){
            // Insertar en la tabla usuario
            await client.query(
                `INSERT INTO usuario (
                    cuil, nombre_apellido, password, telefono, email, role
                ) VALUES ($1, $2, $3, $4, $5, $6)`,
                [
                    validatedData.cuil,
                    validatedData.nombre,
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
                    validatedData.patente_chasis,
                    validatedData.patente_acoplado
                ]
            );
        }

        await client.query('COMMIT');

        const io = getIO();
        // Avisar a todos los clientes conectados
        const authToken = req.headers.authorization?.split(' ')[1];
        let emitterCuil = null;
        if (authToken){
            try {
                const decoded = jwt.verify(authToken, JWT_SECRET);
                emitterCuil = decoded.cuil;
                io.sockets.sockets.forEach((socket) => {
                if (socket.cuil !== emitterCuil) {
                    socket.emit('nuevoUsuario',{id: validatedData.cuil,nombre: validatedData.nombre, cuil: validatedData.cuil, trabajador: validatedData.trabajador, patente_chasis: validatedData.patente_chasis, patente_acoplado: validatedData.patente_acoplado, telefono: validatedData.telefono, email: validatedData.email});
                }
            });
            } catch (error) {
                console.error('Error al verificar token en insertUser:', error);
            }// Emitir evento a todos los clientes excepto al emisor
        } else {
            io.emit('nuevoUsuario',{nombre: validatedData.nombre, cuil: validatedData.cuil, trabajador: validatedData.trabajador, patente_chasis: validatedData.patente_chasis, patente_acoplado: validatedData.patente_acoplado, telefono: validatedData.telefono, email: validatedData.email});
        }
        
        if (!usuarioRecuperado) res.status(201).json({ message: 'Usuario registrado con éxito' });
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
            choferTrabajador = choferResult.rows[0].tipo_trabajador;
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

// Configuración de Nodemailer (ejemplo con Gmail)
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        //user: process.env.EMAIL_USER,
        user: "somochesa.soporte@gmail.com",
        pass: process.env.EMAIL_PASS
    }
});

const RESET_JWT_SECRET = process.env.RESET_JWT_SECRET || 'your_reset_jwt_secret';


exports.getEmailByCuit = async (req, res) => {
    const cuil = req.query.cuil;
    if (!cuil) {
        return res.status(400).json({ message: 'CUIL/CUIT no obtenido' });
    }

    try {
        const result = await pool.query('SELECT email, nombre_apellido FROM usuario where cuil = $1',
            [cuil]);
        
        if (result.rows.length === 0) {
            return res.status(401).json({ message: 'El CUIL proporcionado no se encuentra registrado.' });
        }

        const email = result.rows[0].email;
        if (email === null) {
            return res.status(400).json({message: 'El usuario no tiene E-mail'})
        }
        const resetToken = jwt.sign(
            { cuil, scope: 'password_reset' },
            RESET_JWT_SECRET,
            { expiresIn: '10m' } // Expira en 10min
        );

        // Enviar email con el enlace de reinicio
        const apiURL = 'http://somochesa.online';
        const resetLink = `${apiURL}/reset-password.html?token=${resetToken}`;
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'Restablecer tu contraseña',
            html: `
                <p>Haz clic en el siguiente enlace para restablecer tu contraseña:</p>
                <a href="${resetLink}">${resetLink}</a>
                <p>Este enlace expirará en 10 minutos.</p>
            `
        };

        await transporter.sendMail(mailOptions);
        res.json({ message: 'Enlace de restablecimiento enviado al correo asociado. Revise su correo.' });
    } catch (error) {
        console.error('Error en forgot-password:', error);
        res.status(500).json({ message: 'Error al procesar la solicitud' });
    }
};

// Restablecer contraseña
exports.resetPassword = async (req, res) => {
    const { token, newPassword } = req.body;

    try {
        // Verificar el JWT de reinicio
        const decoded = jwt.verify(token, RESET_JWT_SECRET);
        if (decoded.scope !== 'password_reset') {
            return res.status(400).json({ message: 'Token inválido' });
        }

        const cuil = decoded.cuil;

        // Verificar si el usuario existe
        const userResult = await pool.query('SELECT * FROM usuario WHERE cuil = $1', [cuil]);
        if (userResult.rows.length === 0) {
            return res.status(404).json({ message: 'Usuario no encontrado' });
        }

        // Hashear la nueva contraseña
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Actualizar la contraseña
        await pool.query('UPDATE usuario SET password = $1 WHERE cuil = $2', [hashedPassword, cuil]);

        res.json({ message: 'Contraseña restablecida exitosamente' });
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(400).json({ message: 'El enlace ha expirado' });
        }
        console.error('Error en reset-password:', error);
        res.status(500).json({ message: 'Error al restablecer la contraseña' });
    }
};

