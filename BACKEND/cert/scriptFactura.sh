#!/bin/bash
#
# Cliente del WSAA (webservice de autenticacion y autorizacion) para Linux.
# Consume el metodo LoginCms.
# Muestra en stdout el login ticket response.
#
# REQUISITOS: openssl, curl
#
# Parametros:
#   CERTIFICADO: Archivo del certificado firmante a usar
#   CLAVE_PRIVADA: Archivo de clave privada a usar
#   SERVICIO_ID: ID de servicio a acceder
#   OUT_XML: Archivo TRA a crear
#   OUT_CMS: Archivo CMS a crear
#   WSAA_WSDL: URL del WSDL del WSAA

set -e  # Detener en caso de error

# Parametros con valores por defecto
CERTIFICADO="${1:-certificado.crt}"
CLAVE_PRIVADA="${2:-MiClavePrivada.key}"
SERVICIO_ID="${3:-wsfe}"
OUT_XML="LoginTicketRequest_${SERVICIO_ID}.xml"
OUT_CMS="LoginTicketRequest_${SERVICIO_ID}.xml.cms"
WSAA_URL="https://wsaa.afip.gov.ar/ws/services/LoginCms"

# PASO 1: ARMAR EL XML DEL TICKET DE ACCESO
# Usar hora de Argentina (UTC-3)
export TZ='America/Argentina/Buenos_Aires'
FECHA_ACTUAL=$(date +"%Y-%m-%dT%H:%M:%S-03:00")
FECHA_GEN=$(date -d '-10 minutes' +"%Y-%m-%dT%H:%M:%S-03:00")
FECHA_EXP=$(date -d '+10 minutes' +"%Y-%m-%dT%H:%M:%S-03:00")
UNIQUE_ID=$(date +"%y%m%d%H%M")
SEQ_NR=$(date +"%Y%m%d%H%M%S")

# Crear el XML del ticket
cat > "${SEQ_NR}-${OUT_XML}" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<loginTicketRequest version="1.0">
<header>
    <uniqueId>${UNIQUE_ID}</uniqueId>
    <generationTime>${FECHA_GEN}</generationTime>
    <expirationTime>${FECHA_EXP}</expirationTime>
</header>
<service>${SERVICIO_ID}</service>
</loginTicketRequest>
EOF

echo "✓ XML generado: ${SEQ_NR}-${OUT_XML}"

# PASO 2: FIRMAR CMS
openssl cms -sign \
    -in "${SEQ_NR}-${OUT_XML}" \
    -signer "${CERTIFICADO}" \
    -inkey "${CLAVE_PRIVADA}" \
    -nodetach \
    -outform DER \
    -out "${SEQ_NR}-${OUT_CMS}-DER"

echo "✓ CMS firmado: ${SEQ_NR}-${OUT_CMS}-DER"

# PASO 3: ENCODEAR EL CMS EN BASE 64
openssl base64 -in "${SEQ_NR}-${OUT_CMS}-DER" -e -out "${SEQ_NR}-${OUT_CMS}-DER-b64"

echo "✓ CMS en Base64: ${SEQ_NR}-${OUT_CMS}-DER-b64"

# PASO 4: INVOCAR AL WSAA
CMS_B64=$(cat "${SEQ_NR}-${OUT_CMS}-DER-b64" | tr -d '\n')

# Crear el request SOAP
SOAP_REQUEST=$(cat << EOF
<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
   <soapenv:Header/>
   <soapenv:Body>
      <loginCms xmlns="http://wsaa.view.sua.dvadac.desein.afip.gov">
         <in0>${CMS_B64}</in0>
      </loginCms>
   </soapenv:Body>
</soapenv:Envelope>
EOF
)

# Invocar el servicio con curl
RESPONSE=$(curl -s -X POST "${WSAA_URL}" \
    -H "Content-Type: text/xml; charset=utf-8" \
    -H "SOAPAction: http://ar.gov.afip.dif.wsaa.webservices/loginCms" \
    -d "${SOAP_REQUEST}")

# Verificar si hay un Fault (error)
if echo "${RESPONSE}" | grep -q "<soapenv:Fault>"; then
    echo "✗ Error SOAP del WSAA"
    echo "${RESPONSE}" > "${SEQ_NR}-loginTicketResponse-ERROR_${SERVICIO_ID}.xml"
    echo "${RESPONSE}"
    exit 1
fi

# Extraer el contenido del loginCmsReturn usando sed y awk
LOGIN_CMS_RETURN=$(echo "${RESPONSE}" | xmllint --xpath 'string(//*[local-name()="loginCmsReturn"])' - 2>/dev/null)

if [ -z "$LOGIN_CMS_RETURN" ]; then
    echo "✗ No se pudo extraer loginCmsReturn de la respuesta"
    echo "${RESPONSE}" > "${SEQ_NR}-loginTicketResponse-ERROR_${SERVICIO_ID}.xml"
    echo "${RESPONSE}"
    exit 1
fi

# Decodificar entidades HTML y guardar
echo "${LOGIN_CMS_RETURN}" | sed 's/&lt;/</g; s/&gt;/>/g; s/&quot;/"/g; s/&apos;/'\''/g; s/&amp;/\&/g' > "${SEQ_NR}-loginTicketResponse_${SERVICIO_ID}.xml"

# Verificar que el archivo tiene contenido válido
if [ -s "${SEQ_NR}-loginTicketResponse_${SERVICIO_ID}.xml" ] && grep -q "<loginTicketResponse" "${SEQ_NR}-loginTicketResponse_${SERVICIO_ID}.xml"; then
    echo "✓ Respuesta guardada: ${SEQ_NR}-loginTicketResponse_${SERVICIO_ID}.xml"
    echo "✓ Token y Sign obtenidos correctamente"
    # Extraer fecha de expiración
    EXPIRATION=$(grep -o '<expirationTime>[^<]*</expirationTime>' "${SEQ_NR}-loginTicketResponse_${SERVICIO_ID}.xml" | sed 's/<[^>]*>//g')
    if [ -n "$EXPIRATION" ]; then
        echo "✓ Válido hasta: ${EXPIRATION}"
    fi
else
    echo "✗ Error al procesar la respuesta"
    echo "${RESPONSE}" > "${SEQ_NR}-loginTicketResponse-ERROR_${SERVICIO_ID}.xml"
    exit 1
fi
