#
# Cliente del WSAA para ws_sr_padron_a5.
# Consume el metodo LoginCms ejecutando desde PowerShell de Windows.
# Muestra en stdout el login ticket response.
#
# REQUISITOS: openssl
#
# Parametros de linea de comandos:
#
#   $Certificado: Archivo del certificado firmante a usar
#   $ClavePrivada: Archivo de clave privada a usar
#   $ServicioId: ID de servicio a acceder (ws_sr_padron_a5)
#   $OutXml: Archivo TRA a crear
#   $OutCms: Archivo CMS a crear
#   $WsaaWsdl: URL del WSDL del WSAA
#
[CmdletBinding()]
Param(
   [Parameter(Mandatory=$False)]
   [string]$Certificado="certificado_homo.crt",
	
   [Parameter(Mandatory=$False)]
   [string]$ClavePrivada="MiClavePrivada_homo.key",
   
   [Parameter(Mandatory=$False)]
   [string]$ServicioId="ws_sr_padron_a13",
   
   [Parameter(Mandatory=$False)]
   [string]$OutXml="LoginTicketRequest_$ServicioId.xml",
   
   [Parameter(Mandatory=$False)]
   [string]$OutCms="LoginTicketRequest_$ServicioId.xml.cms",
   
   [Parameter(Mandatory=$False)]
   [string]$WsaaWsdl="https://wsaahomo.afip.gov.ar/ws/services/LoginCms?WSDL"
)

$ErrorActionPreference = "Stop"

# PASO 1: ARMAR EL XML DEL TICKET DE ACCESO
$dtNow = Get-Date
$xmlTA = New-Object System.XML.XMLDocument
$xmlTA.LoadXml('<loginTicketRequest><header><uniqueId></uniqueId><generationTime></generationTime><expirationTime></expirationTime></header><service></service></loginTicketRequest>')
$xmlUniqueId = $xmlTA.SelectSingleNode("//uniqueId")
$xmlGenTime = $xmlTA.SelectSingleNode("//generationTime")
$xmlExpTime = $xmlTA.SelectSingleNode("//expirationTime")
$xmlService = $xmlTA.SelectSingleNode("//service")
$xmlGenTime.InnerText = $dtNow.AddMinutes(-10).ToString("s")
$xmlExpTime.InnerText = $dtNow.AddMinutes(+10).ToString("s")
$xmlUniqueId.InnerText = $dtNow.ToString("yyMMddHHMM")
$xmlService.InnerText = $ServicioId
$seqNr = Get-Date -UFormat "%Y%m%d%H%M%S"
$xmlTA.InnerXml | Out-File $seqNr-$OutXml -Encoding ASCII

# PASO 2: FIRMAR CMS
openssl cms -sign -in $seqNr-$OutXml -signer $Certificado -inkey $ClavePrivada -nodetach -outform der -out $seqNr-$OutCms-DER

# PASO 3: ENCODEAR EL CMS EN BASE 64
openssl base64 -in $seqNr-$OutCms-DER -e -out $seqNr-$OutCms-DER-b64

# PASO 4: INVOCAR AL WSAA
try
{
   $cms = Get-Content $seqNr-$OutCms-DER-b64 -Raw
   $wsaa = New-WebServiceProxy -Uri $WsaaWsdl -ErrorAction Stop
   $wsaaResponse = $wsaa.loginCms($cms)
   # ">" usa la codificacion por defecto de Out-File (UTF-16LE en Windows PowerShell 5.1),
   # que Node no puede leer como texto plano; se fuerza UTF-8 explicitamente.
   $wsaaResponse | Out-File -FilePath "$seqNr-loginTicketResponse_$ServicioId.xml" -Encoding UTF8
   $wsaaResponse
}
catch
{
   $errMsg = $_.Exception.Message
   $errMsg > $seqNr-loginTicketResponse_$ServicioId-ERROR.xml
   $errMsg
}