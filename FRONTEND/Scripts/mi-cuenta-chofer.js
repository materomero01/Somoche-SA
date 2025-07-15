// /FRONTEND/scripts/mi-cuenta-chofer.js

document.addEventListener('DOMContentLoaded', async () => {
    // Carga el header
    if (typeof loadHeader === 'function') {
        loadHeader();
    } else {
        console.error("loadHeader no está definido. Asegúrate de cargar /FRONTEND/scripts/header.js.");
    }

    // Carga el sidebar y ESPERAMOS A QUE TERMINE
    if (typeof loadSidebar === 'function') {
        try {
            await loadSidebar('chofer');
        } catch (error) {
            console.error("Error al cargar el sidebar:", error);
        }
    } else {
        console.error("loadSidebar no está definido. Asegúrate de cargar /FRONTEND/scripts/sidebar.js.");
    }

    // --- INICIO: FUNCIONALIDAD PARA RESALTAR EL ÍTEM ACTIVO EN EL SIDEBAR ---
    const sidebarItems = document.querySelectorAll('.sidebar-item');
    if (sidebarItems.length === 0) {
        console.warn("No se encontraron elementos .sidebar-item. El sidebar podría no haberse cargado.");
    }

    sidebarItems.forEach(item => {
        const currentPath = window.location.pathname;
        const targetPage = item.dataset.targetPage;
        
        if (targetPage && currentPath.includes(targetPage)) {
            sidebarItems.forEach(el => el.classList.remove('active'));
            item.classList.add('active');
            console.log(`Sidebar item activo: ${targetPage}`);
        }
    });
    // --- FIN: FUNCIONALIDAD PARA RESALTAR EL ÍTEM ACTIVO EN EL SIDEBAR ---

    // Nuevas referencias al spinner y al contenedor de contenido
    const loadingSpinner = document.getElementById('loading-spinner');
    const mainContentWrapper = document.getElementById('main-content-wrapper');

    // Referencias a los elementos del DOM del formulario
    const accountForm = document.getElementById('account-form');
    if (!accountForm) {
        console.error("El formulario 'account-form' no fue encontrado. Asegúrate de que tu HTML esté correcto.");
        // Si el formulario no existe, ocultar spinner y no intentar mostrar el contenido
        if (loadingSpinner) loadingSpinner.style.display = 'none';
        return; 
    }
    
    const inputs = accountForm.querySelectorAll('.text-input, select');
    const editButton = document.getElementById('edit-button');
    const saveButton = document.getElementById('save-button');
    const cancelButton = document.getElementById('cancel-button');

    let initialValues = {}; 

    function setViewMode() {
        inputs.forEach(input => {
            if (input.tagName === 'SELECT') {
                input.setAttribute('disabled', true);
            } else {
                input.setAttribute('readonly', true);
            }
            if (initialValues[input.id] !== undefined) {
                input.value = initialValues[input.id];
            }
        });
        
        editButton.classList.remove('hidden');
        saveButton.classList.add('hidden');
        cancelButton.classList.add('hidden');
    }

    function setEditMode() {
        inputs.forEach(input => {
            initialValues[input.id] = input.value;
            if (input.tagName === 'SELECT') {
                input.removeAttribute('disabled');
            } else {
                input.removeAttribute('readonly');
            }
        });
        
        editButton.classList.add('hidden');
        saveButton.classList.remove('hidden');
        cancelButton.classList.remove('hidden');
    }

    editButton.addEventListener('click', () => {
        setEditMode();
    });

    cancelButton.addEventListener('click', () => {
        setViewMode(); 
    });

    // --- INICIO: Lógica para enviar los cambios al backend ---
    accountForm.addEventListener('submit', async (event) => { // Hacemos la función asíncrona
        event.preventDefault(); 
        
        const formData = new FormData(accountForm);
        const updatedData = {};
        for (let [key, value] of formData.entries()) {
            // Mapeo de nombres de campos del frontend a los esperados por el backend
            if (key === 'nombre') {
                updatedData['nombre_y_apellido'] = value;
            } else if (key === 'chasis') {
                updatedData['patente_chasis'] = value;
            } else if (key === 'acoplado') {
                updatedData['patente_acoplado'] = value;
            }
            else {
                updatedData[key] = value;
            }
        }
        
        console.log('Datos a guardar (frontend):', updatedData);

        const token = localStorage.getItem('jwtToken');
        const userCuil = localStorage.getItem('userCuil');

        if (!token || !userCuil) {
            alert('No se pudo guardar: Sesión no iniciada o token/CUIL faltante.');
            console.error('Token o CUIL del usuario no encontrado para guardar.');
            return;
        }

        try {
            const response = await fetch(`${BASE_URL}/choferes/updateChofer/${userCuil}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(updatedData)
            });

            if (!response.ok) {
                const errorData = await response.json();
                console.error('Error al guardar datos del chofer:', response.status, errorData.message);
                alert(`Error al guardar cambios: ${errorData.message || 'Error desconocido'}`);
                return;
            }

            const successData = await response.json();
            console.log('Datos guardados exitosamente:', successData);
            alert('Cambios guardados exitosamente!');
            
            // Actualizar los valores iniciales con los nuevos datos guardados
            inputs.forEach(input => {
                initialValues[input.id] = input.value;
            });
            setViewMode(); // Volver al modo de visualización

        } catch (error) {
            console.error('Error de red o desconocido al guardar datos del chofer:', error);
            alert('Error de conexión al guardar los datos del chofer.');
        }
    });
    // --- FIN: Lógica para enviar los cambios al backend ---

    // --- INICIO: Carga de datos del chofer desde el backend ---
    const BASE_URL = 'http://localhost:3000/api'; // Asegúrate que este sea el puerto correcto de tu backend

    // 1. Obtener el token y el CUIL del usuario logueado
    const token = localStorage.getItem('jwtToken');
    const userCuil = localStorage.getItem('userCuil');

    if (!token || !userCuil) {
        console.error('Token o CUIL del usuario no encontrado en localStorage. Redirigiendo al login...');
        window.location.href = '/FRONTEND/login.html';
        // Ocultar spinner si no hay token/CUIL y no se cargará nada
        if (loadingSpinner) loadingSpinner.style.display = 'none'; 
        return;
    }

    async function fetchChoferData(cuil, authToken) {
        try {
            const response = await fetch(`${BASE_URL}/choferes/${cuil}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                }
            });

            if (!response.ok) {
                const errorData = await response.json();
                console.error('Error al obtener datos del chofer:', response.status, errorData.message);
                let errorMessage = 'Error desconocido al cargar datos.';
                if (response.status === 403) {
                     errorMessage = 'No tienes permiso para ver esta información. (Asegúrate de ser Admin o ver tus propios datos)';
                } else if (response.status === 404) {
                     errorMessage = 'Chofer no encontrado.';
                } else if (response.status === 401) {
                     errorMessage = 'Sesión expirada o no autorizada. Por favor, inicia sesión de nuevo.';
                     // Redirigir al login si la sesión expira o no está autorizada
                     window.location.href = '/FRONTEND/login.html';
                     return; // Salir de la función para evitar más procesamiento
                }
                alert(errorMessage);
                // Si hay un error, el spinner se ocultará en el finally, pero el formulario permanecerá oculto.
                // Podrías mostrar un mensaje de error permanente en el mainContentWrapper aquí si lo deseas.
                if (mainContentWrapper) mainContentWrapper.innerHTML = `<p class="error-message">${errorMessage}</p>`;
                return;
            }

            const choferData = await response.json();
            console.log('Datos del chofer obtenidos:', choferData);

            // Rellenar los inputs del formulario con los datos obtenidos
            document.getElementById('nombre-input').value = choferData.nombre || '';
            document.getElementById('cuil-input').value = choferData.cuil || '';
            document.getElementById('telefono-input').value = choferData.telefono || '';
            document.getElementById('email-input').value = choferData.email || '';
            document.getElementById('trabajador-input').value = choferData.trabajador || '';
            document.getElementById('chasis-input').value = choferData.patente_chasis || '';
            document.getElementById('acoplado-input').value = choferData.patente_acoplado || '';

            // Guardar los valores iniciales después de cargar los datos
            inputs.forEach(input => {
                initialValues[input.id] = input.value;
            });
            setViewMode(); // Asegurarse de que los inputs estén en modo solo lectura al cargar

        } catch (error) {
            console.error('Error de red o desconocido al obtener datos del chofer:', error);
            alert('Error de conexión al cargar los datos del chofer.');
            if (mainContentWrapper) mainContentWrapper.innerHTML = `<p class="error-message">Error de conexión al cargar los datos.</p>`;
        } finally {
            // Ocultar el spinner y mostrar el contenido (o el mensaje de error si lo hay)
            if (loadingSpinner) loadingSpinner.style.display = 'none';
            if (mainContentWrapper) mainContentWrapper.style.display = 'block'; 
        }
    }

    // Llamar a la función para cargar los datos al inicio
    fetchChoferData(userCuil, token);
});