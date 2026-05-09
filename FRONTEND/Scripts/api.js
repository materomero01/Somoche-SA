import { getToken, handleAuthorization, handleAuthError, showConfirmModal, setToken, BASE_URL } from './apiPublic.js'

const apiURL = BASE_URL;


export let tarifasCatac = [];
export let tarifasFetra = [];

// Detectar entorno automáticamente: Local vs Producción
const SOCKET_URL = ['localhost', '127.0.0.1'].includes(window.location.hostname)
    ? 'http://localhost:3000' // URL Local
    : 'https://somochesa.online/'; // URL Producción

export const socket = io(SOCKET_URL, {
    auth: { token: localStorage.getItem('jwtToken') }
});

// Setup autocomplete
export function setupAutocomplete({ inputId, suggestionsId = `${inputId}-suggestions`, filterSuggestions, renderSuggestion, onSelect, dependentInputId, onDependentChange }) {
    const input = document.getElementById(inputId);
    let suggestionsDiv = document.getElementById(suggestionsId);

    if (!input) {
        console.warn(`Input con ID '${inputId}' no encontrado.`);
        return;
    }

    if (!suggestionsDiv) {
        suggestionsDiv = document.createElement('div');
        suggestionsDiv.id = suggestionsId;
        suggestionsDiv.classList.add('suggestions-list');
        input.parentNode.insertBefore(suggestionsDiv, input.nextSibling);
    }

    let activeSuggestionIndex = -1;

    const displaySuggestions = suggestions => {
        suggestionsDiv.innerHTML = '';
        activeSuggestionIndex = -1;

        if (!suggestions?.length) {
            suggestionsDiv.style.display = 'none';
            return;
        }

        suggestions.forEach((suggestion, index) => {
            const item = document.createElement('div');
            item.classList.add('suggestion-item');
            item.textContent = renderSuggestion(suggestion);
            Object.entries(suggestion).forEach(([key, value]) => item.dataset[key] = value);

            item.addEventListener('click', () => {
                onSelect(input, suggestion);
                suggestionsDiv.innerHTML = '';
                suggestionsDiv.style.display = 'none';
                input.focus();
            });
            suggestionsDiv.appendChild(item);
        });
        suggestionsDiv.style.display = 'block';
    };

    input.addEventListener('input', () => {
        const query = input.value.trim();
        Object.keys(input.dataset).forEach(key => delete input.dataset[key]);
        displaySuggestions(query ? filterSuggestions(query) : []);
    });

    if (dependentInputId && onDependentChange) {
        const dependentInput = document.getElementById(dependentInputId);
        dependentInput?.addEventListener('change', () => onDependentChange(dependentInput, input, suggestionsDiv));
    }

    document.addEventListener('click', e => {
        if (!input.contains(e.target) && !suggestionsDiv.contains(e.target)) {
            suggestionsDiv.style.display = 'none';
            activeSuggestionIndex = -1;
        }
    });

    input.addEventListener('keydown', e => {
        const items = Array.from(suggestionsDiv.children);
        if (!items.length) return;

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                activeSuggestionIndex = (activeSuggestionIndex + 1) % items.length;
                highlightSuggestion(items[activeSuggestionIndex]);
                break;
            case 'ArrowUp':
                e.preventDefault();
                activeSuggestionIndex = (activeSuggestionIndex - 1 + items.length) % items.length;
                highlightSuggestion(items[activeSuggestionIndex]);
                break;
            case 'Enter':
                e.preventDefault();
                if (activeSuggestionIndex > -1) items[activeSuggestionIndex].click();
                else if (items.length === 1 && input.value === items[0].dataset.nombre) items[0].click();
                break;
            case 'Escape':
                suggestionsDiv.style.display = 'none';
                activeSuggestionIndex = -1;
                break;
        }
    });

    suggestionsDiv.addEventListener('mousedown', e => e.preventDefault());

    input.addEventListener('focus', () => displaySuggestions(filterSuggestions(input.value.trim())));

    const highlightSuggestion = item => {
        Array.from(suggestionsDiv.children).forEach(el => el.classList.remove('active'));
        item.classList.add('active');
        item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    };
};

