// /FRONTEND/scripts/mi-cuenta-chofer.js

document.addEventListener('DOMContentLoaded', async () => { // Hacemos el listener asíncrono
    // Carga el header (no necesita await si header.js no tiene dependencias críticas de DOM en loadHeader)
    if (typeof loadHeader === 'function') {
        loadHeader();
    } else {
        console.error("loadHeader no está definido. Asegúrate de cargar /FRONTEND/scripts/header.js.");
    }

    // Carga el sidebar y ESPERAMOS A QUE TERMINE
    if (typeof loadSidebar === 'function') {
        try {
            await loadSidebar('chofer'); // Usamos 'await' para esperar que el sidebar se cargue
        } catch (error) {
            console.error("Error al cargar el sidebar:", error);
        }
    } else {
        console.error("loadSidebar no está definido. Asegúrate de cargar /FRONTEND/scripts/sidebar.js.");
    }

    // --- INICIO: FUNCIONALIDAD PARA RESALTAR EL ÍTEM ACTIVO EN EL SIDEBAR ---
    // Esta lógica AHORA se ejecutará DESPUÉS de que el sidebar haya sido inyectado en el DOM
    const sidebarItems = document.querySelectorAll('.sidebar-item');
    if (sidebarItems.length === 0) {
        console.warn("No se encontraron elementos .sidebar-item. El sidebar podría no haberse cargado.");
    }

    sidebarItems.forEach(item => {
        const currentPath = window.location.pathname;
        const targetPage = item.dataset.targetPage;
        
        // La condición es que la ruta actual debe incluir el nombre de la página destino
        if (targetPage && currentPath.includes(targetPage)) {
            // Remueve la clase 'active' de todos los ítems para asegurar que solo uno esté activo
            sidebarItems.forEach(el => el.classList.remove('active'));
            // Añade la clase 'active' al ítem que corresponde a la página actual
            item.classList.add('active');
            console.log(`Sidebar item activo: ${targetPage}`); // Para depuración
        }
    });
    // --- FIN: FUNCIONALIDAD PARA RESALTAR EL ÍTEM ACTIVO EN EL SIDEBAR ---

    // Referencias a los elementos del DOM
    const accountForm = document.getElementById('account-form');
    // Asegurarse de que el formulario y sus inputs existan antes de manipularlos
    if (!accountForm) {
        console.error("El formulario 'account-form' no fue encontrado. Asegúrate de que tu HTML esté correcto.");
        return; // Salir si el formulario principal no existe
    }
    const inputs = accountForm.querySelectorAll('.text-input');
    const editButton = document.getElementById('edit-button');
    const saveButton = document.getElementById('save-button');
    const cancelButton = document.getElementById('cancel-button');

    let initialValues = {}; 

    function setViewMode() {
        inputs.forEach(input => {
            input.setAttribute('readonly', true);
            if (initialValues[input.id] !== undefined) {
                input.value = initialValues[input.id];
            }
        });
        editButton.classList.remove('hidden');
        saveButton.classList.add('hidden');
        cancelButton.classList.add('hidden');
        // console.log('Modo visualización activado. Valores restaurados.');
    }

    function setEditMode() {
        inputs.forEach(input => {
            initialValues[input.id] = input.value;
            input.removeAttribute('readonly');
        });
        editButton.classList.add('hidden');
        saveButton.classList.remove('hidden');
        cancelButton.classList.remove('hidden');
        // console.log('Modo edición activado.');
    }

    editButton.addEventListener('click', () => {
        setEditMode();
    });

    cancelButton.addEventListener('click', () => {
        setViewMode(); 
    });

    accountForm.addEventListener('submit', (event) => {
        event.preventDefault(); 
        
        const formData = new FormData(accountForm);
        const updatedData = {};
        for (let [key, value] of formData.entries()) {
            updatedData[key] = value;
        }
        console.log('Datos a guardar:', updatedData);

        alert('Simulando guardado: Cambios guardados exitosamente!');
        
        inputs.forEach(input => {
            initialValues[input.id] = input.value;
        });
        setViewMode(); 
        // console.log('Cambios guardados y modo visualización restaurado.');
    });

    // --- Inicialización de los datos al cargar la página ---
    const predefinedData = {
        'nombre-input': 'Juan Pedro Pérez',
        'cuil-input': '20-12345678-9',
        'telefono-input': '2262123456',
        'email-input': 'juan.pedro@example.com',
        'chasis-input': 'ABC-123', 
        'acoplado-input': 'XYZ-456' 
    };

    inputs.forEach(input => {
        if (predefinedData[input.id]) {
            input.value = predefinedData[input.id];
        }
    });

    inputs.forEach(input => {
        initialValues[input.id] = input.value;
    });

    setViewMode(); 
});