document.addEventListener('DOMContentLoaded', async function() {
    // 1. Cargar el header HTML y configurar su contenido dinámico
    await loadHeader();
    setupHeaderDynamicContent();

    // 2. Determinar el rol del usuario (simulado por ahora)
    const userRole = localStorage.getItem('userRole') || 'chofer'; // 'chofer' o 'admin'

    // 3. Cargar el sidebar correspondiente según el rol
    await loadSidebar(userRole);

    // 4. Configurar las interacciones del sidebar
    setupSidebarInteractions();
});

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
