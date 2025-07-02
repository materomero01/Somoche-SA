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

function setupHeaderDynamicContent() {
    const dateElement = document.getElementById('currentDate');
    const userNameElement = document.getElementById('userName');
    const userRoleElement = document.getElementById('userRole');

    // Fecha actual
    if (dateElement) {
        const today = new Date();
        const day = today.getDate();
        const month = today.getMonth() + 1;
        const year = today.getFullYear();
        const formattedDate = `${day}/${month}/${year}`;
        dateElement.textContent = formattedDate;
    }

    // Datos del usuario (simulados por ahora desde localStorage)
    const storedName = localStorage.getItem('userName') || 'Alejandro Moran';
    const storedRole = localStorage.getItem('userRole') || 'Admin';

    if (userNameElement) {
        userNameElement.textContent = storedName;
    }

    if (userRoleElement) {
        userRoleElement.textContent = storedRole;
    }
}
