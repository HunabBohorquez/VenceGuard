/**
 * VenceGuard — Control Preventivo de Vencimientos, Garantías y Bitácora Técnica
 * Arquitectura modular en JavaScript ES6+ Vanilla sin dependencias externas.
 */

/* ============================================================================
 * 1. ExpirationEngine: Motor de fechas locales sin desfases UTC y semáforo
 * ========================================================================== */
class ExpirationEngine {
  static MS_PER_DAY = 86_400_000;

  static STATUS_META = {
    EXPIRED: {
      code: 'EXPIRED',
      label: 'Vencido',
      color: '#dc2626',
      order: 1
    },
    URGENT: {
      code: 'URGENT',
      label: 'Urgente',
      color: '#ea580c',
      order: 2
    },
    UPCOMING: {
      code: 'UPCOMING',
      label: 'Próximo',
      color: '#ca8a04',
      order: 3
    },
    VALID: {
      code: 'VALID',
      label: 'Vigente',
      color: '#16a34a',
      order: 4
    }
  };

  /**
   * Devuelve la fecha local actual normalizada exactamente a las 00:00:00.000
   */
  static getTodayLocalMidnight() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  /**
   * Parsea un string 'YYYY-MM-DD' como fecha local a medianoche evitando el desfase UTC.
   */
  static parseLocalDate(isoDateStr) {
    if (!isoDateStr || typeof isoDateStr !== 'string') {
      return this.getTodayLocalMidnight();
    }
    const [year, month, day] = isoDateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  /**
   * Formatea un objeto Date local a 'YYYY-MM-DD'.
   */
  static formatISODate(dateObj) {
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Formatea una fecha 'YYYY-MM-DD' para visualización legible en español.
   */
  static formatDisplayDate(isoDateStr) {
    const date = this.parseLocalDate(isoDateStr);
    return date.toLocaleDateString('es-MX', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }

  /**
   * Suma N días calendario a una fecha 'YYYY-MM-DD' o Date y devuelve 'YYYY-MM-DD'.
   */
  static addDays(baseDate, daysToAdd) {
    const dateObj = baseDate instanceof Date
      ? new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate())
      : this.parseLocalDate(baseDate);
    dateObj.setDate(dateObj.getDate() + Number(daysToAdd));
    return this.formatISODate(dateObj);
  }

  /**
   * Calcula los días restantes entre hoy (medianoche local) y la fecha objetivo.
   */
  static getDaysRemaining(targetIsoDate) {
    const today = this.getTodayLocalMidnight();
    const target = this.parseLocalDate(targetIsoDate);
    const diffMs = target.getTime() - today.getTime();
    return Math.round(diffMs / this.MS_PER_DAY);
  }

  /**
   * Evalúa el estado del semáforo de un registro preventivo.
   */
  static evaluate(nextDueDate) {
    const daysRemaining = this.getDaysRemaining(nextDueDate);
    let meta;

    if (daysRemaining < 0) {
      meta = this.STATUS_META.EXPIRED;
    } else if (daysRemaining <= 7) {
      meta = this.STATUS_META.URGENT;
    } else if (daysRemaining <= 30) {
      meta = this.STATUS_META.UPCOMING;
    } else {
      meta = this.STATUS_META.VALID;
    }

    let countdownText = '';
    if (daysRemaining < -1) {
      countdownText = `Vencido hace ${Math.abs(daysRemaining)} días`;
    } else if (daysRemaining === -1) {
      countdownText = 'Venció ayer';
    } else if (daysRemaining === 0) {
      countdownText = 'Vence hoy';
    } else if (daysRemaining === 1) {
      countdownText = 'Vence mañana (1 día)';
    } else {
      countdownText = `Faltan ${daysRemaining} días`;
    }

    return {
      daysRemaining,
      statusCode: meta.code,
      statusLabel: meta.label,
      statusColor: meta.color,
      priorityOrder: meta.order,
      countdownText
    };
  }
}

/* ============================================================================
 * 2. MaintenanceStore: Persistencia en localStorage, CRUD, Bitácora y Exportación
 * ========================================================================== */
class MaintenanceStore {
  static STORAGE_KEY_ITEMS = 'venceguard_items_v1';
  static STORAGE_KEY_LOGS = 'venceguard_logs_v1';

  constructor() {
    this.items = this._loadFromStorage(MaintenanceStore.STORAGE_KEY_ITEMS, []);
    this.logs = this._loadFromStorage(MaintenanceStore.STORAGE_KEY_LOGS, []);
  }

  _loadFromStorage(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      console.error(`Error leyendo ${key} desde localStorage:`, error);
      return fallback;
    }
  }

  _save() {
    localStorage.setItem(MaintenanceStore.STORAGE_KEY_ITEMS, JSON.stringify(this.items));
    localStorage.setItem(MaintenanceStore.STORAGE_KEY_LOGS, JSON.stringify(this.logs));
  }

  _generateId(prefix = 'vg') {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  }

  getAllEvaluatedItems() {
    return this.items
      .map(item => ({
        ...item,
        evaluation: ExpirationEngine.evaluate(item.nextDate)
      }))
      .sort((a, b) => a.evaluation.daysRemaining - b.evaluation.daysRemaining);
  }

  getLogs() {
    return [...this.logs].sort((a, b) => b.timestamp - a.timestamp);
  }

  getTotalInvested() {
    const activeCost = this.items.reduce((acc, item) => acc + Number(item.cost || 0), 0);
    const historyCost = this.logs.reduce((acc, log) => acc + Number(log.cost || 0), 0);
    return activeCost + historyCost;
  }

  upsertItem(payload) {
    const normalized = {
      id: payload.id || this._generateId('item'),
      name: payload.name.trim(),
      category: payload.category,
      lastDate: payload.lastDate,
      nextDate: payload.nextDate,
      cycleDays: Math.max(1, parseInt(payload.cycleDays, 10) || 30),
      cost: Math.max(0, parseFloat(payload.cost) || 0),
      notes: (payload.notes || '').trim()
    };

    const existingIndex = this.items.findIndex(i => i.id === normalized.id);
    if (existingIndex >= 0) {
      this.items[existingIndex] = normalized;
    } else {
      this.items.push(normalized);
    }

    this._save();
    return normalized;
  }

  deleteItem(id) {
    this.items = this.items.filter(item => item.id !== id);
    this._save();
  }

  /**
   * Registra cumplimiento con fecha de hoy en la bitácora histórica y
   * avanza la próxima fecha de vencimiento sumando los días del ciclo.
   */
  registerRenewal(id) {
    const index = this.items.findIndex(item => item.id === id);
    if (index === -1) return null;

    const item = this.items[index];
    const todayIso = ExpirationEngine.formatISODate(ExpirationEngine.getTodayLocalMidnight());
    const newNextDate = ExpirationEngine.addDays(todayIso, item.cycleDays);

    const logEntry = {
      id: this._generateId('log'),
      itemId: item.id,
      itemName: item.name,
      category: item.category,
      completedDate: todayIso,
      previousDueDate: item.nextDate,
      newDueDate: newNextDate,
      cost: Number(item.cost || 0),
      timestamp: Date.now()
    };

    this.items[index] = {
      ...item,
      lastDate: todayIso,
      nextDate: newNextDate
    };

    this.logs.unshift(logEntry);
    this._save();
    return { updatedItem: this.items[index], logEntry };
  }

  clearLogs() {
    this.logs = [];
    this._save();
  }

  /**
   * Carga 6 registros de demostración con fechas relativas dinámicas a hoy:
   * -3 días, +4 días, +15 días, +25 días, +90 días y +210 días.
   */
  loadDemoInventory() {
    const today = ExpirationEngine.getTodayLocalMidnight();
    const todayIso = ExpirationEngine.formatISODate(today);

    const demoRecords = [
      {
        id: this._generateId('demo'),
        name: 'Calibración de Multímetro Fluke 117',
        category: 'Mantenimiento PC y Lab',
        lastDate: ExpirationEngine.addDays(today, -368),
        nextDate: ExpirationEngine.addDays(today, -3),
        cycleDays: 365,
        cost: 850.00,
        notes: 'Verificar certificado de trazabilidad y estado de puntas de prueba.'
      },
      {
        id: this._generateId('demo'),
        name: 'Seguro de Responsabilidad Civil y Vehículo',
        category: 'Seguros y Licencias',
        lastDate: ExpirationEngine.addDays(today, -361),
        nextDate: ExpirationEngine.addDays(today, 4),
        cycleDays: 365,
        cost: 6450.00,
        notes: 'Póliza anual cobertura amplia. Revisar deducible antes de renovar.'
      },
      {
        id: this._generateId('demo'),
        name: 'Cambio de Pasta Térmica y Limpieza Workstation',
        category: 'Mantenimiento PC y Lab',
        lastDate: ExpirationEngine.addDays(today, -165),
        nextDate: ExpirationEngine.addDays(today, 15),
        cycleDays: 180,
        cost: 320.00,
        notes: 'Aplicar pasta Arctic MX-6 en CPU/GPU y limpiar filtros antipolvo.'
      },
      {
        id: this._generateId('demo'),
        name: 'Renovación de Certificado Firma Electrónica (e.firma)',
        category: 'Documentos y Trámites',
        lastDate: ExpirationEngine.addDays(today, -1435),
        nextDate: ExpirationEngine.addDays(today, 25),
        cycleDays: 1460,
        cost: 0.00,
        notes: 'Tramitar renovación en línea con archivo .key, .cer y contraseña vigente.'
      },
      {
        id: this._generateId('demo'),
        name: 'Servicio Mayor y Cambio de Aceite Sintético 5W-30',
        category: 'Hogar y Vehículo',
        lastDate: ExpirationEngine.addDays(today, -90),
        nextDate: ExpirationEngine.addDays(today, 90),
        cycleDays: 180,
        cost: 1450.00,
        notes: 'Incluye cambio de filtro de aceite, filtro de aire y rotación de neumáticos.'
      },
      {
        id: this._generateId('demo'),
        name: 'Garantía Extendida Laptop Ingeniería RTX',
        category: 'Garantías y Electrónica',
        lastDate: ExpirationEngine.addDays(today, -155),
        nextDate: ExpirationEngine.addDays(today, 210),
        cycleDays: 365,
        cost: 1890.00,
        notes: 'Cobertura directa con fabricante por fallas de tarjeta madre y batería.'
      }
    ];

    this.items = demoRecords;
    this.logs = [
      {
        id: this._generateId('log'),
        itemId: demoRecords[4].id,
        itemName: 'Servicio Preventivo Anterior — Aceite 5W-30',
        category: 'Hogar y Vehículo',
        completedDate: ExpirationEngine.addDays(today, -90),
        previousDueDate: ExpirationEngine.addDays(today, -90),
        newDueDate: demoRecords[4].nextDate,
        cost: 1380.00,
        timestamp: Date.now() - 86400000
      }
    ];
    this._save();
    return todayIso;
  }

  exportJSON() {
    const payload = {
      exportedAt: new Date().toISOString(),
      app: 'VenceGuard',
      items: this.getAllEvaluatedItems(),
      serviceLogs: this.getLogs()
    };
    return JSON.stringify(payload, null, 2);
  }

  exportCSV() {
    const headers = [
      'ID',
      'Nombre',
      'Categoría',
      'Estado',
      'Días Restantes',
      'Último Evento',
      'Próximo Vencimiento',
      'Ciclo (Días)',
      'Costo ($)',
      'Notas Técnicas'
    ];

    const escapeCell = value => `"${String(value ?? '').replace(/"/g, '""')}"`;

    const rows = this.getAllEvaluatedItems().map(item => [
      item.id,
      item.name,
      item.category,
      item.evaluation.statusLabel,
      item.evaluation.daysRemaining,
      item.lastDate,
      item.nextDate,
      item.cycleDays,
      Number(item.cost).toFixed(2),
      item.notes
    ].map(escapeCell).join(','));

    return [headers.join(','), ...rows].join('\n');
  }
}

/* ============================================================================
 * 3. StatusChart: Renderizado de gráfico de barras nativo en <canvas>
 * ========================================================================== */
class StatusChart {
  constructor(canvasElement) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d');
    this.mode = 'STATUS'; // 'STATUS' | 'CATEGORY'
  }

