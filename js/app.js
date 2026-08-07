'use strict';

(function startApplication() {
  const DB = window.PreanalyticsDB;
  const Catalog = window.PreanalyticsCatalog;

  const state = {
    tests: [],
    query: '',
    division: 'Todas',
    admin: false,
    editingId: null,
    expanded: new Set(),
    installPrompt: null,
    pinAttempts: 0,
    blockedUntil: 0,
    refreshTimer: null,
    updateRequested: false
  };

  const byId = (id) => document.getElementById(id);

  function showToast(message, type = 'info') {
    const container = byId('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${['success', 'error', 'warning'].includes(type) ? type : ''}`.trim();
    toast.textContent = String(message || '');
    container.appendChild(toast);
    window.setTimeout(() => {
      toast.classList.add('fade');
      window.setTimeout(() => toast.remove(), 220);
    }, 3800);
  }

  function openDialog(id, focusId = '') {
    const dialog = byId(id);
    if (!dialog || dialog.open) return;
    dialog.showModal();
    document.body.classList.add('dialog-open');
    window.setTimeout(() => (focusId ? byId(focusId) : dialog.querySelector('input,button,select,textarea'))?.focus(), 0);
  }

  function closeDialog(id) {
    const dialog = byId(id);
    if (dialog?.open) dialog.close();
  }

  function syncDialogBodyState() {
    document.body.classList.toggle('dialog-open', Boolean(document.querySelector('dialog[open]')));
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function localDateStamp() {
    const date = new Date();
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 10);
  }

  function formatDateTime(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value || '') : date.toLocaleString('es-CR', { dateStyle: 'short', timeStyle: 'short' });
  }

  function updateOnlineStatus() {
    const online = navigator.onLine;
    byId('onlineDot').classList.toggle('offline', !online);
    byId('onlineText').textContent = online ? 'Laboratorio Clínico · Fase preanalítica' : 'Trabajando sin conexión';
  }

  function getDivisions() {
    return Array.from(new Set(state.tests.map((test) => Catalog.divisionName(test.division)).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'es'));
  }

  function renderDivisions() {
    const container = byId('divisionChips');
    container.replaceChildren();
    const divisions = ['Todas', ...getDivisions()];
    if (!divisions.includes(state.division)) state.division = 'Todas';

    for (const division of divisions) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `chip${division === state.division ? ' active' : ''}`;
      button.dataset.division = division;
      button.setAttribute('aria-pressed', String(division === state.division));
      if (division !== 'Todas') {
        const swatch = document.createElement('span');
        swatch.className = 'chip-swatch';
        swatch.style.setProperty('--chip-color', Catalog.divisionColor(division));
        swatch.setAttribute('aria-hidden', 'true');
        button.appendChild(swatch);
      }
      button.append(document.createTextNode(division));
      button.addEventListener('click', () => {
        state.division = division;
        renderDivisions();
        renderList();
      });
      container.appendChild(button);
    }
  }

  function getVisibleTests() {
    return state.tests
      .filter((test) => Catalog.matchesQuery(test, state.query))
      .filter((test) => state.division === 'Todas' || Catalog.divisionName(test.division) === state.division)
      .sort((a, b) => String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es', { sensitivity: 'base' }));
  }

  function createTag(text, className = '') {
    const tag = document.createElement('span');
    tag.className = `tag ${className}`.trim();
    tag.textContent = text;
    return tag;
  }

  function appendFormattedText(container, text) {
    if (!text || typeof text !== 'string') {
      container.textContent = String(text || '');
      return;
    }
    const lines = text.split('\n');
    lines.forEach((line, lineIndex) => {
      if (lineIndex > 0) container.appendChild(document.createElement('br'));
      const parts = line.split(/(\*\*.*?\*\*)/g);
      for (const part of parts) {
        if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
          const strong = document.createElement('strong');
          strong.textContent = part.slice(2, -2);
          container.appendChild(strong);
        } else if (part) {
          container.appendChild(document.createTextNode(part));
        }
      }
    });
  }

  function createField(key, label, value) {
    const field = document.createElement('div');
    field.className = `field${Catalog.isCriticalValue(key, value) ? ' critical' : ''}`;
    const labelElement = document.createElement('div');
    labelElement.className = 'field-label';
    labelElement.textContent = label;
    const valueElement = document.createElement('div');
    valueElement.className = 'field-value';

    const displayValue = key === 'division' ? Catalog.divisionName(value) : value;
    appendFormattedText(valueElement, displayValue);

    field.append(labelElement, valueElement);
    return field;
  }

  function createTestCard(test) {
    const card = document.createElement('article');
    card.className = `test-card${state.expanded.has(test.id) ? ' open' : ''}`;

    const strip = document.createElement('span');
    strip.className = 'tube-strip';
    strip.style.setProperty('--tube-color', Catalog.tubeColor(test.tipo_muestra));
    strip.setAttribute('aria-hidden', 'true');

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'card-toggle';
    toggle.setAttribute('aria-expanded', String(state.expanded.has(test.id)));

    const main = document.createElement('div');
    main.className = 'card-main';
    const name = document.createElement('h2');
    name.className = 'test-name';
    name.textContent = test.nombre;
    const meta = document.createElement('div');
    meta.className = 'test-meta';
    const division = Catalog.divisionName(test.division);
    if (division) {
      const tag = createTag(division, 'division-tag');
      const color = Catalog.divisionColor(division);
      tag.style.setProperty('--division-color', color);
      tag.style.setProperty('--division-bg', Catalog.hexToRgba(color, 0.12));
      meta.appendChild(tag);
    }
    if (test.codigo_digitacion) meta.appendChild(createTag(test.codigo_digitacion));
    if (test.tipo_muestra) {
      const sample = document.createElement('span');
      sample.textContent = test.tipo_muestra;
      meta.appendChild(sample);
    }
    main.append(name, meta);

    const chevron = document.createElement('span');
    chevron.className = 'chevron';
    chevron.setAttribute('aria-hidden', 'true');
    chevron.textContent = '⌄';
    toggle.append(main, chevron);

    const details = document.createElement('div');
    details.className = 'card-details';
    for (const section of Catalog.SECTIONS) {
      const populated = section.fields.filter(([key]) => String(test[key] || '').trim());
      if (!populated.length) continue;
      const sectionElement = document.createElement('section');
      sectionElement.className = 'detail-section';
      const heading = document.createElement('h3');
      heading.className = 'section-heading';
      heading.textContent = section.title;
      const grid = document.createElement('div');
      grid.className = 'field-grid';
      for (const [key, label] of populated) grid.appendChild(createField(key, label, test[key]));
      sectionElement.append(heading, grid);
      details.appendChild(sectionElement);
    }

    const actions = document.createElement('div');
    actions.className = 'card-actions';
    const copyButton = document.createElement('button');
    copyButton.type = 'button';
    copyButton.className = 'button secondary';
    copyButton.textContent = 'Copiar ficha';
    copyButton.addEventListener('click', () => copyTest(test, copyButton));
    const shareButton = document.createElement('button');
    shareButton.type = 'button';
    shareButton.className = 'button secondary';
    shareButton.textContent = 'Compartir';
    shareButton.addEventListener('click', () => shareTest(test));
    actions.append(copyButton, shareButton);

    if (state.admin) {
      const editButton = document.createElement('button');
      editButton.type = 'button';
      editButton.className = 'button primary';
      editButton.textContent = 'Editar prueba';
      editButton.addEventListener('click', () => openEditor(test));
      actions.appendChild(editButton);
    }
    details.appendChild(actions);

    toggle.addEventListener('click', () => {
      if (state.expanded.has(test.id)) state.expanded.delete(test.id);
      else state.expanded.add(test.id);
      card.classList.toggle('open', state.expanded.has(test.id));
      toggle.setAttribute('aria-expanded', String(state.expanded.has(test.id)));
      updateExpandButton();
    });

    card.append(strip, toggle, details);
    return card;
  }

  function renderList() {
    const list = byId('testList');
    const visible = getVisibleTests();
    list.replaceChildren(...visible.map(createTestCard));
    byId('emptyState').hidden = visible.length !== 0 || state.tests.length === 0;
    byId('resultCount').textContent = `${visible.length} ${visible.length === 1 ? 'prueba encontrada' : 'pruebas encontradas'} · ${state.tests.length} en la base local`;
    updateExpandButton();
  }

  function updateExpandButton() {
    const visible = getVisibleTests();
    const allOpen = visible.length > 0 && visible.every((test) => state.expanded.has(test.id));
    byId('expandAllButton').textContent = allOpen ? 'Contraer visibles' : 'Expandir visibles';
    byId('expandAllButton').disabled = visible.length === 0;
  }

  async function copyText(text) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.className = 'sr-only';
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    textarea.remove();
    if (!copied) throw new Error('No se pudo copiar.');
  }

  async function copyTest(test, button) {
    try {
      await copyText(Catalog.formatTestText(test));
      const original = button.textContent;
      button.textContent = 'Copiado';
      window.setTimeout(() => { button.textContent = original; }, 1600);
    } catch (error) {
      showToast(error.message || 'No se pudo copiar la ficha.', 'error');
    }
  }

  async function shareTest(test) {
    const text = Catalog.formatTestText(test);
    try {
      if (navigator.share) {
        await navigator.share({ title: `Preanalítica · ${test.nombre}`, text });
      } else {
        await copyText(text);
        showToast('El navegador no permite compartir; la ficha se copió al portapapeles.', 'success');
      }
    } catch (error) {
      if (error?.name !== 'AbortError') showToast('No se pudo compartir la ficha.', 'error');
    }
  }

  function setCatalogNotice(title = '', message = '') {
    const notice = byId('catalogNotice');
    notice.hidden = !title;
    byId('catalogNoticeTitle').textContent = title;
    byId('catalogNoticeText').textContent = message;
  }

  async function refreshData() {
    state.tests = await DB.getAllTests();
    renderDivisions();
    renderList();
    await updateAdminSummary();
    if (state.tests.length) setCatalogNotice();
  }

  function scheduleRefresh() {
    window.clearTimeout(state.refreshTimer);
    state.refreshTimer = window.setTimeout(() => refreshData().catch(console.error), 100);
  }

  async function ensureCatalog() {
    try {
      const result = await Catalog.seedIfEmpty(DB);
      if (result.seeded) showToast(`Catálogo inicial cargado: ${result.count} pruebas.`, 'success');
      await refreshData();
    } catch (error) {
      await refreshData();
      if (!state.tests.length) {
        setCatalogNotice('Catálogo inicial no disponible', 'Conecte el dispositivo a Internet y pulse “Reintentar”. Los archivos de la aplicación sí pueden seguir funcionando offline después de la primera carga.');
      }
      console.error(error);
    }
  }

  function openAdmin() {
    if (state.admin) {
      updateAdminSummary();
      openDialog('adminDialog');
      return;
    }
    byId('pinForm').reset();
    byId('pinError').hidden = true;
    openDialog('pinDialog', 'pinInput');
  }

  async function handlePinSubmit(event) {
    event.preventDefault();
    const now = Date.now();
    if (state.blockedUntil > now) {
      const seconds = Math.ceil((state.blockedUntil - now) / 1000);
      byId('pinError').textContent = `Demasiados intentos. Espere ${seconds} segundos.`;
      byId('pinError').hidden = false;
      return;
    }

    const button = byId('pinSubmitButton');
    button.disabled = true;
    try {
      const valid = await DB.verifyPin(byId('pinInput').value);
      if (!valid) {
        state.pinAttempts += 1;
        if (state.pinAttempts >= 5) {
          state.pinAttempts = 0;
          state.blockedUntil = Date.now() + 30000;
          byId('pinError').textContent = 'Demasiados intentos. Espere 30 segundos.';
        } else {
          byId('pinError').textContent = 'PIN incorrecto.';
        }
        byId('pinError').hidden = false;
        return;
      }
      state.pinAttempts = 0;
      state.admin = true;
      closeDialog('pinDialog');
      renderList();
      await updateAdminSummary();
      openDialog('adminDialog');
    } catch (error) {
      showToast(error.message || 'No se pudo verificar el PIN.', 'error');
    } finally {
      button.disabled = false;
    }
  }

  function createEditorControl(key, label, value, divisions) {
    const wrapper = document.createElement('div');
    wrapper.className = `editor-field${Catalog.WIDE_FIELDS.has(key) ? ' wide' : ''}`;
    const labelElement = document.createElement('label');
    const controlId = `field-${key}`;
    labelElement.htmlFor = controlId;
    labelElement.textContent = `${label}${key === 'nombre' ? ' *' : ''}`;

    let control;
    if (key === 'division') {
      control = document.createElement('input');
      control.setAttribute('list', 'divisionOptions');
    } else if (Catalog.WIDE_FIELDS.has(key) && key !== 'nombre') {
      control = document.createElement('textarea');
      control.rows = key === 'uso_clinico' ? 5 : 3;
    } else {
      control = document.createElement('input');
      control.type = 'text';
    }
    control.id = controlId;
    control.dataset.key = key;
    control.value = value || '';
    control.maxLength = key === 'nombre' ? 300 : 12000;
    if (key === 'nombre') control.required = true;
    wrapper.append(labelElement, control);

    if (key === 'division' && !byId('divisionOptions')) {
      const datalist = document.createElement('datalist');
      datalist.id = 'divisionOptions';
      for (const division of divisions) {
        const option = document.createElement('option');
        option.value = division;
        datalist.appendChild(option);
      }
      wrapper.appendChild(datalist);
    }
    return wrapper;
  }

  function openEditor(test = null) {
    if (!state.admin) return openAdmin();
    const record = test || { id: Catalog.createId(), nombre: '' };
    state.editingId = record.id;
    byId('editorTitle').textContent = test ? 'Editar prueba' : 'Nueva prueba';
    byId('deleteTestButton').hidden = !test;
    const container = byId('editorFields');
    container.replaceChildren();
    const divisions = getDivisions();

    const identity = document.createElement('section');
    identity.className = 'editor-section';
    const identityTitle = document.createElement('h3');
    identityTitle.textContent = 'Identificación';
    const identityGrid = document.createElement('div');
    identityGrid.className = 'editor-grid';
    identityGrid.appendChild(createEditorControl('nombre', 'Nombre de la prueba', record.nombre, divisions));
    identity.append(identityTitle, identityGrid);
    container.appendChild(identity);

    for (const section of Catalog.SECTIONS) {
      const sectionElement = document.createElement('section');
      sectionElement.className = 'editor-section';
      const heading = document.createElement('h3');
      heading.textContent = section.title;
      const grid = document.createElement('div');
      grid.className = 'editor-grid';
      for (const [key, label] of section.fields) grid.appendChild(createEditorControl(key, label, record[key], divisions));
      sectionElement.append(heading, grid);
      container.appendChild(sectionElement);
    }
    closeDialog('adminDialog');
    openDialog('editorDialog', 'field-nombre');
  }

  async function saveEditor(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.checkValidity()) return form.reportValidity();
    const existing = state.tests.find((item) => item.id === state.editingId);
    const payload = { id: state.editingId, createdAt: existing?.createdAt };
    form.querySelectorAll('[data-key]').forEach((control) => { payload[control.dataset.key] = control.value; });

    const button = byId('saveTestButton');
    button.disabled = true;
    try {
      const record = Catalog.normalizeTest(payload, { now: new Date().toISOString() });
      await DB.upsertTest(record, existing ? 'actualización' : 'creación');
      closeDialog('editorDialog');
      await refreshData();
      showToast(existing ? 'Prueba actualizada.' : 'Prueba creada.', 'success');
    } catch (error) {
      showToast(error.message || 'No se pudo guardar la prueba.', 'error');
    } finally {
      button.disabled = false;
    }
  }

  async function deleteCurrentTest() {
    const test = state.tests.find((item) => item.id === state.editingId);
    if (!test) return;
    if (!window.confirm(`¿Eliminar “${test.nombre}”? Esta acción quedará registrada en el historial local.`)) return;
    try {
      await DB.deleteTest(test.id, test.nombre);
      state.expanded.delete(test.id);
      closeDialog('editorDialog');
      await refreshData();
      showToast('Prueba eliminada.', 'success');
    } catch (error) {
      showToast(error.message || 'No se pudo eliminar la prueba.', 'error');
    }
  }

  async function exportBackup() {
    try {
      const payload = await DB.exportBackup();
      downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), `preanalitica-respaldo-${localDateStamp()}.json`);
      await DB.recordBackup();
      await updateAdminSummary();
      showToast('Respaldo JSON generado.', 'success');
    } catch (error) {
      showToast(error.message || 'No se pudo exportar el respaldo.', 'error');
    }
  }

  async function importBackupFile(file) {
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) throw new Error('El archivo supera el máximo permitido de 20 MB.');
    const payload = JSON.parse(await file.text());
    const parsed = Catalog.parseBackupPayload(payload);
    if (!window.confirm(`Se reemplazará la base local por ${parsed.tests.length} pruebas. ¿Continuar?`)) return;
    await DB.importBackup(parsed, parsed.tests);
    state.expanded.clear();
    await refreshData();
    showToast('Respaldo importado correctamente.', 'success');
  }

  async function restoreOfficialCatalog() {
    if (!window.confirm('Se reemplazarán todas las ediciones locales por el catálogo original publicado. Exporte un respaldo antes de continuar. ¿Restaurar?')) return;
    const button = byId('restoreOfficialButton');
    button.disabled = true;
    try {
      const catalog = await Catalog.fetchOfficialCatalog();
      await DB.replaceTests(catalog.tests, {
        action: 'restauración oficial',
        summary: `Catálogo original restaurado con ${catalog.tests.length} pruebas.`,
        source: catalog.sourceLabel,
        meta: {
          catalog_source_version: catalog.sourceVersion,
          catalog_source_label: catalog.sourceLabel,
          restored_at: new Date().toISOString()
        }
      });
      state.expanded.clear();
      await refreshData();
      showToast('Catálogo original restaurado.', 'success');
    } catch (error) {
      showToast(error.message || 'No se pudo restaurar el catálogo original.', 'error');
    } finally {
      button.disabled = false;
    }
  }

  async function exportCsv() {
    try {
      const csv = Catalog.catalogToCsv(state.tests);
      downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `preanalitica-catalogo-${localDateStamp()}.csv`);
      showToast('Catálogo CSV generado.', 'success');
    } catch (error) {
      showToast(error.message || 'No se pudo generar el CSV.', 'error');
    }
  }

  async function requestPersistentStorage() {
    if (!navigator.storage?.persist) return showToast('Este navegador no permite solicitar almacenamiento persistente.', 'warning');
    try {
      const granted = await navigator.storage.persist();
      showToast(granted ? 'Almacenamiento persistente concedido.' : 'El navegador no concedió almacenamiento persistente.', granted ? 'success' : 'warning');
    } catch (error) {
      showToast('No se pudo solicitar persistencia.', 'error');
    }
  }

  async function updateAdminSummary() {
    const [source, backup] = await Promise.all([DB.getMeta('catalog_source_label'), DB.getMeta('last_backup')]);
    byId('adminRecordCount').textContent = String(state.tests.length);
    byId('adminSource').textContent = source || (state.tests.length ? 'Base existente' : 'Sin catálogo');
    byId('adminBackupStatus').textContent = backup ? formatDateTime(backup) : 'Pendiente';
  }

  async function renderAudit() {
    const rows = await DB.getAudit(300);
    const body = byId('auditTableBody');
    body.replaceChildren();
    for (const entry of rows) {
      const row = document.createElement('tr');
      const date = document.createElement('td');
      date.textContent = formatDateTime(entry.createdAt);
      const action = document.createElement('td');
      action.textContent = entry.action || 'cambio';
      const summary = document.createElement('td');
      summary.textContent = entry.summary || '';
      row.append(date, action, summary);
      body.appendChild(row);
    }
    byId('auditEmpty').hidden = rows.length !== 0;
  }

  async function changePin(event) {
    event.preventDefault();
    try {
      await DB.setPin(byId('newPinInput').value);
      event.currentTarget.reset();
      showToast('PIN actualizado.', 'success');
    } catch (error) {
      showToast(error.message || 'No se pudo actualizar el PIN.', 'error');
    }
  }

  function setupInstallPrompt() {
    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      state.installPrompt = event;
      byId('installBtn').hidden = false;
    });
    byId('installBtn').addEventListener('click', async () => {
      if (!state.installPrompt) return;
      state.installPrompt.prompt();
      await state.installPrompt.userChoice.catch(() => null);
      state.installPrompt = null;
      byId('installBtn').hidden = true;
    });
    window.addEventListener('appinstalled', () => {
      state.installPrompt = null;
      byId('installBtn').hidden = true;
      showToast('Aplicación instalada.', 'success');
    });
  }

  function showUpdateBanner(registration) {
    if (!registration?.waiting) return;
    byId('updateBanner').hidden = false;
    byId('applyUpdateButton').onclick = () => {
      state.updateRequested = true;
      registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
    };
  }

  async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    try {
      const registration = await navigator.serviceWorker.register('./sw.js');
      if (registration.waiting) showUpdateBanner(registration);
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) showUpdateBanner(registration);
        });
      });
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (state.updateRequested) window.location.reload();
      });
    } catch (error) {
      console.warn('No se pudo registrar el service worker:', error);
    }
  }

  function bindEvents() {
    byId('searchInput').addEventListener('input', (event) => {
      state.query = event.target.value;
      byId('clearSearchButton').hidden = !state.query;
      renderList();
    });
    byId('clearSearchButton').addEventListener('click', () => {
      state.query = '';
      byId('searchInput').value = '';
      byId('clearSearchButton').hidden = true;
      byId('searchInput').focus();
      renderList();
    });
    byId('expandAllButton').addEventListener('click', () => {
      const visible = getVisibleTests();
      const allOpen = visible.length && visible.every((test) => state.expanded.has(test.id));
      for (const test of visible) allOpen ? state.expanded.delete(test.id) : state.expanded.add(test.id);
      renderList();
    });
    byId('retryCatalogButton').addEventListener('click', ensureCatalog);
    byId('adminButton').addEventListener('click', openAdmin);
    byId('pinForm').addEventListener('submit', handlePinSubmit);
    byId('newTestButton').addEventListener('click', () => openEditor());
    byId('editorForm').addEventListener('submit', saveEditor);
    byId('deleteTestButton').addEventListener('click', deleteCurrentTest);
    byId('exportBackupButton').addEventListener('click', exportBackup);
    byId('importBackupButton').addEventListener('click', () => byId('importBackupInput').click());
    byId('importBackupInput').addEventListener('change', async (event) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;
      try { await importBackupFile(file); }
      catch (error) { showToast(error.message || 'No se pudo importar el archivo.', 'error'); }
    });
    byId('exportCsvButton').addEventListener('click', exportCsv);
    byId('restoreOfficialButton').addEventListener('click', restoreOfficialCatalog);
    byId('storageButton').addEventListener('click', requestPersistentStorage);
    byId('auditButton').addEventListener('click', async () => {
      await renderAudit();
      closeDialog('adminDialog');
      openDialog('auditDialog');
    });
    byId('changePinForm').addEventListener('submit', changePin);
    byId('lockAdminButton').addEventListener('click', () => {
      state.admin = false;
      closeDialog('adminDialog');
      renderList();
      showToast('Modo administrador cerrado.');
    });
    document.querySelectorAll('[data-close-dialog]').forEach((button) => {
      button.addEventListener('click', () => closeDialog(button.dataset.closeDialog));
    });
    document.querySelectorAll('dialog').forEach((dialog) => {
      dialog.addEventListener('close', syncDialogBodyState);
      dialog.addEventListener('click', (event) => {
        const rect = dialog.getBoundingClientRect();
        const outside = event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
        if (outside) dialog.close();
      });
    });
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    DB.onChange(scheduleRefresh);
  }

  async function init() {
    bindEvents();
    setupInstallPrompt();
    updateOnlineStatus();
    try {
      await DB.openDB();
      await ensureCatalog();
      registerServiceWorker();
    } catch (error) {
      console.error(error);
      setCatalogNotice('No se pudo iniciar la base local', error.message || 'Revise los permisos del navegador.');
      showToast('No se pudo iniciar la aplicación.', 'error');
    }
  }

  init();
})();
