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
    for (let [key, value] of userData.entries()) {
        userData[key] = value.trim();
    }
    console.log(userData);
    let apiURL;
    let redirectURL;
    let payload = {
        cuil: userData['cuil'],
        password: userData['password'],
    };
    if (isRegisterForm){
        apiURL = 'http://localhost:3000/api/users/register';
        redirectURL = 'login.html';
        methodURL = 'POST';
        payload = {
            ...payload,
            nombre_y_apellido: userData['nombre'],
            trabajador: userData['trabajador_seleccionado'] || 'Monotributista', // Asegúrate que el name del input sea 'trabajador-input'
            patente_chasis: userData['chasis']?.toUpperCase() || null,
            patente_acoplado: userData['acoplado']?.toUpperCase() || null,
            telefono: userData['telefono'] || null,
            email: userData['email'] || null,
        };
    } else {
        apiURL = 'http://localhost:3000/api/users/login';
        redirectURL = 'layout-prueba.html';
    }
    console.log(payload);
    console.log(apiURL);
    // --- Enviar datos al Backend ---
    try {
        const response = await fetch(apiURL, {
            method: 'POST',
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
            }
            alert(data.message);
            window.location.href = redirectURL;
        } else {
            alert(`Error: "${data.message}"`);
            console.error('Error del backend:', data);
        }
    } catch (error) {
        console.error('Error de red al registrar usuario:', error);
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