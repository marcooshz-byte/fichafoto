# FichaFoto — Guía de despliegue

Foto de la hoja de fichajes en papel → Claude lee los datos → tú verificas → se guarda en Google Sheets.

Coste: solo la API de Claude (~céntimos por foto). Todo lo demás gratis.

## 1. Crear el Google Sheet

1. Crea un Sheet nuevo (vacío, la app crea la pestaña FICHAJES sola)
2. Copia el ID de la URL: `docs.google.com/spreadsheets/d/`**`ESTE_ID`**`/edit`

## 2. Apps Script

1. En el Sheet: Extensiones → Apps Script
2. Borra el contenido y pega `apps-script-fichaje-foto.gs`
3. Cambia `SHEET_ID` por el ID del paso 1
4. **API key (nunca en el código):** engranaje (Configuración del proyecto) → Propiedades del script → Añadir propiedad:
   - Propiedad: `CLAUDE_API_KEY`
   - Valor: tu key de console.anthropic.com
5. Implementar → Nueva implementación → Aplicación web:
   - Ejecutar como: **Yo**
   - Acceso: **Cualquier usuario**
6. Autoriza los permisos y copia la URL que acaba en `/exec`

⚠️ Recuerda (lección Vudú): si cambias el código más adelante, hay que crear una **implementación nueva**, no basta con guardar. La URL cambia: actualízala en la app.

Prueba rápida: pega la URL `/exec` en el navegador. Debe mostrar `{"ok":true,"info":"Fichaje Foto API operativa"}`.

## 3. Publicar la PWA

1. Sube `fichafoto.html` a tu repo de GitHub (puede ser el mismo de vudu-horarios, renombrado a `index.html` dentro de una carpeta `/fichafoto`)
2. GitHub Pages ya activo → la app queda en `marcooshz-byte.github.io/REPO/fichafoto/`
3. Ábrela en el móvil → pega la URL `/exec` → Guardar configuración (queda en localStorage, solo se hace una vez)

## 4. Uso semanal

1. Selecciona el lunes de la semana (si la foto tiene fecha escrita, la app la detecta y la ajusta sola)
2. Foto a la hoja: **plana, cenital, con luz, los 7 días visibles**
3. "Leer hoja con IA" (15-40 segundos)
4. Revisa la tabla:
   - Celdas **amarillas** = la IA no estaba segura → corrígelas mirando el papel
   - Vacío = no trabajó · número = horas · SI = se guarda tal cual
   - Puedes añadir empleados escritos a mano que falten (+ Añadir empleado)
5. "Guardar en Sheets" → una fila por empleado con la semana, los 14 valores día/noche y totales calculados (los "SI" no suman en los totales porque no son un número)

## Estructura del Sheet resultante

| SEMANA | NOMBRE | HORAS CONTRATO | L-DIA | L-NOC | ... | D-DIA | D-NOC | TOT DIA | TOT NOCHE |

## Problemas típicos

- **"Falta CLAUDE_API_KEY"** → paso 2.4 mal hecho o key mal pegada
- **Error CORS / Failed to fetch** → la implementación no tiene acceso "Cualquier usuario", o usaste la URL de editor en vez de la `/exec`
- **Lee mal muchas celdas** → casi siempre es la foto: inclinada, con sombra o cortada. Repite la foto antes de corregir 20 celdas a mano
- **Claude API error 401** → key inválida o sin crédito en console.anthropic.com
