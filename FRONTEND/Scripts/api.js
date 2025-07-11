const apiURL = 'http://localhost:3000';

// Obtener el token desde localStorage
function getToken() {
    const token = localStorage.getItem('jwtToken');
    if (!token) {
        throw new Error('No se encontró token JWT en localStorage.');
    }
    return token;
}

// Función para cerrar sesión
export function logout() {
    localStorage.clear();
    window.location.href = "login.html";
}

// Manejar errores de autenticación
function handleAuthError(error) {
    console.error(error.message);
    alert('Tu sesión ha expirado o es inválida. Por favor, inicia sesión de nuevo.');
    logout();
    return [];
}

// Obtener todos los choferes
export async function fetchAllChoferes() {
    try {
        const token = getToken();
        const response = await fetch(`${apiURL}/api/choferes/all`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error('Autenticación fallida o token inválido/expirado al cargar choferes.');
        }

        const data = await response.json();
        if (data.choferes && Array.isArray(data.choferes)) {
            console.log('Choferes cargados:', data.choferes.length);
            return data.choferes;
        } else {
            throw new Error('El formato de respuesta de choferes no es el esperado.');
        }
    } catch (error) {
        return handleAuthError(error);
    }
}

// Obtener todas las tarifas
export async function fetchTarifas() {
    try {
        const token = getToken();
        const response = await fetch(`${apiURL}/api/catac/tarifas`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
            },
        });

        if (!response.ok) {
            throw new Error('Error al cargar tarifas');
        }

        const data = await response.json();
        localStorage.setItem('tarifasCatac', JSON.stringify(data.tarifas));
        return data.tarifas;
    } catch (error) {
        console.error('Error al buscar las tarifas en el backend:', error.message);
        return [];
    }
}

// Actualizar tarifas de Catac
export async function updateTarifas(payload) {
    try {

        const token = getToken();
        const response = await fetch(`${apiURL}/api/catac/update`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error('Autenticación fallida o token inválido/expirado al actualizar las tarifas');
        }
        const data = await response.json();
        localStorage.setItem('tarifasCatac', JSON.stringify(data.tarifas));

        return data;
    } catch (error) {
        handleAuthError(error);
        throw error;
    }
}

// Añadir un viaje
export async function addViaje(payload) {
    try {
        const token = getToken();
        const response = await fetch(`${apiURL}/api/viajes/addViaje`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error('Error al añadir viaje');
        }

        return await response.json();
    } catch (error) {
        handleAuthError(error);
        throw error;
    }
}

// Añadir pagos
export async function addPagos(payload) {
    try {
        const token = getToken();
        const response = await fetch(`${apiURL}/api/pagos/addPagos`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error('Error al añadir los pagos');
        }

        return await response.json();
    } catch (error) {
        handleAuthError(error);
        throw error;
    }
}