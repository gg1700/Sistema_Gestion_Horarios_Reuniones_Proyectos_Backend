# Renovación automática del access token de Google Calendar

## 1. Descripción general

Este módulo implementa la renovación automática del access token de Google OAuth2 para la integración con Google Calendar.

## 2. Arquitectura

La implementación está organizada en tres componentes:

- `src/repositories/google-token.repository.ts`: consulta las credenciales de Google, actualiza los tokens cifrados y gestiona los estados de reconexión.
- `src/services/google-token-provider.service.ts`: solicita nuevos access tokens mediante el endpoint OAuth2 de Google.
- `src/services/google-token.service.ts`: coordina la validación, renovación, persistencia y control de concurrencia.

## 3. Flujo de renovación

1. El servicio recibe el identificador del usuario autenticado.
2. Consulta la cuenta Google asociada en `external_account`.
3. Bloquea el registro mediante `SELECT ... FOR UPDATE` de PostgreSQL.
4. Verifica que la cuenta esté activa y comprueba la fecha de expiración del access token.
5. Si el token tiene más de cinco minutos de vigencia, lo descifra y devuelve.
6. Si está expirado o próximo a expirar, descifra el refresh token y solicita un nuevo access token a Google.
7. Cifra y almacena el nuevo token junto con su fecha de expiración.
8. Devuelve el access token válido al servicio interno que lo solicitó.

## 4. Utilización del servicio

Los demás servicios del backend pueden obtener un access token válido mediante:

```typescript
import { getValidGoogleAccessToken } from "./google-token.service";

const accessToken = await getValidGoogleAccessToken(userId);
```


## 5. Control de concurrencia

Para evitar renovaciones simultáneas de una misma cuenta, se utiliza el bloqueo de registros de PostgreSQL mediante `SELECT ... FOR UPDATE`.

Cuando varias solicitudes intentan renovar el token del mismo usuario:

1. La primera solicitud bloquea el registro.
2. Las demás solicitudes esperan a que finalice la transacción.
3. La primera solicitud renueva y almacena el token.
4. Las siguientes solicitudes consultan el valor actualizado y lo reutilizan si continúa vigente.


## 6. Manejo de errores

| Error | Comportamiento |
|---|---|
| `google_not_connected` | No existe una cuenta Google autorizada para Calendar. |
| `reconnection_required` | El usuario debe volver a autorizar Google Calendar. |
| `refresh_revoked` | Google devolvió `invalid_grant`; se marca la conexión para reconexión. |
| `refresh_failed` | Ocurrió un error temporal, de red o una respuesta inválida del proveedor. No se revoca la autorización. |

Cuando se requiere reconexión, se actualizan los siguientes registros:

- `external_account.state` pasa a `revoked`.
- `calendar_connection.status` pasa a `reconnection_required` para los calendarios asociados.


## 8. Pruebas automatizadas

Se implementaron pruebas unitarias para verificar los siguientes escenarios:

- Access token vigente que no requiere renovación.
- Access token próximo a expirar.
- Access token expirado.
- Renovación exitosa y actualización de credenciales.
- Refresh token revocado.
- Ausencia de refresh token.
- Fallo temporal del proveedor.
- Usuario sin cuenta Google conectada.
- Respuestas válidas e inválidas del endpoint OAuth2.