  setMode(mode) {
    this.mode = mode;
  }

  render(evaluatedItems) {
    const ctx = this.ctx;
    const width = this.canvas.width;
    const height = this.canvas.height;

    ctx.clearRect(0, 0, width, height);

    const dataset = this.mode === 'STATUS'
      ? this._buildStatusDataset(evaluatedItems)
      : this._buildCategoryDataset(evaluatedItems);

    const padding = { top: 28, right: 24, bottom: 48, left: 54 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    const maxValue = Math.max(...dataset.map(d => d.value), 1);

    // Líneas guía horizontales
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.font = '11px sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.textAlign = 'right';

    const steps = 4;
    for (let i = 0; i <= steps; i++) {
      const y = padding.top + chartHeight - (chartHeight / steps) * i;
      const tickValue = (maxValue / steps) * i;
      const label = this.mode === 'STATUS'
        ? Math.round(tickValue).toString()
        : `$${Math.round(tickValue)}`;

      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();

      ctx.fillText(label, padding.left - 8, y + 4);
    }

    // Dibujar barras
    const slotWidth = chartWidth / dataset.length;
    const barWidth = Math.min(54, slotWidth * 0.56);

    dataset.forEach((entry, idx) => {
      const barHeight = (entry.value / maxValue) * chartHeight;
      const x = padding.left + slotWidth * idx + (slotWidth - barWidth) / 2;
      const y = padding.top + chartHeight - barHeight;

      // Barra con esquinas superiores redondeadas
      ctx.fillStyle = entry.color;
      ctx.beginPath();
      const radius = Math.min(6, barHeight / 2);
      ctx.moveTo(x, y + barHeight);
      ctx.lineTo(x, y + radius);
      ctx.quadraticCurveTo(x, y, x + radius, y);
      ctx.lineTo(x + barWidth - radius, y);
      ctx.quadraticCurveTo(x + barWidth, y, x + barWidth, y + radius);
      ctx.lineTo(x + barWidth, y + barHeight);
      ctx.closePath();
      ctx.fill();

      // Valor encima de cada barra
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      const formattedVal = this.mode === 'STATUS'
        ? `${entry.value}`
        : `$${entry.value.toLocaleString('es-MX', { maximumFractionDigits: 0 })}`;
      ctx.fillText(formattedVal, x + barWidth / 2, y - 7);

      // Etiqueta eje X
      ctx.fillStyle = '#475569';
      ctx.font = '11px sans-serif';
      ctx.fillText(entry.shortLabel, x + barWidth / 2, height - padding.bottom + 18);
    });
  }

  _buildStatusDataset(items) {
    const counts = { EXPIRED: 0, URGENT: 0, UPCOMING: 0, VALID: 0 };
    items.forEach(item => {
      counts[item.evaluation.statusCode] += 1;
    });

    return [
      { shortLabel: 'Vencidos', value: counts.EXPIRED, color: '#dc2626' },
      { shortLabel: 'Urgentes', value: counts.URGENT, color: '#ea580c' },
      { shortLabel: 'Próximos', value: counts.UPCOMING, color: '#ca8a04' },
      { shortLabel: 'Vigentes', value: counts.VALID, color: '#16a34a' }
    ];
  }

  _buildCategoryDataset(items) {
    const categories = [
      { name: 'Garantías y Electrónica', shortLabel: 'Electrónica', color: '#2563eb' },
      { name: 'Mantenimiento PC y Lab', shortLabel: 'PC y Lab', color: '#7c3aed' },
      { name: 'Documentos y Trámites', shortLabel: 'Documentos', color: '#0891b2' },
      { name: 'Seguros y Licencias', shortLabel: 'Seguros', color: '#d97706' },
      { name: 'Hogar y Vehículo', shortLabel: 'Hogar/Auto', color: '#059669' }
    ];

    return categories.map(cat => {
      const totalCost = items
        .filter(item => item.category === cat.name)
        .reduce((sum, item) => sum + Number(item.cost || 0), 0);

      return {
        shortLabel: cat.shortLabel,
        value: totalCost,
        color: cat.color
      };
    });
  }
}

/* ============================================================================
 * 4. UIController: Orquestación del DOM, eventos, filtros y descargas
 * ========================================================================== */
class UIController {
  constructor() {
    this.store = new MaintenanceStore();
    this.chart = new StatusChart(document.getElementById('analyticsCanvas'));

    this.filters = {
      status: 'ALL',
      category: 'ALL',
      query: ''
    };

    this._cacheElements();
    this._bindEvents();
    this.renderAll();
  }

