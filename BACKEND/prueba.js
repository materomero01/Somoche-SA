const fs = require('fs');
const path = require('path');

// Directorio de certificados
const certDir = path.join(__dirname, 'cert');

// Función para limpiar el contenido del XML
function limpiarXML(xmlContent) {
  // Eliminar BOM (FF FE para UTF-16 LE) y cualquier carácter no imprimible o whitespace al inicio
  let cleaned = xmlContent.replace(/^\uFEFF+|^[\s\x00-\x1F]+/, '');
  // Buscar el primer '<?xml' y eliminar todo lo anterior
  const xmlStartIndex = cleaned.indexOf('<?xml');
  if (xmlStartIndex > 0) {
    cleaned = cleaned.substring(xmlStartIndex);
  }
  return cleaned;
}

// Función para extraer token y sign con regex
function extraerTokenSign(xmlContent) {
  // Limpiar el contenido
  const cleanedContent = limpiarXML(xmlContent);
  
  // Log del contenido limpio (primeros 500 caracteres o todo si es más corto)
  console.log(`Contenido limpio (primeros 500 caracteres): ${cleanedContent.substring(0, 500)}`);
  
  // Verificar si el contenido está vacío
  if (!cleanedContent) {
    throw new Error('El archivo XML está vacío');
  }
  
  // Verificar si contiene los tags esperados
  if (!cleanedContent.includes('<token>') || !cleanedContent.includes('<sign>')) {
    console.log('Estructura del XML:', cleanedContent); // Log completo para depuración
    throw new Error('El XML no contiene los tags <token> o <sign>');
  }
  
  // Regex para token y sign, soportando saltos de línea, espacios y variaciones
  const tokenRegex = /<token>\s*([\s\S]*?)\s*<\/token>/i;
  const signRegex = /<sign>\s*([\s\S]*?)\s*<\/sign>/i;
  
  const tokenMatch = cleanedContent.match(tokenRegex);
  const signMatch = cleanedContent.match(signRegex);
  
  if (!tokenMatch || !signMatch) {
    console.log('Estructura del XML:', cleanedContent); // Log completo para depuración
    throw new Error('No se encontraron token o sign en el XML');
  }
  
  return {
    token: tokenMatch[1].trim(),
    sign: signMatch[1].trim()
  };
}

// Función principal
function main() {
  try {
    // Buscar el archivo de respuesta más reciente
    const files = fs.readdirSync(certDir)
      .filter(f => f.endsWith('-loginTicketResponse_padron.xml'))
      .sort()
      .reverse();
    
    const latestResponse = files[0];
    if (!latestResponse) {
      throw new Error('No se encontraron archivos de respuesta en el directorio cert/');
    }

    console.log(`Procesando archivo: ${latestResponse}`);
    
    // Verificar tamaño del archivo
    const filePath = path.join(certDir, latestResponse);
    const stats = fs.statSync(filePath);
    if (stats.size === 0) {
      throw new Error('El archivo XML está vacío');
    }
    
    // Leer el archivo XML como UTF-16 LE y convertir a UTF-8
    const xmlContent = fs.readFileSync(filePath, 'utf16le');
    
    // Log del contenido original (primeros 100 caracteres)
    console.log(`Contenido original (primeros 100 caracteres): ${xmlContent.substring(0, 100)}`);
    
    // Extraer token y sign
    const credentials = extraerTokenSign(xmlContent);
    
    console.log('Token:', credentials.token);
    console.log('Sign:', credentials.sign);
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Ejecutar
main();