export const setupClienteAutocomplete = (inputId, dataClientes) => setupAutocomplete({
    inputId,
    filterSuggestions: query => dataClientes.filter(cliente => cliente.nombre.toLowerCase().includes(query.toLowerCase())),
    renderSuggestion: cliente => `${cliente.nombre} (${cliente.cuit})`,
    onSelect: (input, cliente) => {
        input.value = cliente.nombre;
        input.dataset.selectedClienteNombre = cliente.nombre;
        input.dataset.selectedClienteCuit = cliente.cuit;

        const evento = new Event('change', { bubbles: true });
        input.dispatchEvent(evento);
    }
});

// Setup chofer autocomplete
export const setupChoferAutocomplete = (inputId, dataChoferes) => setupAutocomplete({
    inputId,
    filterSuggestions: query => dataChoferes.filter(chofer => chofer.nombre.toLowerCase().includes(query.toLowerCase())),
    renderSuggestion: chofer => `${chofer.nombre} (${chofer.cuil || chofer.cuit})`,
    onSelect: (input, chofer) => {
        input.value = chofer.nombre;
        input.dataset.selectedChoferNombre = chofer.nombre;
        input.dataset.selectedChoferCuil = chofer.cuil || chofer.cuit;

        const evento = new Event('change', { bubbles: true });
        input.dispatchEvent(evento);
    }
});

// Setup tarifa autocomplete
export const setupTarifaAutocomplete = (inputId, dependentInputId) => {

    setupAutocomplete({
        inputId: inputId,
        dependentInputId: dependentInputId,
        filterSuggestions: () => {
            const currentKm = parseInt(document.getElementById(dependentInputId)?.value.trim(), 10);
            const tarifaCatacCalculada = (!isNaN(currentKm) && currentKm > 0 && currentKm <= tarifasCatac.length && tarifasCatac[currentKm - 1]?.valor !== undefined)
                ? tarifasCatac[currentKm - 1].valor
                : tarifasCatac[tarifasCatac.length - 1].valor;

            const tarifaFetraCalculada = (!isNaN(currentKm) && currentKm > 0 && currentKm <= tarifasFetra.length && tarifasFetra[currentKm - 1]?.valor !== undefined)
                ? tarifasFetra[currentKm - 1].valor
                : tarifasCatac[tarifasCatac.length - 1].valor;;

            return [
                { type: 'Tarifa CATAC', value: tarifaCatacCalculada },
                { type: 'Tarifa Fe.Tr.A', value: tarifaFetraCalculada }
            ];
        },
        renderSuggestion: suggestion => `${suggestion.type}: ${suggestion.value}`,
        onSelect: (input, suggestion) => input.value = suggestion.value,
        onDependentChange: (dependentInput, input, suggestionsDiv) => {
            const queryKm = parseInt(dependentInput.value.trim(), 10);
            if (isNaN(queryKm) || queryKm <= 0 || queryKm > tarifasCatac.length) {
                input.value = '';
                suggestionsDiv.style.display = 'none';
                return;
            }

            const tarifa = tarifasCatac[queryKm - 1];
            input.value = tarifa?.valor ?? '';
            suggestionsDiv.style.display = 'none';
            if (!tarifa?.valor) console.warn(`No se encontró tarifa para ${queryKm} km.`);
        }
    });
};

export function redondear(valor){
    let valorReturn = valor;
    if (typeof valor === "string")
        valorReturn = parseFloat(valor.replace(/[$,]/g, ''))
    return parseFloat(valorReturn.toFixed(2));
}

// Función para cerrar sesión
export function logout() {
    localStorage.clear();
    window.location.href = "login.html";
}