  _cacheElements() {
    this.elItemsContainer = document.getElementById('itemsContainer');
    this.elServiceLogList = document.getElementById('serviceLogList');
    this.elSearchInput = document.getElementById('searchInput');
    this.elCategoryFilter = document.getElementById('categoryFilter');
    this.elKpiCards = document.querySelectorAll('.kpi-card');

    // KPIs
    this.elKpiTotal = document.getElementById('kpiTotal');
    this.elKpiTotalCost = document.getElementById('kpiTotalCost');
    this.elKpiExpired = document.getElementById('kpiExpired');
    this.elKpiUrgent = document.getElementById('kpiUrgent');
    this.elKpiUpcoming = document.getElementById('kpiUpcoming');
    this.elKpiValid = document.getElementById('kpiValid');

    // Modal & Form
    this.elModal = document.getElementById('itemModal');
    this.elForm = document.getElementById('itemForm');
    this.elModalTitle = document.getElementById('modalTitle');
    this.elInputId = document.getElementById('itemId');
    this.elInputName = document.getElementById('itemName');
    this.elInputCategory = document.getElementById('itemCategory');
    this.elInputCycle = document.getElementById('itemCycle');
    this.elInputLastDate = document.getElementById('itemLastDate');
    this.elInputNextDate = document.getElementById('itemNextDate');
    this.elInputCost = document.getElementById('itemCost');
    this.elInputNotes = document.getElementById('itemNotes');

    // Toast
    this.elToast = document.getElementById('toast');
  }

