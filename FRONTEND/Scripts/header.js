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