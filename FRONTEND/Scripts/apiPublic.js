const apiURL = 'http://localhost:3000/api';

// Obtener el token desde localStorage
export function getToken() {
    const token = localStorage.getItem('jwtToken');
    if (!token) {
        handleAuthError(new Error('No se encontró token JWT en localStorage.'));
    }
    return token;
}

export function setToken(token) {
    if (token){
        localStorage.setItem('jwtToken', token);
        console.log("Generado nuevo token");
    }
}
// Función para cerrar sesión
export function logout() {
    localStorage.clear();
    window.location.href = "login.html";
}

// --- Lógica del Modal de Confirmación ---
export async function showConfirmModal(message, type = "", onConfirm = () => {}, onCancel) {
    let modal = document.getElementById('confirmModal');
    if (!modal){
        try {
            modal = document.createElement('div');
            modal.id = 'confirmModal';
            modal.className = 'modal';
            const response = await fetch('/FRONTEND/confirmModal.html');
            if (!response.ok) {
                throw new Error(`Error HTTP: ${response.status}`);
            }
            const modalHtml = await response.text();
            if (modalHtml){
                modal.innerHTML = modalHtml;
                document.body.appendChild(modal);
            } else 
                return console.log("No se pudo cargar el modal de confirmacion");
        } catch (error) {
            console.log(error.message);
        }
    }
    const headerModal = document.getElementById('headerConfirm');
    const modalMessage = document.getElementById('modalMessage');
    const acceptBtn = document.getElementById('confirmSuccessBtn');
    const confirmBtn = document.getElementById('confirmDeleteBtn');
    const cancelBtn = document.getElementById('cancelDeleteBtn');
    const closeButton = modal.querySelector('.close-button');

    switch (type.toLowerCase()){
        case "confirm":
            headerModal.textContent = "Confirmar Acción";
            acceptBtn.classList.remove("hidden");
            cancelBtn.classList.remove("hidden");
            confirmBtn.classList.add("hidden");
            break;
        case "delete":
            headerModal.textContent = "Confirmar Eliminación";
            acceptBtn.classList.add("hidden");
            cancelBtn.classList.remove("hidden");
            confirmBtn.classList.remove("hidden");
            break;
        default:
            acceptBtn.classList.remove("hidden");
            cancelBtn.classList.add("hidden");
            confirmBtn.classList.add("hidden");
            headerModal.textContent = "Aviso";
    }
    modalMessage.textContent = "";
    modalMessage.innerHTML = message || "¿Estás seguro de que quieres eliminar este registro?";


    acceptBtn.onclick = null;
    confirmBtn.onclick = null;
    cancelBtn.onclick = null;
    closeButton.onclick = null;

    confirmBtn.onclick = () => {
        onConfirm();
        hideConfirmModal();
    };

    acceptBtn.onclick = () => {
        onConfirm();
        hideConfirmModal();
    }

    cancelBtn.onclick = () => {
        if (onCancel) onCancel();
        hideConfirmModal();
    };

    closeButton.onclick = () => {
        if (onCancel) onCancel();
        hideConfirmModal();
    };

    modal.style.display = 'block';

    window.onclick = function (event) {
        if (event.target === modal) {
            if (onCancel) onCancel();
            hideConfirmModal();
        }
    };
}

export function hideConfirmModal() {
    const modal = document.getElementById('confirmModal');
    modal.style.display = 'none';
    window.onclick = null;
}

export function createLoadingSpinner(container) {
    
    // Verificar si el spinner ya existe como hermano del contenedor
    let spinner = container.parentNode.querySelector('#loading-spinner');
    
    if (!spinner) {
        // Crear el div del spinner
        spinner = document.createElement('div');
        spinner.id = 'loading-spinner';
        
        // Crear el div interno del spinner
        const spinnerInner = document.createElement('div');
        spinnerInner.className = 'spinner';
        
        // Agregar texto de cargando
        const loadingText = document.createTextNode('Cargando datos...');
        
        // Construir la estructura
        spinner.appendChild(spinnerInner);
        spinner.appendChild(loadingText);
        
        // Insertar el spinner como hermano del contenedor
        container.parentNode.insertBefore(spinner, container);
    }
    spinner.classList.remove("hidden");
    container.classList.add("hidden");
}

export function toggleSpinnerVisible(container){
    container.classList.toggle("hidden");
    let spinner = container.parentNode.querySelector('#loading-spinner');
    spinner.classList.toggle("hidden");
}

export function changeSpinnerText(container, text = 'Cargando datos...'){
    let spinner = container.parentNode.querySelector("#loading-spinner");
    spinner.childNodes[1].textContent = text;
}

export function handleAuthorization () {
    const userRole = localStorage.getItem('userRole');
    if (!userRole || userRole !== 'admin'){
        showConfirmModal("No tienes autorización para realizar esta acción");
    }
}

// Manejar errores de autenticación
export function handleAuthError(error) {
    console.error(error.message);
    showConfirmModal('Tu sesión ha expirado o es inválida. Por favor, inicia sesión de nuevo.','aviso', () => logout());
    return [];
}

