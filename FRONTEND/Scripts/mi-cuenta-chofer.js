// /FRONTEND/scripts/mi-cuenta-chofer.js

// Importar las nuevas funciones desde api.js
import { fetchChoferData as apiFetchChoferData, updateChofer } from './api.js';

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
    accountForm.addEventListener('submit', async (event) => {
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

        const userCuil = localStorage.getItem('userCuil');

        if (!userCuil) {
            alert('No se pudo guardar: CUIL de usuario faltante.');
            console.error('CUIL del usuario no encontrado para guardar.');
            return;
        }

        try {
            // Usar la función importada de api.js para la actualización
            const successData = await updateChofer(userCuil, updatedData);
            
            console.log('Datos guardados exitosamente:', successData);
            alert('Cambios guardados exitosamente!');
            
            // Actualizar los valores iniciales con los nuevos datos guardados
            inputs.forEach(input => {
                initialValues[input.id] = input.value;
            });
            setViewMode(); // Volver al modo de visualización

        } catch (error) {
            console.error('Error al guardar datos del chofer:', error);
            alert(`Error al guardar cambios: ${error.message || 'Error desconocido'}`);
        }
    });
    // --- FIN: Lógica para enviar los cambios al backend ---

    // --- INICIO: Carga de datos del chofer desde el backend ---
    // La BASE_URL ya no es necesaria aquí, se maneja en api.js
    // const BASE_URL = 'http://localhost:3000/api'; 

    const userCuil = localStorage.getItem('userCuil');

    if (!userCuil) {
        console.error('CUIL del usuario no encontrado en localStorage. Redirigiendo al login...');
        window.location.href = '/FRONTEND/login.html';
        // Ocultar spinner si no hay CUIL y no se cargará nada
        if (loadingSpinner) loadingSpinner.style.display = 'none'; 
        return;
    }

    async function loadChoferDataAndRender() {
        try {
            // Usar la función importada de api.js para obtener los datos
            const choferData = await apiFetchChoferData(userCuil);
            
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
            console.error('Error al obtener datos del chofer:', error);
            let displayMessage = `Error al cargar los datos: ${error.message || 'Error desconocido'}`;
            // Puedes añadir lógica para redirigir si el error es por autenticación, por ejemplo
            if (error.message.includes('Token inválido o expirado') || error.message.includes('No se encontró token JWT')) {
                alert('Tu sesión ha expirado o es inválida. Por favor, inicia sesión de nuevo.');
                // Redirigir al login
                window.location.href = '/FRONTEND/login.html';
                return; 
            }
            alert(displayMessage);
            if (mainContentWrapper) mainContentWrapper.innerHTML = `<p class="error-message">${displayMessage}</p>`;
        } finally {
            // Ocultar el spinner y mostrar el contenido (o el mensaje de error si lo hay)
            if (loadingSpinner) loadingSpinner.style.display = 'none';
            if (mainContentWrapper) mainContentWrapper.style.display = 'block'; 
        }
    }

    // Llamar a la función principal que carga los datos y maneja el renderizado
    loadChoferDataAndRender();
});