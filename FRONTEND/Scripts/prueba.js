// app.js

document.addEventListener('DOMContentLoaded', async function() {
    // 1. Cargar el header HTML y configurar su contenido dinámico
    await loadHeader();
    setupHeaderDynamicContent();
    setupHeaderInteractions();

    // 2. Determinar el rol del usuario (simulado por ahora)
    const userRole = localStorage.getItem('userRole') || 'chofer'; // 'chofer' o 'admin'

    // 3. Cargar el sidebar correspondiente según el rol
    await loadSidebar(userRole);

    // 4. Configurar las interacciones del sidebar
    setupSidebarInteractions();

    // 5. Configurar las interacciones del searchbar
    // ¡AQUÍ ES DONDE LLAMAS A LA FUNCIÓN, NO LA DEFINES!
    setupSearchBarInteractions();
    
    setupTabSelectors(); 
});


// ===============================================
// FUNCIONES GENERALES DEL PROYECTO
// (Estas funciones deben estar fuera del DOMContentLoaded)
// ===============================================


// Función asíncrona para cargar el contenido HTML del header
async function loadHeader() {
    try {
        const response = await fetch('header.html');
        if (!response.ok) {
            throw new Error(`Error HTTP: ${response.status}`);
        }
        const headerHtml = await response.text();
        document.getElementById('header-container').innerHTML = headerHtml;
    } catch (error) {
        console.error('Error al cargar el header:', error);
    }
}

// Función para configurar el contenido dinámico del header (fecha, nombre, etc.)
function setupHeaderDynamicContent() {
    const dateElement = document.getElementById('currentDate');
    if (dateElement) {
        const today = new Date();
        const day = today.getDate();
        const month = today.getMonth() + 1;
        const year = today.getFullYear();
        const formattedDate = `${day}/${month}/${year}`;
        dateElement.textContent = formattedDate;
    }
}

// Carga dinámica del sidebar según el rol
async function loadSidebar(role) {
    try {
        const sidebarFile = role === 'chofer' ? 'sidebar-chofer.html' : 'sidebar.html';
        const response = await fetch(sidebarFile);
        if (!response.ok) throw new Error(`Error HTTP: ${response.status}`);
        const sidebarHtml = await response.text();
        document.getElementById('sidebar-container').innerHTML = sidebarHtml;
    } catch (error) {
        console.error('Error al cargar el sidebar:', error);
    }
}

// Función para configurar los listeners de eventos del sidebar
function setupSidebarInteractions() {
    const menuToggle = document.querySelector('.header .menu-toggle');
    const sidebar = document.querySelector('.sidebar');
    const sidebarItems = document.querySelectorAll('.sidebar-item');
    const content = document.querySelector('.content');
    const header = document.querySelector('.header');

    if (!sidebar || !menuToggle || sidebarItems.length === 0 || !content || !header) {
        console.error("Elementos del sidebar/header/contenido no encontrados para configurar interacciones. Asegúrate de que todo esté cargado.");
        return;
    }

    menuToggle.addEventListener('click', function() {
        sidebar.classList.toggle('expanded');
        content.classList.toggle('expanded');
        header.classList.toggle('expanded-sidebar');
    });

    sidebarItems.forEach(item => {
        item.addEventListener('click', function() {
            sidebarItems.forEach(el => el.classList.remove('active'));
            this.classList.add('active');
        });
    });
}

// Función para configurar las interacciones de la barra de búsqueda
// ¡ESTA FUNCIÓN DEBE ESTAR FUERA DEL DOMContentLoaded!
function setupSearchBarInteractions() {
    const choferesSearchBarInput = document.querySelector('#choferesSearchBar .search-input');
    const choferesSearchIcon = document.querySelector('#choferesSearchBar .search-icon');

    if (choferesSearchBarInput) {
        choferesSearchBarInput.addEventListener('input', function() {
            const searchTerm = this.value.toLowerCase();
            console.log('Buscando choferes:', searchTerm);
            // Aquí iría la lógica para filtrar tu lista/tabla de choferes
            // Por ejemplo: filterChoferesTable(searchTerm);
        });

        choferesSearchBarInput.addEventListener('keydown', function(event) {
            if (event.key === 'Enter') {
                const searchTerm = this.value.toLowerCase();
                console.log('Búsqueda de choferes finalizada:', searchTerm);
                alert(`Realizando búsqueda completa de choferes para: "${searchTerm}"`);
                // Aquí iría la lógica de búsqueda "completa" (ej. llamada a API)
            }
        });
    }
        // --- ¡NUEVO CÓDIGO PARA EL ICONO! ---
    if (choferesSearchIcon) {
        choferesSearchIcon.addEventListener('click', function() {
            // Cuando se hace clic en el icono, obtenemos el valor del input asociado
            const searchTerm = choferesSearchBarInput.value.toLowerCase();
            console.log('Búsqueda de choferes finalizada (al hacer clic en el icono):', searchTerm);
            alert(`Realizando búsqueda completa de choferes para: "${searchTerm}"`);
            // Aquí llamarías a la misma lógica de búsqueda "completa"
            // que se ejecuta cuando se presiona Enter.
            // Por ejemplo: performFullChoferesSearch(searchTerm);
        });
    }
}


