// FRONTEND/scripts/login-register.js
const formSesion = document.getElementById("formSesion");
const targetsInputs = document.getElementsByClassName("target-input");
const regexInputs = {
    'cuil-input': /^\d{2}-\d{8}-\d{1}$/,
    'chasis-input': /^(?:[A-Za-z]{3} \d{3}|[A-Za-z]{2} \d{3} [A-Za-z]{2})$/,
    'acoplado-input': /^(?:[A-Za-z]{3} \d{3}|[A-Za-z]{2} \d{3} [A-Za-z]{2})$/,
    'telefono-input': /^\d{10}$/,
    'email-input': /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
};

export function seePassword(passwordId) {
    const iconoToggle = document.querySelector(".toggle");
    const inputPassword = document.getElementById("password-input");
    iconoToggle.addEventListener("click", (e) =>{
    if (inputPassword?.type ==="password"){
        inputPassword.type = "text";
        e.target.classList.replace("bi-eye-slash", "bi-eye");
    } else {
        inputPassword.type = "password";
        e.target.classList.replace("bi-eye","bi-eye-slash");
    }
    });
}

formSesion?.addEventListener("submit", async (event) => {
    event.preventDefault(); // Evita que el formulario se envíe por defecto
    
    var valid = true;
    for (let i=0; i < targetsInputs.length; i++)
    if(!validFormat(targetsInputs[i], regexInputs[targetsInputs[i].id], document.getElementById(targetsInputs[i].id + "-error")))
        valid = false;
    if(!valid) {return;}
    const isRegisterForm = document.getElementById('register');
    const userData = new FormData(formSesion);
    // Convertir FormData a un objeto plano y trim() los valores de cadena
    const payload = {};
    for (let [key, value] of userData.entries()) {
        payload[key] = typeof value === 'string' ? value.trim() : value;
    }
    
    let apiURL;
    let redirectURL;

    // Ajustar el payload y la URL según sea formulario de registro o login
    if (isRegisterForm){
        apiURL = 'http://localhost:3000/api/users/register';
        redirectURL = 'login.html';
        // Ajustar nombres de campos para el backend y añadir valores por defecto/null
        payload.nombre_y_apellido = payload.nombre; // Mapear 'nombre' del frontend a 'nombre_y_apellido' del backend
        payload.trabajador = payload.trabajador_seleccionado || 'Monotributista'; // Usar 'trabajador_seleccionado' o defecto
        payload.patente_chasis = payload.chasis?.toUpperCase() || null;
        payload.patente_acoplado = payload.acoplado?.toUpperCase() || null;
        payload.telefono = payload.telefono || null;
        payload.email = payload.email || null;

        // Eliminar campos originales del frontend si ya se mapearon o no se necesitan en el backend
        delete payload.nombre;
        delete payload.chasis;
        delete payload.acoplado;
        delete payload.trabajador_seleccionado;
    } else {
        apiURL = 'http://localhost:3000/api/users/login';
        redirectURL = 'layout-prueba.html';
    }

    console.log("Payload enviado:", payload);
    console.log("URL de la API:", apiURL);

    // --- Enviar datos al Backend ---
    try {
        const response = await fetch(apiURL, {
            method: 'POST', // El método es siempre POST para login y register
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (response.ok) {
            formSesion.reset(); // Limpiar el formulario
            
            if (!isRegisterForm && data.token) {
                localStorage.setItem('jwtToken', data.token);
                localStorage.setItem('userName', data.nombre_apellido);
                localStorage.setItem('userRole', data.role);
                localStorage.setItem('userCuil', data.cuil);
            }
            alert(data.message);
            window.location.href = redirectURL;
        } else {
            alert(`Error: "${data.message}"`);
            console.error('Error del backend:', data);
        }
    } catch (error) {
        console.error('Error de red al registrar o iniciar sesión:', error);
        alert('Error de conexión con el servidor.');
    }
});

document.addEventListener('DOMContentLoaded', async () => {
    seePassword("password-input");
});

/**
 * Parametros validFormat.
 * @param {HTMLElement} value
 * @param {regExp} regex
 * @param {HTMLElement} text
 * @returns {boolean} El resultado utilizado para enviar el form.
 */
function validFormat(input, regex, text){
    if (input.value !== '' && !regex.test(input.value)) {
        text.style.display = 'block';
        return false;
      } else {
        text.style.display = 'none';
        return true;
      }
}