export function createActionModal(id, title, buttons) {
    const modal = document.createElement('div');
    modal.id = id;
    modal.className = 'modal active';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 400px;">
            <h2 style="margin-top: 0">${title}</h2>
            <div class="modal-actions-vertical">
                ${buttons.map(b => `
                    <button id="${b.id}" class="btn ${b.class} ${b.hidden ? 'hidden' : ''}">
                        ${b.label}
                    </button>
                `).join('')}
            </div>
            <button id="modalCancelBtn" class="btn btn-danger" style="margin-top: 12px;">Cancelar</button>
        </div>
    `;
    document.body.appendChild(modal);
    return modal;
}

////////////////////////////////////////////////////////////////////
//                    API LLAMADA CHOFERES                        //
////////////////////////////////////////////////////////////////////

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
        const data = await response.json();
        if (response.status === 403) {
            handleAuthError(data);
            return;
        }
        setToken(response.headers.get('X-New-Token'));

        if (!response.ok) {
            throw new Error('Autenticación fallida o token inválido/expirado al cargar choferes.');
        }
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
        const data = await response.json();
        if (response.status === 403) {
            handleAuthError(data);
            return;
        }
        setToken(response.headers.get('X-New-Token'));

        if (!response.ok) {
            throw new Error('Error al obtener los datos de los choferes');
        }

        return data.choferes;
    } catch (error) {
        handleAuthError(error);
        throw error;
    }
}

// Añadir un CHOFER
export async function insertChofer(payload) {
    try {
        const token = getToken();
        handleAuthorization();
        const response = await fetch(`${apiURL}/users/register?admin=${encodeURIComponent(true)}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (response.status === 403) {
            handleAuthError(data);
            return;
        }
        setToken(response.headers.get('X-New-Token'));

        return response;
    } catch (error) {
        console.log(error.message);
    }
}

// Eliminar un chofer (ya existe en tu api.js original)
export async function deleteChofer(cuil) {
    try {
        const token = getToken();
        handleAuthorization();
        const response = await fetch(`${apiURL}/choferes/deleteChofer/${encodeURIComponent(cuil)}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`,
            },
        });

        if (response.status === 403) {
            const data = await response.json();
            handleAuthError(data);
            return;
        }
        setToken(response.headers.get('X-New-Token'));

        if (!response.ok) {
            const data = await response.json();
            showConfirmModal(data.message);
            return;
        }

        return response;
    } catch (error) {
        console.log(error.message);
    }
}

///////////////////////////////////////////////////////////////////////////
//                    API LLAMADA VIAJES CHOFERES                        //
///////////////////////////////////////////////////////////////////////////

