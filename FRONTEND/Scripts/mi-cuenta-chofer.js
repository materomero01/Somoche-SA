// /FRONTEND/scripts/mi-cuenta-chofer.js

import { updateChofer, fetchChoferData, logout } from './apiPublic.js';

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
    const userNombre = localStorage.getItem('userName');
    const userCuil = localStorage.getItem('userCuil');
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

        

        try {
            const response = await updateChofer(userCuil, updatedData);

            if (response) {
                
                // Actualizar los valores iniciales con los nuevos datos guardados
                inputs.forEach(input => {
                    initialValues[input.id] = input.value;
                });
                alert('Cambios guardados exitosamente!');
                if (updatedData['nombre_y_apellido'] !== userNombre || updatedData['cuil'] !== userCuil){
                    alert("Reinicio requerido, vuelve a iniciar sesión por favor");
                    logout();
                }
            }
            
            
            setViewMode(); // Volver al modo de visualización

        } catch (error) {
            console.error('Error de red o desconocido al guardar datos del chofer:', error);
            alert('Error de conexión al guardar los datos del chofer.');
        }
    });
    // --- FIN: Lógica para enviar los cambios al backend ---

    async function loadChofer() {
        try {
            const {choferData, responseError } = await fetchChoferData(userCuil);

            if (responseError) {
                // Si hay un error, el spinner se ocultará en el finally, pero el formulario permanecerá oculto.
                // Podrías mostrar un mensaje de error permanente en el mainContentWrapper aquí si lo deseas.
                if (loadingSpinner) loadingSpinner.style.display = 'none'; 
                if (mainContentWrapper) mainContentWrapper.innerHTML = `<p class="error-message">${errorMessage}</p>`;
                return;
            }
            
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
    loadChofer();
});