function setupTabSelectors() {
    const tabSelectors = document.querySelectorAll('.tab-selector');

    tabSelectors.forEach(selector => {
        const tabItems = selector.querySelectorAll('.tab-item');
        
        tabItems.forEach(item => {
            item.addEventListener('click', function() {
                // 1. Quitar 'active' de todas las pestañas dentro de este selector
                tabItems.forEach(tab => tab.classList.remove('active'));
                // 2. Añadir 'active' a la pestaña clicada
                this.classList.add('active');

                // 3. Obtener el ID/valor de la pestaña clicada
                const selectedTab = this.dataset.tab; // 'proximos', 'pagos', 'clientes', 'choferes', 'viajes', etc.
                const parentSelectorId = selector.id; // ID del selector (ej. 'proximosPagosSelector')

                console.log(`Selector "${parentSelectorId}" - Pestaña seleccionada: ${selectedTab}`);

                // Llamar a la función de manejo de contenido global/de la vista
                handleTabContentDisplay(parentSelectorId, selectedTab); 
            });
        });

        // Al cargar la página, asegúrate de que el contenido de la pestaña activa inicial se muestre
        const initialActiveTab = selector.querySelector('.tab-item.active');
        if (initialActiveTab) {
            const initialSelectedTab = initialActiveTab.dataset.tab;
            const parentSelectorId = selector.id;
            handleTabContentDisplay(parentSelectorId, initialSelectedTab);
        }
    });
}

// Lógica para mostrar/ocultar el CONTENIDO según el selector y la pestaña activa
function handleTabContentDisplay(selectorId, selectedTab) {
    console.log(`[handleContentDisplay] Procesando cambio para selector "${selectorId}", pestaña "${selectedTab}"`);

    // --- Lógica para 'proximosPagosSelector' ---
    if (selectorId === 'proximosPagosSelector') {
        const contentProximos = document.getElementById('content-proximos');
        const contentPagos = document.getElementById('content-pagos');

        // Oculta todos los contenidos de este grupo primero, luego muestra el activo
        if (contentProximos) contentProximos.classList.add('hidden');
        if (contentPagos) contentPagos.classList.add('hidden');

        if (selectedTab === 'proximos') {
            if (contentProximos) contentProximos.classList.remove('hidden');
        } else if (selectedTab === 'pagos') {
            if (contentPagos) contentPagos.classList.remove('hidden');
        }
    } 
    // --- Lógica para 'choferesClientesSelector' ---
    else if (selectorId === 'choferesClientesSelector') {
        const contentChoferes = document.getElementById('content-choferes');
        const contentClientes = document.getElementById('content-clientes');

        // Oculta todos los contenidos de este grupo primero, luego muestra el activo
        if (contentChoferes) contentChoferes.classList.add('hidden');
        if (contentClientes) contentClientes.classList.add('hidden');

        if (selectedTab === 'choferes') {
            if (contentChoferes) contentChoferes.classList.remove('hidden');
        } else if (selectedTab === 'clientes') {
            if (contentClientes) contentClientes.classList.remove('hidden');
        }
    }
    // --- Lógica para 'viajesPagosSelector' ---
    // ¡IMPORTANTE!: Usar los nuevos IDs de contenido
    else if (selectorId === 'viajesPagosSelector') {
        const contentViajes = document.getElementById('content-viajes');
        const contentPagosViajes = document.getElementById('content-pagos-viajes'); // Usar el ID ÚNICO

        // Oculta todos los contenidos de este grupo primero, luego muestra el activo
        if (contentViajes) contentViajes.classList.add('hidden');
        if (contentPagosViajes) contentPagosViajes.classList.add('hidden');

        if (selectedTab === 'viajes') { // El data-tab ahora es 'viajes'
            if (contentViajes) contentViajes.classList.remove('hidden');
        } else if (selectedTab === 'pagos-viajes') { // El data-tab ahora es 'pagos-viajes'
            if (contentPagosViajes) contentPagosViajes.classList.remove('hidden');
        }
    }
}