// Obtener viaje por comprobante
export async function getViajeComprobante(comprobante) {
    try {
        const token = getToken();
        handleAuthorization();
        const response = await fetch(`${apiURL}/viajes/viajesComprobante/${encodeURIComponent(comprobante)}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
            }
        });
        if (response.status === 403) {
            const data = await response.json();
            handleAuthError(data);
            return;
        }
        setToken(response.headers.get('X-New-Token'));

        return response;
    } catch (error) {
        console.log(error.message);
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

        if (response.status === 403) {
            const data = await response.json();
            handleAuthError(data);
            return;
        }
        setToken(response.headers.get('X-New-Token'));

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

        if (response.status === 403) {
            const data = await response.json();
            handleAuthError(data);
            return;
        }
        setToken(response.headers.get('X-New-Token'));

        return response
    } catch (error) {
        console.log(error.message);
    }
}

export async function deleteViaje(comprobante) {
    try {
        const token = getToken();
        handleAuthorization();
        const response = await fetch(`${apiURL}/viajes/deleteViaje?comprobante=${encodeURIComponent(comprobante)}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`,
            }
        });

        if (response.status === 403) {
            const data = await response.json();
            handleAuthError(data);
            return;
        }
        setToken(response.headers.get('X-New-Token'));

        return response;
    } catch (error) {
        console.log(error.message);
    }
}

////////////////////////////////////////////////////////////////////////////
//                    API LLAMADA RESUMENES CHOFER                        //
////////////////////////////////////////////////////////////////////////////

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

        if (pagoRestante) {
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

        if (response.status === 403) {
            const data = await response.json();
            handleAuthError(data);
            return;
        }
        setToken(response.headers.get('X-New-Token'));

        return response;
    } catch (error) {
        console.log(error.message);
    }
}

////////////////////////////////////////////////////////////////////
//                    API LLAMADA CLIENTES                        //
////////////////////////////////////////////////////////////////////

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
        const data = await response.json();
        if (response.status === 403) {
            handleAuthError(data);
            return;
        }
        setToken(response.headers.get('X-New-Token'));

        if (!response.ok) {
            throw new Error('Error al obtener los datos de los clientes');
        }

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

// Registrar un cliente (ya existe en tu api.js original)
export async function insertCliente(payload) {
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
        if (response.status === 403) {
            handleAuthError(data);
            return;
        }
        setToken(response.headers.get('X-New-Token'));

        return response;
    } catch (error) {
        console.log(error.message);
    }
}

// Modificar un cliente (ya existe en tu api.js original)
export async function updateCliente(cuitOriginal, payload) {
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
        const data = await response.json();
        if (response.status === 403) {
            handleAuthError(data);
            return;
        }
        setToken(response.headers.get('X-New-Token'));

        if (!response.ok) {
            showConfirmModal(data.message);
        }

        return response.ok;
    } catch (error) {
        console.log(error.message);
    }
}

// Eliminar un cliente
export async function deleteCliente(cuit) {
    try {
        const token = getToken();
        handleAuthorization();
        const response = await fetch(`${apiURL}/clientes/deleteCliente/${encodeURIComponent(cuit)}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`,
            },
        });

        if (response.status === 403) {

            handleAuthError(data);
            return;
        }
        setToken(response.headers.get('X-New-Token'));

        if (!response.ok) {
            const data = await response.json();
            showConfirmModal(data.message);
            return;
        }

        return response;
    } catch (error) {
        console.log(error.message);
    }
}

///////////////////////////////////////////////////////////////////////////////////
//                    API LLAMADA VIAJES Y PAGOS CLIENTES                        //
///////////////////////////////////////////////////////////////////////////////////

// Obtener viajes cliente
export async function getViajesCliente(cuit, facturados, cantidad, pagados = false) {
    try {
        const token = getToken();
        handleAuthorization();
        const response = await fetch(`${apiURL}/viajes/viajesCliente?cuit=${encodeURIComponent(cuit)}&facturados=${encodeURIComponent(facturados)}&cantidad=${encodeURIComponent(cantidad)}&pagados=${encodeURIComponent(pagados)}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
            }
        });

        if (response.status === 403) {
            const data = await response.json();
            handleAuthError(data);
            return;
        }
        setToken(response.headers.get('X-New-Token'));



        return response;
    } catch (error) {
        console.log(error.message);
    }
}

export async function pagarViajeCliente(viajes) {
    try {
        const token = getToken();
        handleAuthorization();
        const response = await fetch(`${apiURL}/viajes/pagarViajeCliente`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(viajes)
        });

        if (response.status === 403) {
            const data = await response.json();
            handleAuthError(data);
            return;
        }
        setToken(response.headers.get('X-New-Token'));

        return response;
    } catch (error) {
        console.log(error.message);
    }
}

