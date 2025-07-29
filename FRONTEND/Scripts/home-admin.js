function setupLayoutPruebaInteractions() {
    console.log("Interacciones específicas de Layout Prueba inicializadas.");
}

document.addEventListener('DOMContentLoaded', async function() {
    if (typeof loadHeader === 'function') {
        await loadHeader();
    } else {
        console.error("loadHeader no está definido. Asegúrate de que header.js se cargue correctamente.");
    }

    if (typeof loadSidebar === 'function') {
        const userRole = localStorage.getItem('userRole') || 'admin';
        await loadSidebar(userRole);
    } else {
        console.error("loadSidebar no está definido. Asegúrate de que sidebar.js se cargue correctamente.");
    }

    const currentPath = window.location.pathname;
    const sidebarItems = document.querySelectorAll('.sidebar-item');

    sidebarItems.forEach(item => {
        const targetPage = item.dataset.targetPage;
        if (targetPage && currentPath.includes(targetPage)) {
            sidebarItems.forEach(el => el.classList.remove('active'));
            item.classList.add('active');
        }
    });

    setupLayoutPruebaInteractions();
});