  _bindEvents() {
    document.getElementById('btnOpenModal').addEventListener('click', () => this.openCreateModal());
    document.getElementById('btnCloseModal').addEventListener('click', () => this.elModal.close());
    document.getElementById('btnCancelModal').addEventListener('click', () => this.elModal.close());

    // Cálculo automático sugerido de próximo vencimiento al cambiar fecha base o ciclo
    const autoSuggestNextDate = () => {
      if (!this.elInputId.value && this.elInputLastDate.value && this.elInputCycle.value) {
        this.elInputNextDate.value = ExpirationEngine.addDays(
          this.elInputLastDate.value,
          this.elInputCycle.value
        );
      }
    };
    this.elInputLastDate.addEventListener('change', autoSuggestNextDate);
    this.elInputCycle.addEventListener('input', autoSuggestNextDate);

    this.elForm.addEventListener('submit', event => {
      event.preventDefault();
      this._handleFormSubmit();
    });

    // Filtros KPI
    this.elKpiCards.forEach(card => {
      card.addEventListener('click', () => {
        this.filters.status = card.dataset.filterStatus;
        this.elKpiCards.forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        this.renderCards();
      });
    });

    // Buscador y selector de categoría
    this.elSearchInput.addEventListener('input', event => {
      this.filters.query = event.target.value.toLowerCase().trim();
      this.renderCards();
    });

    this.elCategoryFilter.addEventListener('change', event => {
      this.filters.category = event.target.value;
      this.renderCards();
    });

    document.getElementById('btnResetFilters').addEventListener('click', () => {
      this.filters = { status: 'ALL', category: 'ALL', query: '' };
      this.elSearchInput.value = '';
      this.elCategoryFilter.value = 'ALL';
      this.elKpiCards.forEach(c => c.classList.toggle('active', c.dataset.filterStatus === 'ALL'));
      this.renderCards();
    });

    // Conmutador de modo de gráfico
    const btnByStatus = document.getElementById('btnChartByStatus');
    const btnByCategory = document.getElementById('btnChartByCategory');

    btnByStatus.addEventListener('click', () => {
      this.chart.setMode('STATUS');
      btnByStatus.classList.add('active');
      btnByCategory.classList.remove('active');
      this.chart.render(this.store.getAllEvaluatedItems());
    });

    btnByCategory.addEventListener('click', () => {
      this.chart.setMode('CATEGORY');
      btnByCategory.classList.add('active');
      btnByStatus.classList.remove('active');
      this.chart.render(this.store.getAllEvaluatedItems());
    });

    // Botones de acción global
    document.getElementById('btnLoadDemo').addEventListener('click', () => {
      this.store.loadDemoInventory();
      this.renderAll();
      this.showToast('Inventario Demo cargado con 6 escenarios preventivos.');
    });

    document.getElementById('btnExportJSON').addEventListener('click', () => {
      const content = this.store.exportJSON();
      this._downloadFile(content, `venceguard_backup_${this._todayStamp()}.json`, 'application/json');
      this.showToast('Respaldo JSON exportado correctamente.');
    });

    document.getElementById('btnExportCSV').addEventListener('click', () => {
      const content = '\uFEFF' + this.store.exportCSV();
      this._downloadFile(content, `venceguard_reporte_${this._todayStamp()}.csv`, 'text/csv;charset=utf-8;');
      this.showToast('Reporte CSV exportado correctamente.');
    });

    document.getElementById('btnClearLog').addEventListener('click', () => {
      if (this.store.getLogs().length === 0) return;
      if (confirm('¿Deseas vaciar el historial de servicios ejecutados?')) {
        this.store.clearLogs();
        this.renderLogs();
        this.renderKPIs();
        this.showToast('Bitácora histórica limpiada.');
      }
    });

    // Delegación de eventos en tarjetas de ítems
    this.elItemsContainer.addEventListener('click', event => {
      const btn = event.target.closest('button[data-action]');
      if (!btn) return;

      const { action, id } = btn.dataset;
      if (action === 'renew') {
        this._handleRenewal(id);
      } else if (action === 'edit') {
        this.openEditModal(id);
      } else if (action === 'delete') {
        this._handleDelete(id);
      }
    });
  }

