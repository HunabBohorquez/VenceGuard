# VenceGuard — Control Preventivo de Vencimientos y Mantenimiento

> **Enlaces del proyecto**

**Link:** `https://hunabbohorquez.github.io/VenceGuard/`

**Repositorio en GitHub:** `https://github.com/HunabBohorquez/VenceGuard`

> 📝 **Nota:** este proyecto tiene los **mismos archivos** que el repositorio de GitLab
> (`index.html`, `styles.css`, `app.js`, `README.md`). Solo cambia la plataforma de alojamiento.

---

## Descripción del Proyecto

**VenceGuard** es una aplicación web *offline-first* desarrollada con **HTML5, CSS3 y JavaScript ES6+ Vanilla** (sin frameworks ni dependencias externas) diseñada para gestionar vencimientos de garantías, calibraciones de equipos de laboratorio, mantenimientos preventivos de hardware, pólizas y documentos críticos.

### Características Principales
- **Gestión CRUD completa** con persistencia local automática mediante `localStorage`.
- **Motor temporal libre de desfases UTC (`ExpirationEngine`):** normaliza todas las fechas a medianoche local (`00:00:00`) para evitar errores de un día por zona horaria.
- **Bitácora Histórica de Servicios:** cada renovación ejecutada registra el cumplimiento en el historial, acumula el costo total invertido y recalcula automáticamente la próxima fecha sumando el ciclo en días.
- **Visualización Analítica Nativa (`<canvas>`):** gráfico de barras interactivo con conmutación entre distribución de registros por estado y gasto acumulado por categoría.
- **Exportación portátil:** descarga instantánea de respaldos en **JSON** y reportes tabulares en **CSV** (con BOM UTF-8 para compatibilidad directa con Excel).

---

## Reglas de Clasificación del Semáforo

El motor `ExpirationEngine` calcula la diferencia en días calendario entre la fecha local actual y la fecha de próximo vencimiento, ordenando los registros automáticamente del más urgente al más lejano:

| Estado | Rango de Días Restantes | Indicador Visual | Prioridad |
| :--- | :--- | :--- | :--- |
| **Vencido** | `< 0 días` | Rojo (`#dc2626`) | Atención inmediata |
| **Urgente** | `0 a 7 días` | Naranja (`#ea580c`) | Ejecutar esta semana |
| **Próximo** | `8 a 30 días` | Amarillo (`#ca8a04`) | Planificar servicio |
| **Vigente** | `> 30 días` | Verde (`#16a34a`) | Bajo control preventivo |

---

## Instrucciones de Ejecución

1. Guarda los cuatro archivos (`index.html`, `styles.css`, `app.js`, `README.md`) dentro de una misma carpeta local.
2. Haz doble clic sobre el archivo **`index.html`** para abrirlo directamente en cualquier navegador web moderno (Chrome, Edge, Firefox, Safari).
3. No requiere servidor backend, compilación ni instalación de paquetes.

---

## Pruebas Verificables

### Prueba 1: Carga de Inventario Demo y Clasificación del Semáforo
1. Abre `index.html` en el navegador.
2. Haz clic en el botón **"Cargar Inventario Demo"** ubicado en la barra superior.
3. **Resultado esperado:**
   - Se crean 6 registros con fechas relativas dinámicas al día actual (`-3 días`, `+4 días`, `+15 días`, `+25 días`, `+90 días` y `+210 días`).
   - Los indicadores superiores (KPI) muestran: **1 Vencido**, **1 Urgente**, **2 Próximos** y **2 Vigentes**.
   - Las tarjetas aparecen ordenadas de arriba hacia abajo comenzando por el ítem vencido (`-3 días`) hasta el más lejano (`+210 días`).
   - El gráfico en `<canvas>` actualiza automáticamente las barras correspondientes.

### Prueba 2: Acción Rápida de Renovación y Registro en Bitácora
1. Ubica la tarjeta en estado **Vencido** (*"Calibración de Multímetro Fluke 117"*, con ciclo de `365 días` y costo `$850.00`).
2. Haz clic en el botón **"✓ Registrar Renovación / Mantenimiento"** dentro de dicha tarjeta.
3. **Resultado esperado:**
   - El contador de **Vencidos** baja a `0` y el de **Vigentes** sube a `3`.
   - La fecha de último evento del ítem cambia a la fecha de hoy y su próximo vencimiento avanza exactamente `+365 días`.
   - En el panel **"Bitácora Histórica de Servicios"** aparece una nueva entrada con la fecha de ejecución de hoy, la nueva fecha programada y el monto de `$850.00` sumado a la inversión total.
