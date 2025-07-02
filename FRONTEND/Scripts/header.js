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

function setupHeaderInteractions() {
    const logoutIcon = document.querySelector('.header-icon'); // Selecciona el icono de logout

    if (logoutIcon) {
        logoutIcon.addEventListener('click', function() {
            // Lógica para el botón de logout
            alert('¡Logout!'); // Muestra una alerta simple
            console.log('Se ha hecho clic en el icono de logout.');

            // En una aplicación real, aquí iría la lógica de cierre de sesión:
            // 1. Eliminar tokens de autenticación (ej. de localStorage, sessionStorage)
            // localStorage.removeItem('authToken');
            // localStorage.removeItem('userRole'); // O cualquier otra información de sesión
            
            // 2. Redirigir al usuario a la página de inicio de sesión
            // window.location.href = 'login.html'; // Por ejemplo
        });
    }
}