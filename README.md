# Oferta de Análisis · Preanalítica — PWA final

Aplicación progresiva para consultar y administrar localmente la oferta de análisis del laboratorio clínico.

## Compatibilidad con la versión anterior

La aplicación conserva la base IndexedDB `preanalitica_db`. Al reemplazar los archivos del repositorio, las fichas y el PIN guardados en el mismo navegador y origen continúan disponibles.

Antes de actualizar, entre al modo administrador de la aplicación actual y exporte un respaldo JSON.

## Catálogo inicial

La aplicación nunca borra una base local existente para instalar una versión nueva.

Cuando la base está vacía, intenta cargar el catálogo en este orden:

1. `data.json` ubicado junto a `index.html`.
2. Una copia inmutable del catálogo original publicada en el commit `f81ad4c7355fd4e06f1e00b086373b7184ef17ee` del repositorio.

Después de la primera carga, el catálogo queda guardado en IndexedDB y puede consultarse sin conexión.

Para dejar la publicación completamente autónoma, ejecute `preparar_publicacion.bat` antes de subirla. Este comando descarga el catálogo original y crea `data.json` dentro de la carpeta.

## Prueba en Windows

No requiere Node.js ni `npx`.

1. Extraiga todo el ZIP.
2. Ejecute `iniciar.bat`.
3. Abra `http://localhost:8000` si el navegador no se abre automáticamente.

El iniciador usa Python cuando está disponible y, en caso contrario, usa `servidor.ps1`.

## Publicación en GitHub Pages

1. Exporte un respaldo desde la aplicación actual.
2. Opcionalmente ejecute `preparar_publicacion.bat` para incluir `data.json`.
3. Suba **el contenido interno** de esta carpeta a la raíz del repositorio `Pwaoferta`.
4. Mantenga las carpetas `icons`, `js` y `tests`.
5. Espere la publicación de GitHub Pages.
6. Abra la página con conexión una vez y recárguela cuando aparezca el aviso de actualización.

## PIN

El PIN inicial es `1234`. Al utilizarlo por primera vez, se migra automáticamente desde el formato heredado a PBKDF2-SHA-256. El PIN es una protección local contra modificaciones accidentales; no sustituye un sistema institucional de autenticación.

## Respaldo

El respaldo JSON contiene el catálogo y el historial de cambios. La importación reemplaza la base local únicamente después de validar la estructura y pedir confirmación.