// Obtener pagos cliente
export async function getPagosCliente(cuit, cantidad) {
    try {
        const token = getToken();
        handleAuthorization();
        const response = await fetch(`${apiURL}/pagos/pagosCliente?cuit=${encodeURIComponent(cuit)}&cantidad=${encodeURIComponent(cantidad)}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
            }
        });
        if (response.status === 403) {
            const data = await response.json();
            handleAuthError(data);
            return;
        }
        setToken(response.headers.get('X-New-Token'));

        return response;
    } catch (error) {
        console.log(error.message);
    }
}

///////////////////////////////////////////////////////////////////////
//                    API LLAMADA PROVEEDORES                        //
///////////////////////////////////////////////////////////////////////

// Obtener Proveedores
export async function fetchProveedores() {
    try {
        const token = getToken();
        handleAuthorization();
        const response = await fetch(`${apiURL}/proveedores/`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
            },
        });
        const data = await response.json();
        if (response.status === 403) {
            handleAuthError(data);
            return;
        }
        setToken(response.headers.get('X-New-Token'));

        if (!response.ok) {
            throw new Error('Error al obtener los datos de los clientes');
        }

        if (data.proveedores && Array.isArray(data.proveedores)) {
            console.log('Proveedores cargados:', data.proveedores.length);
            return data.proveedores;
        } else {
            throw new Error('El formato de respuesta de proveedores no es el esperado.');
        }
    } catch (error) {
        handleAuthError(error);
        throw error;
    }
}

// Registrar un Proveedor
export async function insertProveedor(payload) {
    try {
        const token = getToken();
        handleAuthorization();
        const regexCuil = /^\d{2}-\d{8}-\d{1}$/;
        if (!payload.nombre || payload.nombre === '' || !payload.cuit || !payload.cuit === '' || !regexCuil.test(payload.cuit)){
            showConfirmModal("Los datos ingresados para el proveedor no son validos");
            return;
        }
        const response = await fetch(`${apiURL}/proveedores/addProveedor`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        if (response.status === 403) {
            handleAuthError(data);
            return;
        }
        setToken(response.headers.get('X-New-Token'));

        return response;
    } catch (error) {
        console.log(error.message);
    }
}

// Modificar un proveedor
export async function updateProveedor(cuitOriginal, payload) {
    try {
        const token = getToken();
        handleAuthorization();
        const response = await fetch(`${apiURL}/proveedores/updateProveedor/${encodeURIComponent(cuitOriginal)}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        const data = await response.json();
        if (response.status === 403) {
            handleAuthError(data);
            return;
        }
        setToken(response.headers.get('X-New-Token'));

        if (!response.ok) {
            showConfirmModal(data.message);
        }

        return response.ok;
    } catch (error) {
        console.log(error.message);
    }
}

// Eliminar un proveedor
export async function deleteProveedor(cuit) {
    try {
        const token = getToken();
        handleAuthorization();
        const response = await fetch(`${apiURL}/proveedores/deleteProveedor/${encodeURIComponent(cuit)}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`,
            },
        });

        if (response.status === 403) {

            handleAuthError(data);
            return;
        }
        setToken(response.headers.get('X-New-Token'));

        if (!response.ok) {
            const data = await response.json();
            showConfirmModal(data.message);
            return;
        }

        return response;
    } catch (error) {
        console.log(error.message);
    }
}

//////////////////////////////////////////////////////////////////////////////
//                    API LLAMADA ORDENES PROVEEDORES                       //
//////////////////////////////////////////////////////////////////////////////

// Obtener ordenes proveedor
export async function getOrdenesProveedor(cuit, cantidad, pagados = false) {
    try {
        const token = getToken();
        handleAuthorization();
        const response = await fetch(`${apiURL}/pagos/ordenesProveedor?cuit=${encodeURIComponent(cuit)}&cantidad=${encodeURIComponent(cantidad)}&pagados=${encodeURIComponent(pagados)}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
            }
        });

        if (response.status === 403) {
            const data = await response.json();
            handleAuthError(data);
            return;
        }
        setToken(response.headers.get('X-New-Token'));



        return response;
    } catch (error) {
        console.log(error.message);
    }
}

// Obtener pagos Proveedor
export async function getPagosProveedor(cuit, cantidad) {
    try {
        const token = getToken();
        handleAuthorization();
        const response = await fetch(`${apiURL}/pagos/pagosProveedor?cuit=${encodeURIComponent(cuit)}&cantidad=${encodeURIComponent(cantidad)}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
            }
        });
        if (response.status === 403) {
            const data = await response.json();
            handleAuthError(data);
            return;
        }
        setToken(response.headers.get('X-New-Token'));

        return response;
    } catch (error) {
        console.log(error.message);
    }
}

