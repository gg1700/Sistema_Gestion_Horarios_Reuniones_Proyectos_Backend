# Callback OAuth2
Comprobaciones para que se puedan realizar las pruebas manuales
## Alcance

La funcionalidad vincula cuentas externas de Google y GitHub con un usuario **ya registrado y autenticado**. No implementa inicio de sesión social ni crea nuevos usuarios a partir de cuentas externas, falta implementacion de inicio de sesion con GitHub y Google, no es parte de la issue 27.

## Preparación

1. Ejecutar las migraciones, incluida `006-create-external-account-table.sql`.
2. Configurar credenciales del .env.example
3. Registrar un usuario de prueba con un correo valido de google y github mediante `POST /api/v1/auth/register` y copiar `data.session.token`.

## Iniciar el flujo en un único navegador

Abrir `http://localhost:3000/health`, acceder a la consola del navegador y ejecutar:

```javascript
const jwt = "PEGA_AQUI_EL_JWT_DE_PRUEBA";
const response = await fetch("/api/v1/auth/github?mode=json", {
  headers: { Authorization: `Bearer ${jwt}` },
  credentials: "include"
});
const result = await response.json();
if (!response.ok) throw new Error(result.message);
window.location.assign(result.authorizationUrl);
```

Cambiar `github` por `google` para probar Google. La cookie `oauth_flow` expira en cinco minutos. No iniciar en Thunder Client y continuar en otro navegador, ya que no comparten cookies.

## Casos manuales
Verificar en el enlace del frontend al cual mostrara los siguiente por ejemplo: localhost:5173/auth/result?oauth=success

| Caso | Resultado esperado |
| --- | --- |
| Google acepta permisos | `oauth=success` y fila Google en `external_account` |
| GitHub acepta permisos | `oauth=success` y fila GitHub en `external_account` |
| El usuario rechaza permisos | `oauth=access_denied` |
| Falta la cookie o el `state` cambia | `oauth=invalid_state` y ninguna inserción |
| Falta el código con estado correcto | `oauth=invalid_code` |
| Reautorizar la misma cuenta externa | Se actualiza la fila; no se duplica |
| Intentar vincular otro usuario externo del mismo proveedor | `oauth=account_conflict` |
| El proveedor no entrega refresh token | La vinculación puede funcionar; `refresh_token` admite NULL |

## Comprobación en PostgreSQL

```sql
SELECT *
FROM public.external_account;
```