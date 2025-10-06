// /FRONTEND/js/sidebar.js

async function loadSidebar(role = 'admin ') { // Mantén el default 'admin'
    try {
        const sidebarFile = role === 'chofer' ? 'sidebar-chofer.html' : 'sidebar.html';
        const response = await fetch(`/FRONTEND/${sidebarFile}`); // Ruta correcta
        if (!response.ok) {
            throw new Error(`Error HTTP: ${response.status}`);
        }
        const sidebarHtml = await response.text();
        document.getElementById('sidebar-container').innerHTML = sidebarHtml;
        setupSidebarInteractions(); // Llama a la configuración de interacciones
    } catch (error) {
        console.error('Error al cargar el sidebar:', error);
    }
}

function setupSidebarInteractions() {
    const menuToggle = document.querySelector('.header .menu-toggle');
    const sidebar = document.querySelector('.sidebar');
    const sidebarItems = document.querySelectorAll('.sidebar-item');
    const content = document.querySelector('main.content');
    const header = document.querySelector('.header');

    if (!sidebar || !menuToggle || sidebarItems.length === 0 || !content || !header) {
        console.error("Elementos del sidebar/header/contenido no encontrados para configurar interacciones.");
        return;
    }

    menuToggle.addEventListener('click', function() {
        sidebar.classList.toggle('expanded');
        content.classList.toggle('expanded');
        header.classList.toggle('expanded-sidebar');
    });

    sidebarItems.forEach(item => {
        item.addEventListener('click', function() {
            // Puedes mantener estas líneas si quieres el efecto visual efímero antes de la redirección
            sidebarItems.forEach(el => el.classList.remove('active'));
            this.classList.add('active');
            
            const targetPage = this.dataset.targetPage;
            if (targetPage) {
                window.location.href = `/FRONTEND/${targetPage}`;
            } else {
                console.warn("El elemento del sidebar no tiene un atributo 'data-target-page'.");
            }
        });
    });
}