export async function fetchChoferData(cuil) {
    try {
        const token = getToken();
        const response = await fetch(`${apiURL}/choferes/${encodeURIComponent(cuil)}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if(response.status === 403) {
            const data = await response.json();
            handleAuthError(data);
            return;
        }
        setToken(response.headers.get('X-New-Token'));
        const choferData = await response.json();
        let errorMessage = null;
        if (!response.ok) {
            console.error('Error al obtener datos del chofer:', response.status, choferData.message);
            errorMessage= 'Error desconocido al cargar datos.';
            if (response.status === 404) {
                    errorMessage = 'Chofer no encontrado.';
            } else if (response.status === 401) {
                    errorMessage = 'Sesión expirada o no autorizada. Por favor, inicia sesión de nuevo.';
                    // Redirigir al login si la sesión expira o no está autorizada
                    handleAuthError(new Error(errorMessage));
                    return; // Salir de la función para evitar más procesamiento
            }
            showConfirmModal(errorMessage);
        }
        
        return  { choferData, errorMessage};
    } catch (error){
        console.log(error.message);
    }
}

// Modificar un chofer
export async function updateChofer(cuilOriginal, payload){
    try {
        const token = getToken();
        const response = await fetch(`${apiURL}/choferes/updateChofer/${encodeURIComponent(cuilOriginal)}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        setToken(response.headers.get('X-New-Token'));

        const data = await response.json();
        if(response.status === 403) {
            handleAuthError(data);
            return;
        }
        if (!response.ok){
            showConfirmModal(data.message);
        }
        return response.ok;
    } catch (error) {
        console.log(error.message);
    }
}

// Get pagos cheques
export async function getCheques(pagados, choferCuil, cantidad = null) {
    try {
        const token = getToken();
        const response = await fetch(`${apiURL}/pagos/getPagosCheques?pagado=${encodeURIComponent(pagados)}&choferCuil=${encodeURIComponent(choferCuil)}&cantidad=${encodeURIComponent(cantidad)}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
            }
        });
        setToken(response.headers.get('X-New-Token'));

        const data = await response.json();
        if(response.status === 403) {
            handleAuthError(data);
            return;
        }
        if (!response.ok) {
            showConfirmModal(data.messae);
        }
        console.log(data);
        return data;
    } catch (error) {
        console.log(error.message);
    }
}

// Obtener viajes
export async function getViajes(cuil) {
    try{
        const token = getToken();
        const response = await fetch(`${apiURL}/viajes/${encodeURIComponent(cuil)}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
            }
        });
        
        if(response.status === 403) {
            const data = await response.json();
            handleAuthError(data);
            return;
        }
        setToken(response.headers.get('X-New-Token'));

        return response;
    } catch (error){
        console.log(error.message);
    }
}

export async function getPagosCuil(cuil) {
    try{
        const token = getToken();
        const response = await fetch(`${apiURL}/pagos/${encodeURIComponent(cuil)}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
            }
        });
        
        if(response.status === 403) {
            const data = await response.json();
            handleAuthError(data);
            return;
        }
        setToken(response.headers.get('X-New-Token'));

        return response;
    } catch (error){
        console.log(error.message);
    }
}

export async function getResumenCuil(cuil, cantidad) {
    try{
        const token = getToken();
        const response = await fetch(`${apiURL}/resumenes/getResumenCuil?cuil=${encodeURIComponent(cuil)}&cantidad=${encodeURIComponent(cantidad)}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
            }
        });
        
        if(response.status === 403) {
            const data = await response.json();
            handleAuthError(data);
            return;
        }
        setToken(response.headers.get('X-New-Token'));

        return response;
    } catch (error){
        console.log(error.message);
    }
}

export async function getFactura(cuil, id) {
    try{
        const token = getToken();
        const response = await fetch(`${apiURL}/facturas/descargar-factura?cuil=${encodeURIComponent(cuil)}&id=${encodeURIComponent(id)}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
            }
        });
        
        if(response.status === 403) {
            const data = await response.json();
            handleAuthError(data);
            return;
        }
        setToken(response.headers.get('X-New-Token'));

        return response;
    } catch (error){
        console.log(error.message);
    }
}

export async function getCartaPorte(cuil, comprobante) {
    try{
        const token = getToken();
        const response = await fetch(`${apiURL}/facturas/descargar-factura?cuil=${encodeURIComponent(cuil)}&comprobante=${encodeURIComponent(comprobante)}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
            }
        });
        
        if(response.status === 403) {
            const data = await response.json();
            handleAuthError(data);
            return;
        }
        setToken(response.headers.get('X-New-Token'));

        return response;
    } catch (error){
        console.log(error.message);
    }
}

export async function uploadFactura(viajeId, file, cuil, type = "viajes") {
    try{
        const token = getToken();
        const formData = new FormData();
        formData.append('viajeIds', JSON.stringify(viajeId)); // ID del viaje o viajes
        formData.append('factura', file); // Archivo PDF
        formData.append('cuil', cuil);
        formData.append('type',type);
        const response = await fetch(`${apiURL}/facturas/upload-factura`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
            },
            body: formData
        });
        
        if(response.status === 403) {
            const data = await response.json();
            handleAuthError(data);
            return;
        }
        setToken(response.headers.get('X-New-Token'));

        return response;
    } catch (error){
        console.log(error.message);
    }
}

export async function requestPasswordReset(cuil) {
    try {
        const response = await fetch(`${apiURL}/users/forgot-password?cuil=${encodeURIComponent(cuil)}`, {
            method: 'PUT'
        });

        if (!response.ok) {
            throw new Error(errorData.message || 'Error al solicitar el reinicio de contraseña');
        }

        return response;
    } catch (error) {
        console.error('Error en requestPasswordReset:', error);
        throw error;
    }
}

export async function resetPassword(token, newPassword) {
    try {
        const response = await fetch(`${apiURL}/users/reset-password`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ token, newPassword })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Error al restablecer la contraseña');
        }

        return response;
    } catch (error) {
        console.error('Error en resetPassword:', error);
        throw error;
    }
}