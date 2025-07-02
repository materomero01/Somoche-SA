// Función asíncna para cargar el contenido HTML del sidebar
async function loadSidebar() {
    try {
        const response = await fetch('sidebar.html');
        if (!response.ok) {
            throw new Error(`Error HTTP: ${response.status}`);
        }
        const sidebarHtml = await response.text();
        document.getElementById('sidebar-container').innerHTML = sidebarHtml;
    } catch (error) {
        console.error('Error al cargar el sidebar:', error);
    }
}

// Función para configurar los listeners de eventos del sidebar
function setupSidebarInteractions() {
    // menuToggle se selecciona desde el header
    const menuToggle = document.querySelector('.header .menu-toggle');
    const sidebar = document.querySelector('.sidebar');
    const sidebarItems = document.querySelectorAll('.sidebar-item');
    const content = document.querySelector('.content');
    const header = document.querySelector('.header'); // Referencia al header

    if (!sidebar || !menuToggle || sidebarItems.length === 0 || !content || !header) {
        console.error("Elementos del sidebar/header/contenido no encontrados para configurar interacciones. Asegúrate de que todo esté cargado.");
        return;
    }

    // TOGGLE: Expansión/Contracción del sidebar
    menuToggle.addEventListener('click', function() {
        sidebar.classList.toggle('expanded');
        content.classList.toggle('expanded'); // Para mover el contenido
        header.classList.toggle('expanded-sidebar'); // Para ajustar el padding-left del header
    });

    // SELECCIÓN: Manejo de la clase 'active'
    sidebarItems.forEach(item => {
        item.addEventListener('click', function() {
            sidebarItems.forEach(el => el.classList.remove('active'));
            this.classList.add('active');
        });
    });
}