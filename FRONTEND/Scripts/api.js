import {getToken, handleAuthorization, handleAuthError, showConfirmModal} from './apiPublic.js'

const apiURL = 'http://localhost:3000/api';

// Función para cerrar sesión
export function logout() {
    localStorage.clear();
    window.location.href = "login.html";
}

// Obtener todos los choferes
export async function fetchAllChoferes() {
    try {
        const token = getToken();
        handleAuthorization();
        const response = await fetch(`${apiURL}/choferes/all`, {
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

// Obtener Choferes
export async function fetchAllDataChoferes() {
    try {
        const token = getToken();
        handleAuthorization();
        const response = await fetch(`${apiURL}/choferes/allData`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
            },
        });

        if (!response.ok) {
            throw new Error('Error al obtener los datos de los choferes');
        }

        const data = await response.json();
        return data.choferes;
    } catch (error) {
        handleAuthError(error);
        throw error;
    }
}

// Obtener todas las tarifas
export async function fetchTarifas() {
    try {
        const token = getToken();
        const response = await fetch(`${apiURL}/catac/tarifas`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
            },
        });

        if (!response.ok) {
            throw new Error('Error al cargar tarifas');
        }

        const data = await response.json();
        if (data.tarifas.length > 0)
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
        handleAuthorization();
        const response = await fetch(`${apiURL}/catac/update`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        if (!response.ok) {
            if (response.status === 403)
                handleAuthError(data.message);
            else
                console.log(data.message);
        }
        
        localStorage.setItem('tarifasCatac', JSON.stringify(data.tarifas));

        return data;
    } catch (error) {
        console.error(error.message);
        throw error;
    }
}

// Añadir un viaje
export async function addViaje(payload) {
    try {
        const token = getToken();
        handleAuthorization();
        const response = await fetch(`${apiURL}/viajes/addViaje`, {
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

        return response;
    } catch (error) {
        console.log(error.message);
        throw error;
    }
}

// Modificar Viaje
export async function updateViaje(payload) {
    try {
        const token = getToken();
        handleAuthorization();
        const response = await fetch(`${apiURL}/viajes/updateViajes`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok){
            const data = await response.json();
            console.log(data.message);
        }
        return response.ok;
    } catch (error){
        console.log(error.message);
    }
}

// Obtener viaje por comprobante
export async function getViajeComprobante(comprobante) {
    try{
        const token = getToken();
        handleAuthorization();
        const response = await fetch(`${apiURL}/viajes/viajesComprobante/${encodeURIComponent(comprobante)}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
            }
        });

        return response;
    } catch (error){
        console.log(error.message);
    }
}

// Añadir pagos
export async function addPagos(payload) {
    try {
        const token = getToken();
        handleAuthorization();
        const response = await fetch(`${apiURL}/pagos/addPagos`, {
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

        return response;
    } catch (error) {
        console.log(error.message);
        throw error;
    }
}

// Modificar Pagos
export async function updatePagos(payload) {
    try {
        const token = getToken();
        handleAuthorization();
        const response = await fetch(`${apiURL}/pagos/updatePagos`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok){
            const data = await response.json();
            console.log(data.message);
        }
        return response.ok;
    } catch (error){
        console.log(error.message);
    }
}

// Marcar cheques como pagos
export async function setChequesPagos(cheques) {
    try {
        const token = getToken();
        handleAuthorization();
        const response = await fetch(`${apiURL}/pagos/setChequesPagos`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(cheques)
        });

        const data = await response.json();
        if(response.status === 403) {
            handleAuthError(data.message);
            return;
        }
        if (!response.ok) {
            showConfirmModal(data.message);
        }
        return response.ok;
    } catch (error) {
        console.log(error.message);
    }
}

// Eliminar un chofer (ya existe en tu api.js original)
export async function deleteChofer(cuil){
    try {
        const token = getToken();
        handleAuthorization();
        const response = await fetch(`${apiURL}/users/updateUser`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`,
            },
        });
        
        if (!response.ok){
            const data = await response.json();
            showConfirmModal(data.message);
        }
        
        return response.ok;
    } catch (error) {
        console.log(error.message);
    }
}

// Añadir un CHOFER (ya existe en tu api.js original)
export async function insertChofer(payload) {
    try {
        const token = getToken();
        handleAuthorization();
        const response = await fetch(`${apiURL}/users/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok){
            const data = await response.json();
            showConfirmModal(data.message);
        }
        
        return response.ok;
    } catch (error) {
        console.log(error.message);
    }
}

// Obtener Clientes (ya existe en tu api.js original)
export async function fetchClientes() {
    try {
        const token = getToken();
        handleAuthorization();
        const response = await fetch(`${apiURL}/clientes/`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
            },
        });

        if (!response.ok) {
            throw new Error('Error al obtener los datos de los clientes');
        }

        const data = await response.json();
        if (data.clientes && Array.isArray(data.clientes)) {
            console.log('Clientes cargados:', data.clientes.length);
            return data.clientes;
        } else {
            throw new Error('El formato de respuesta de choferes no es el esperado.');
        }
    } catch (error) {
        handleAuthError(error);
        throw error;
    }
}

// Modificar un cliente (ya existe en tu api.js original)
export async function updateCliente(cuitOriginal, payload){
    try {
        const token = getToken();
        handleAuthorization();
        const response = await fetch(`${apiURL}/clientes/updateCliente/${encodeURIComponent(cuitOriginal)}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        
        if (!response.ok){
            const data = await response.json();
            showConfirmModal(data.message);
        }
        
        return response.ok;
    } catch (error) {
        console.log(error.message);
    }
}

// Registrar un cliente (ya existe en tu api.js original)
export async function insertCliente(payload){
    try {
        const token = getToken();
        handleAuthorization();
        const regexCuil = /^\d{2}-\d{8}-\d{1}$/;
        if (!payload.nombre || payload.nombre === '' || !payload.cuit || !payload.cuit === '' || !regexCuil.test(payload.cuit)){
            showConfirmModal("Los datos ingresados para el cliente no son validos");
            return;
        }
        const response = await fetch(`${apiURL}/clientes/addCliente`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        
        if (!response.ok){
            const data = await response.json();
            (data.message);
        }
        
        return response.ok;
    } catch (error) {
        console.log(error.message);
    }
}

// Obtener viajes cliente
export async function getViajesCliente(cuit, cantidad) {
    try{
        const token = getToken();
        handleAuthorization();
        const response = await fetch(`${apiURL}/viajes/viajesCliente?cuit=${encodeURIComponent(cuit)}&cantidad=${encodeURIComponent(cantidad)}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
            }
        });

        return response;
    } catch (error){
        console.log(error.message);
    }
}

// Añadir resumen luego de cerrar cuenta
export async function addResumen(cuil, groupId, viajesGroup, pagosGroup, pagoRestante) {
    try {
        const token = getToken();
        handleAuthorization();
        let payload = {
            choferCuil: cuil,
            groupStamp: groupId,
            viajes: viajesGroup,
            pagos: pagosGroup,
        };

        if (pagoRestante){
            payload = {
                ...payload,
                pagoAdicional: pagoRestante
            };
        }
        const response = await fetch(`${apiURL}/resumenes/insertResumen`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        
        if (!response.ok){
            const data = await response.json();
            console.log(data.message);
        }
        
        return response;
    } catch (error) {
        console.log(error.message);
    }
}

export async function generarFactura(payload){
    try{
        const token = getToken();
        handleAuthorization();
        const response = await fetch(`${apiURL}/facturas/generar-factura`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify(payload)
        });

        return response;
    } catch (error){
        console.log(error.message);
    }
}