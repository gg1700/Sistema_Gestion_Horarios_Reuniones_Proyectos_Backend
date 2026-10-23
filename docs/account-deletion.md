# Eliminación de cuenta

## Endpoint

`DELETE /api/v1/profile` requiere una sesión válida y recibe:

```json
{
  "confirmation": "ELIMINAR"
}
```

También se puede confirmar con el correo principal o uno de los correos de
contacto del usuario. Los correos se comparan sin distinguir mayúsculas; la
palabra `ELIMINAR` debe escribirse en mayúsculas. La cuenta se obtiene del token.

| Código | Resultado |
| --- | --- |
| 200 | Cuenta eliminada correctamente. |
| 400 | Confirmación ausente o incorrecta. |
| 401 | Sesión inválida, usuario inexistente o eliminado. |
| 429 | Más de cinco intentos por IP en quince minutos. |
| 500 | No se pudo completar la eliminación. |

## Datos del usuario

Se conserva la fila de `user` como borrado lógico:

- `status` pasa a `deleted` y se registra `deleted_at`.
- `handle_name` se reemplaza por `deleted-<uuid>`, liberando el nombre original.
- `name`, `first_surname`, `email`, `password_hash` y `profile_picture` quedan en `NULL`.
- `public_link_active` pasa a `false`.

Se borran físicamente el segundo apellido, las asociaciones de correos,
teléfonos y países, las direcciones, la experiencia laboral y los enlaces.
Los registros de `phone` y `email` se borran si ya no están asociados a otro
usuario. El catálogo de países se conserva.

La limpieza también elimina las filas de otras tablas relacionadas con `user`
mediante una clave foránea, como cuentas externas, calendario, repositorios,
actividad y visibilidad, cuando esos módulos estén instalados. Las relaciones
deben usar `ON DELETE CASCADE` para permitir una futura purga de la fila de usuario.

La migración `011_account_deletion_strategy.sql` admite los estados `active`,
`inactive` y `deleted`. Los datos básicos siguen siendo obligatorios para los
usuarios que no tienen `deleted_at`.

## Sesiones y cuentas externas

Después de confirmar la transacción, los tokens anteriores se rechazan en las
rutas de perfil. Una petición de guardado concurrente vuelve a comprobar al
usuario antes de escribir, para evitar que se creen datos después del borrado.

Antes de borrar las cuentas externas se intenta revocar su acceso en Google y
GitHub. Cada petición tiene un límite de cinco segundos. Si el proveedor falla,
el token ya estaba revocado o no se puede descifrar, se registra el error y se
continúa con la eliminación, sin escribir tokens en los logs.

Los tokens guardados en `external_account` se descifran con `ENCRYPTION_KEY`,
que debe ser la misma clave usada al vincular la cuenta. Si esa tabla no está
instalada, no se realizan llamadas a proveedores.

El borrado local se realiza en una sola transacción. Si falla, se revierten los
cambios de PostgreSQL. Una revocación ya realizada en un proveedor no se puede
revertir con esa transacción.

## Pruebas

Con las migraciones aplicadas en PostgreSQL local, ejecutar desde `Backend`:

```powershell
$env:NODE_ENV = 'test'
npm test -- tests/profile.delete.test.ts tests/account-revocation.test.ts
Remove-Item Env:NODE_ENV
```

Las pruebas cubren la confirmación, el borrado de datos, los contactos compartidos,
el rechazo de sesiones anteriores, el enlace público inactivo, las escrituras
concurrentes, el rollback y el límite de peticiones. Los proveedores se simulan
para comprobar revocaciones exitosas, tokens revocados y fallos de conexión.

Para comprobarlo manualmente con una cuenta de prueba:

1. Enviar una confirmación incorrecta y comprobar la respuesta `400`.
2. Enviar `ELIMINAR` y comprobar la respuesta `200`.
3. Consultar `GET /api/v1/profile` con el mismo token y comprobar la respuesta `401`.
4. Registrar otra cuenta con el handle y correo originales para comprobar que quedaron libres.
