const apiURL = 'http://localhost:3000/api';

// Obtener el token desde localStorage
export function getToken() {
    const token = localStorage.getItem('jwtToken');
    if (!token) {
        handleAuthError(new Error('No se encontró token JWT en localStorage.'));
    }
    return token;
}

// Función para cerrar sesión
export function logout() {
    localStorage.clear();
    window.location.href = "login.html";
}

// --- Lógica del Modal de Confirmación ---
export function showConfirmModal(message, type = "", onConfirm = () => {}, onCancel) {
    const modal = document.getElementById('confirmModal');
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

export function handleAuthorization () {
    const userRole = localStorage.getItem('userRole');
    if (!userRole || userRole !== 'admin'){
        alert("No tienes autorización para realizar esta acción");
        logout();
    }
}

// Manejar errores de autenticación
export function handleAuthError(error) {
    console.error(error.message);
    alert('Tu sesión ha expirado o es inválida. Por favor, inicia sesión de nuevo.');
    logout();
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
        let errorMessage = null;
        if (!response.ok) {
            const errorData = await response.json();
            console.error('Error al obtener datos del chofer:', response.status, errorData.message);
            errorMessage= 'Error desconocido al cargar datos.';
            if (response.status === 403) {
                    errorMessage = 'No tienes permiso para ver esta información. (Asegúrate de ser Admin o ver tus propios datos)';
            } else if (response.status === 404) {
                    errorMessage = 'Chofer no encontrado.';
            } else if (response.status === 401) {
                    errorMessage = 'Sesión expirada o no autorizada. Por favor, inicia sesión de nuevo.';
                    // Redirigir al login si la sesión expira o no está autorizada
                    handleAuthError(new Error(errorMessage));
                    return; // Salir de la función para evitar más procesamiento
            }
            alert(errorMessage);
        }
        const choferData = await response.json();
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
        const data = await response.json();
        if(response.status === 403) {
            handleAuthError(data.message);
            return;
        }
        if (!response.ok){
            
            alert(data.message);
        }
        return response.ok;
    } catch (error) {
        console.log(error.message);
    }
}

// Get pagos cheques
export async function getCheques(pagados, choferCuil) {
    try {
        const token = getToken();
        const response = await fetch(`${apiURL}/pagos/getPagosCheques?pagado=${encodeURIComponent(pagados)}&choferCuil=${encodeURIComponent(choferCuil)}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
            }
        });
        const data = await response.json();
        if(response.status === 403) {
            handleAuthError(data.message);
            return;
        }
        if (!response.ok) {
            alert(data.message);
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
            const data = response.json();
            handleAuthError(data.message);
            return;
        }

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
            const data = response.json();
            handleAuthError(data.message);
            return;
        }

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
            const data = response.json();
            handleAuthError(data.message);
            return;
        }

        return response;
    } catch (error){
        console.log(error.message);
    }
}

export async function uploadFactura(viajeId, file, cuil) {
    try{
        const token = getToken();
        const formData = new FormData();
        formData.append('viajeIds', JSON.stringify(viajeId)); // ID del viaje o viajes
        formData.append('factura', file); // Archivo PDF
        formData.append('cuil', cuil);
        const response = await fetch(`${apiURL}/facturas/upload-factura`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
            },
            body: formData
        });

        if(response.status === 403) {
            const data = response.json();
            handleAuthError(data.message);
            return;
        }

        return response;
    } catch (error){
        console.log(error.message);
    }
}