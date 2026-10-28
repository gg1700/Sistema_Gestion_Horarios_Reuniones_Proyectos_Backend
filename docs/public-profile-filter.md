# T-16: Filtrado de perfiles según su visibilidad

## 1. Descripción

La función `filterPublicProfile()` permite obtener únicamente la información pública de un perfil de usuario.

Su objetivo es evitar que se muestren datos privados cuando otra persona consulta un perfil público.

La función recibe los datos completos del perfil, revisa la propiedad `visible` de cada elemento y devuelve solamente los datos que tienen permitido mostrarse.

## 2. Ubicación

La función se encuentra en:

`src/services/public-profile-filter.service.ts`

Las pruebas unitarias se encuentran en:

`tests/public-profile-filter.test.ts`

## 3. Funcionamiento

El filtrado utiliza las siguientes reglas:

**Datos básicos del perfil**

Se incluyen:

- Nombre de usuario (`handleName`).
- Nombre (`name`).
- Primer apellido (`firstSurname`).
- Fotografía de perfil (`profilePicture`).

Estos datos se devuelven cuando se permite acceder al perfil público.

**Datos que dependen de su visibilidad**

Se revisa la propiedad `visible` de los siguientes datos:

- Segundo apellido.
- Teléfonos.
- Correos electrónicos de contacto.
- Direcciones.
- Países.
- Experiencias laborales.
- Enlaces profesionales.
- Repositorios de GitHub.
- Actividad de GitHub.

Solamente se incluyen los elementos cuyo valor `visible` sea `true`.

Cuando `visible` es `false`, `null` o no está definido, el elemento no se muestra.

## 4. Protección de información privada

La función construye un nuevo objeto con los campos permitidos, en lugar de devolver directamente todos los datos del usuario.

De esta manera, evita incluir información interna como:

- Identificadores privados.
- Correo utilizado para iniciar sesión.
- Tokens de autenticación.
- Datos internos de auditoría.

Además, los elementos visibles se transforman para devolver únicamente los campos necesarios.

## 5. Ejemplo de funcionamiento

Supongamos que un usuario tiene:

- Nombre: Carlos.
- Teléfono personal: visible.
- Correo de contacto: privado.
- Dirección: privada.
- Experiencia laboral: visible.

El resultado del filtrado incluirá su nombre, teléfono y experiencia laboral.

El correo de contacto y la dirección no aparecerán en el perfil público.

## 6. Uso de la función

La función se importa desde el servicio correspondiente:

`import { filterPublicProfile } from "./public-profile-filter.service";`

Después se utiliza pasando un perfil completo:

`const publicProfile = filterPublicProfile(profile);`

El resultado contiene únicamente los campos permitidos.

Esta función puede reutilizarse tanto en la vista pública como en la vista previa del perfil, evitando repetir las reglas de filtrado.

## 7. Integración con el perfil público

La función se utiliza desde `getPublicProfile()`, ubicada en:

`src/services/profile.service.ts`

El proceso es el siguiente:

1. Buscar al usuario mediante su nombre de usuario.
2. Comprobar que su perfil público esté disponible.
3. Obtener la información del perfil.
4. Aplicar `filterPublicProfile()`.
5. Devolver los datos filtrados.

La disponibilidad del enlace público se controla antes de aplicar el filtro.

## 8. Pruebas realizadas

Se implementaron seis pruebas unitarias para comprobar el comportamiento del filtro.

También se realizaron pruebas en Postman utilizando el endpoint:

`GET /api/v1/public/profiles/:handle`

Se verificaron los siguientes casos:

- Consulta de un perfil público.
- Visualización de un teléfono marcado como público.
- Ocultación de un teléfono marcado como privado.
- Ocultación de datos privados por defecto.
- Bloqueo del acceso cuando el enlace público está desactivado.

Las pruebas confirmaron que los teléfonos públicos se muestran y los privados se ocultan correctamente.

## 9. Consideraciones

La función de filtrado admite repositorios y actividad de GitHub, pero su incorporación al endpoint público depende de que esos datos sean obtenidos y enviados al filtro.

El filtrado de GitHub está contemplado en las pruebas unitarias, pero su integración con datos reales queda pendiente.

La función no modifica la información almacenada en la base de datos. Únicamente determina qué datos se incluyen en la respuesta pública.

## 10. Conclusión

La implementación de la T-16 centraliza las reglas de visibilidad del perfil.

Esto permite reutilizar la misma función en diferentes partes del sistema y reduce el riesgo de mostrar información privada por error.