  openCreateModal() {
    this.elForm.reset();
    this.elInputId.value = '';
    this.elModalTitle.textContent = 'Nuevo Registro Preventivo';

    const todayIso = ExpirationEngine.formatISODate(ExpirationEngine.getTodayLocalMidnight());
    this.elInputLastDate.value = todayIso;
    this.elInputCycle.value = '180';
    this.elInputNextDate.value = ExpirationEngine.addDays(todayIso, 180);
    this.elInputCost.value = '0.00';

    this.elModal.showModal();
  }

  openEditModal(id) {
    const item = this.store.items.find(i => i.id === id);
    if (!item) return;

    this.elModalTitle.textContent = 'Editar Registro Preventivo';
    this.elInputId.value = item.id;
    this.elInputName.value = item.name;
    this.elInputCategory.value = item.category;
    this.elInputCycle.value = item.cycleDays;
    this.elInputLastDate.value = item.lastDate;
    this.elInputNextDate.value = item.nextDate;
    this.elInputCost.value = Number(item.cost).toFixed(2);
    this.elInputNotes.value = item.notes || '';

    this.elModal.showModal();
  }

  _handleFormSubmit() {
    const payload = {
      id: this.elInputId.value || null,
      name: this.elInputName.value,
      category: this.elInputCategory.value,
      cycleDays: this.elInputCycle.value,
      lastDate: this.elInputLastDate.value,
      nextDate: this.elInputNextDate.value,
      cost: this.elInputCost.value,
      notes: this.elInputNotes.value
    };

    this.store.upsertItem(payload);
    this.elModal.close();
    this.renderAll();
    this.showToast(payload.id ? 'Registro actualizado.' : 'Nuevo registro preventivo creado.');
  }