export async function pagarOrdenesProveedor(ordenes, tipo_orden) {
    try {
        const token = getToken();
        handleAuthorization();
        const payload = {
            ordenes: ordenes,
            tipo_orden: tipo_orden
        }
        const response = await fetch(`${apiURL}/pagos/pagarOrdenes`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (response.status === 403) {
            const data = await response.json();
            handleAuthError(data);
            return;
        }
        setToken(response.headers.get('X-New-Token'));

        return response;
    } catch (error) {
        console.log(error.message);
    }
}

/////////////////////////////////////////////////////////////////
//                    API LLAMADA PAGOS                        //
/////////////////////////////////////////////////////////////////

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
        if (response.status === 403) {
            const data = await response.json();
            handleAuthError(data);
            return;
        }
        setToken(response.headers.get('X-New-Token'));

        return response;
    } catch (error) {
        console.log(error.message);
        throw error;
    }
}

// Buscar pago
export async function getPago(id, type) {
    try {
        const token = getToken();
        handleAuthorization();
        const response = await fetch(`${apiURL}/pagos/getPago?id=${encodeURIComponent(id)}&type=${encodeURIComponent(type)}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
            },
        });
        if (response.status === 403) {
            const data = await response.json();
            handleAuthError(data);
            return;
        }
        setToken(response.headers.get('X-New-Token'));

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
       
        if (response.status === 403) { 
            const data = await response.json();
            handleAuthError(data);
            return;
        }
        setToken(response.headers.get('X-New-Token'));

        return response;
    } catch (error) {
        console.log(error.message);
    }
}

export async function deletePago(id, tipo) {
    try {
        const token = getToken();
        handleAuthorization();
        const response = await fetch(`${apiURL}/pagos/deletePago?id=${encodeURIComponent(id)}&type=${encodeURIComponent(tipo)}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`,
            }
        });

        if (response.status === 403) {
            const data = await response.json();
            handleAuthError(data);
            return;
        }
        setToken(response.headers.get('X-New-Token'));

        return response;
    } catch (error) {
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
        if (response.status === 403) {
            handleAuthError(data);
            return;
        }
        setToken(response.headers.get('X-New-Token'));

        if (!response.ok) {
            showConfirmModal(data.message);
        }
        return response.ok;
    } catch (error) {
        console.log(error.message);
    }
}

/////////////////////////////////////////////////////////////////
//                    API LLAMADA TARIFA                       //
/////////////////////////////////////////////////////////////////

export async function loadTarifas() {
    const tarifas = await fetchTarifas();
    tarifasCatac = tarifas.catac;
    tarifasFetra = tarifas.fetra;
}

// Obtener todas las tarifas
export async function fetchTarifas() {
    try {
        const token = getToken();
        handleAuthorization();
        const response = await fetch(`${apiURL}/catac/tarifas`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
            },
        });
        const data = await response.json();
        if (response.status === 403) {
            handleAuthError(data);
            return;
        }
        setToken(response.headers.get('X-New-Token'));

        if (!response.ok) {
            throw new Error('Error al cargar tarifas');
        }

        return data;
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
        if (response.status === 403) {
            handleAuthError(data);
            return;
        }
        setToken(response.headers.get('X-New-Token'));

        if (!response.ok) {
            console.log(data.message);
        }
        console.log(data);
        tarifasCatac = data.tarifas.catac;
        tarifasFetra = data.tarifas.fetra;

        return data;
    } catch (error) {
        console.error(error.message);
        throw error;
    }
}

//////////////////////////////////////////////////////////////////////
//                    API LLAMADA DOCUMENTOS                        //
//////////////////////////////////////////////////////////////////////

export async function getFacturasData(facturasToGet, cuit) {
    try {
        const token = getToken();
        handleAuthorization();
        const payload = {
            facturasToGet: facturasToGet,
            cliente_cuit: cuit
        }
        const response = await fetch(`${apiURL}/facturas/getFacturasData`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify(payload)
        });

        if (response.status === 403) {
            const data = await response.json();
            handleAuthError(data);
            return;
        }
        setToken(response.headers.get('X-New-Token'));

        return response;
    } catch (error) {
        console.log(error.message);
    }
}

export async function generarFactura(payload) {
    try {
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

        if (response.status === 403) {
            const data = await response.json();
            handleAuthError(data);
            return;
        }
        setToken(response.headers.get('X-New-Token'));

        return response;
    } catch (error) {
        console.log(error.message);
    }
}

export async function uploadCartaPorte(viajeId, files) {
    try {
        const token = getToken();
        handleAuthorization();
        const formData = new FormData();
        formData.append('viajeIds', viajeId); // comprobante del viaje
        files.forEach((file) => {
            formData.append('cartaPorte', file); // Sin índices
        });

        const response = await fetch(`${apiURL}/facturas/upload-cartaPorte`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
            },
            body: formData
        });

        if (response.status === 403) {
            const data = await response.json();
            handleAuthError(data);
            return;
        }
        setToken(response.headers.get('X-New-Token'));

        return response;
    } catch (error) {
        console.log(error.message);
    }
}

export async function pagarFacturaCliente(facturasToMark, cuit){
    try {
        const token = getToken();
        handleAuthorization();
        const payload = {
            facturasToMark: facturasToMark,
            cuit: cuit
        }
        const response = await fetch(`${apiURL}/facturas/pagarFacturas`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (response.status === 403) {
            const data = await response.json();
            handleAuthError(data);
            return;
        }
        setToken(response.headers.get('X-New-Token'));

        return response;
    } catch (error) {
        console.log(error.message);
    }
}

export async function deleteDocument(id, comprobante, type = "viajes") {
    try {
        const token = getToken();
        handleAuthorization();
        const response = await fetch(`${apiURL}/facturas/delete-documents?id=${encodeURIComponent(id)}&comprobante=${encodeURIComponent(comprobante)}&type=${encodeURIComponent(type)}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`,
            }
        });

        if (response.status === 403) {
            const data = await response.json();
            handleAuthError(data);
            return;
        }
        setToken(response.headers.get('X-New-Token'));

        return response;
    } catch (error) {
        console.log(error.message);
    }
}

//////////////////////////////////////////////////////////////////////
//                    API LLAMADA LOGS                              //
//////////////////////////////////////////////////////////////////////

// Obtener Logs de actividad
export async function fetchLogs(page = 1, limit = 50) {
    try {
        const token = getToken();
        handleAuthorization();

        const response = await fetch(`${apiURL}/logs?page=${page}&limit=${limit}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            credentials: 'include'
        });

        const data = await response.json();

        // Renovamos el token si el backend lo envía
        const newToken = response.headers.get('X-New-Token');
        if (newToken) {
            setToken(newToken);
        }

        // Manejo de error 403 (sin autorización - ej: chofer intentando acceder)
        if (response.status === 403) {
            handleAuthError(data);
            return { logs: [], page: 1, limit: 50 };
        }

        // Otros errores HTTP
        if (!response.ok) {
            console.error('Error al obtener logs:', data.message || response.status);
            return { logs: [], page: 1, limit: 50 };
        }

        // El controller devuelve { logs: [...], page, limit }, devolvemos todo
        return data;
    } catch (error) {
        console.error("Error en fetchLogs:", error.message);
        return { logs: [], page: 1, limit: 50 };
    }
}

socket.on('updateTarifas', async () => {
    if (window.location.href.includes("catac.html"))
        return showConfirmModal("Se actualizaron las tarifas de Catac", "aviso", () => { window.location.reload() });
    await loadTarifas();
    showConfirmModal("Se actualizaron las tarifas");
});
