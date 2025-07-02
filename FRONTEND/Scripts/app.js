document.addEventListener('DOMContentLoaded', async function() {
    // 1. Cargar el header HTML y configurar su contenido dinámico
    await loadHeader();
    setupHeaderDynamicContent();

    // 2. Cargar el sidebar HTML
    await loadSidebar();

    // 3. Configurar las interacciones del sidebar (expansión y selección)
    setupSidebarInteractions();
});