  _handleRenewal(id) {
    const result = this.store.registerRenewal(id);
    if (!result) return;

    this.renderAll();
    this.showToast(
      `Renovación registrada. Nuevo vencimiento: ${ExpirationEngine.formatDisplayDate(result.updatedItem.nextDate)}`
    );
  }

  _handleDelete(id) {
    const item = this.store.items.find(i => i.id === id);
    if (!item) return;

    if (confirm(`¿Eliminar "${item.name}" del control preventivo?`)) {
      this.store.deleteItem(id);
      this.renderAll();
      this.showToast('Registro eliminado.');
    }
  }

  renderAll() {
    const allItems = this.store.getAllEvaluatedItems();
    this.renderKPIs(allItems);
    this.renderCards(allItems);
    this.renderLogs();
    this.chart.render(allItems);
  }

  renderKPIs(evaluatedItems = this.store.getAllEvaluatedItems()) {
    const counts = { EXPIRED: 0, URGENT: 0, UPCOMING: 0, VALID: 0 };
    evaluatedItems.forEach(item => {
      counts[item.evaluation.statusCode] += 1;
    });

    const totalInvested = this.store.getTotalInvested();

    this.elKpiTotal.textContent = evaluatedItems.length;
    this.elKpiTotalCost.textContent = `Inversión total: $${totalInvested.toLocaleString('es-MX', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`;
    this.elKpiExpired.textContent = counts.EXPIRED;
    this.elKpiUrgent.textContent = counts.URGENT;
    this.elKpiUpcoming.textContent = counts.UPCOMING;
    this.elKpiValid.textContent = counts.VALID;
  }

  renderCards(evaluatedItems = this.store.getAllEvaluatedItems()) {
    const filtered = evaluatedItems.filter(item => {
      const matchStatus = this.filters.status === 'ALL' || item.evaluation.statusCode === this.filters.status;
      const matchCategory = this.filters.category === 'ALL' || item.category === this.filters.category;
      const matchQuery = !this.filters.query ||
        item.name.toLowerCase().includes(this.filters.query) ||
        item.notes.toLowerCase().includes(this.filters.query) ||
        item.category.toLowerCase().includes(this.filters.query);

      return matchStatus && matchCategory && matchQuery;
    });

    if (filtered.length === 0) {
      this.elItemsContainer.innerHTML = `
        <div class="panel full-width" style="grid-column: 1 / -1; text-align: center; padding: 2.5rem;">
          <p class="empty-hint">No hay registros preventivos que coincidan con los filtros actuales. Haz clic en <strong>"Cargar Inventario Demo"</strong> o crea un registro nuevo.</p>
        </div>
      `;
      return;
    }

    this.elItemsContainer.innerHTML = filtered.map(item => {
      const ev = item.evaluation;
      const formattedCost = Number(item.cost).toLocaleString('es-MX', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });

      return `
        <article class="item-card status-${ev.statusCode}">
          <div>
            <div class="card-top">
              <span class="category-tag">${this._escapeHTML(item.category)}</span>
              <span class="status-badge badge-${ev.statusCode}">${ev.statusLabel}</span>
            </div>
            <h3 class="card-title">${this._escapeHTML(item.name)}</h3>
          </div>

          <div class="countdown-banner countdown-${ev.statusCode}">
            <span>${ev.countdownText}</span>
            <span>${ExpirationEngine.formatDisplayDate(item.nextDate)}</span>
          </div>

          <div class="card-specs">
            <div class="spec-item">
              <span>Último evento</span>
              <strong>${ExpirationEngine.formatDisplayDate(item.lastDate)}</strong>
            </div>
            <div class="spec-item">
              <span>Ciclo preventivo</span>
              <strong>Cada ${item.cycleDays} días</strong>
            </div>
            <div class="spec-item">
              <span>Costo estimado/pagado</span>
              <strong>$${formattedCost}</strong>
            </div>
            <div class="spec-item">
              <span>Margen temporal</span>
              <strong>${ev.daysRemaining >= 0 ? `+${ev.daysRemaining}` : ev.daysRemaining} días</strong>
            </div>
          </div>

          ${item.notes ? `<p class="card-notes">${this._escapeHTML(item.notes)}</p>` : ''}

          <div class="card-actions">
            <button class="btn btn-renew" type="button" data-action="renew" data-id="${item.id}">
              ✓ Registrar Renovación / Mantenimiento
            </button>
            <button class="btn btn-outline btn-edit" type="button" data-action="edit" data-id="${item.id}">
              Editar
            </button>
            <button class="btn btn-outline btn-delete" type="button" data-action="delete" data-id="${item.id}">
              Eliminar
            </button>
          </div>
        </article>
      `;
    }).join('');
  }

  renderLogs() {
    const logs = this.store.getLogs();
    if (logs.length === 0) {
      this.elServiceLogList.innerHTML = `
        <p class="empty-hint">Aún no se han registrado renovaciones o mantenimientos ejecutados.</p>
      `;
      return;
    }

    this.elServiceLogList.innerHTML = logs.map(log => {
      const formattedCost = Number(log.cost).toLocaleString('es-MX', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });

      return `
        <div class="log-entry">
          <div class="log-entry-top">
            <span>${this._escapeHTML(log.itemName)}</span>
            <span>$${formattedCost}</span>
          </div>
          <div class="log-entry-sub">
            Ejecutado: <strong>${ExpirationEngine.formatDisplayDate(log.completedDate)}</strong> ·
            Próximo ciclo: ${ExpirationEngine.formatDisplayDate(log.newDueDate)} (${this._escapeHTML(log.category)})
          </div>
        </div>
      `;
    }).join('');
  }

  showToast(message) {
    this.elToast.textContent = message;
    this.elToast.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      this.elToast.classList.remove('show');
    }, 3200);
  }

  _downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  _todayStamp() {
    return ExpirationEngine.formatISODate(ExpirationEngine.getTodayLocalMidnight());
  }

  _escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.venceGuardApp = new UIController();
});
