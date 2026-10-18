import { calculateBoxFit } from './core/calculate-box-fit.js';

const COPY = {
  'zh-Hant': {
    total: '最大均勻格數', items: '件', orientation: '朝向：', none: '無',
    layers: (one, layers) => `每層 ${one} 件，沿箱高 ${layers} 層`,
    noFit: '依這些尺寸和間隙，沒有朝向可排入單件。',
    ties: '有多個朝向得到相同的最大數量；下表會一併標示。摘要採固定順序中最早的朝向。',
    winner: '★ 最大', firstTie: '★ 並列最大（首列）', tie: '＝ 並列最大', notApplicable: '不適用',
    invalid: '請修正標示的欄位，再試算容量。',
    dimension: '請輸入 0.01 到 100000.00 mm 的 ASCII 數字，最多兩位小數；用句點，不含空白、正負號或逗號。',
    gap: '請輸入 0 到 10000.00 mm 的 ASCII 數字，最多兩位小數；用句點，不含空白、正負號或逗號。',
    tooLong: '最多輸入 12 個字元。', request: '無法計算。請重新載入頁面後重試。',
    clearTitle: '清除尺寸與結果', clear: '清除目前尺寸和試算結果？取消會保留所有內容。', clearAction: '確認清除',
    languageTitle: '切換語言', language: '切換語言會清除目前尺寸和結果，確定繼續嗎？', languageAction: '清除並切換',
    ready: '請填入箱內可用尺寸和單件尺寸，再試算容量。', edited: '尺寸或設定已變更，請重新試算。',
  },
  en: {
    total: 'Maximum uniform-grid count', items: 'items', orientation: 'Orientation: ', none: 'None',
    layers: (one, layers) => `${one} per base layer × ${layers} layers along box height`,
    noFit: 'No orientation fits one item with these dimensions and gap.',
    ties: 'Several orientations share the maximum. All tied rows are marked below. The summary uses the earliest orientation in the fixed order.',
    winner: '★ Maximum', firstTie: '★ Tied maximum (first)', tie: '= Tied maximum', notApplicable: 'Not applicable',
    invalid: 'Correct the marked field, then calculate again.',
    dimension: 'Enter ASCII numbers from 0.01 to 100000.00 mm, with at most two decimal places. Use a dot; no spaces, signs or commas.',
    gap: 'Enter ASCII numbers from 0 to 10000.00 mm, with at most two decimal places. Use a dot; no spaces, signs or commas.',
    tooLong: 'Use at most 12 characters.', request: 'Unable to calculate. Reload the page and try again.',
    clearTitle: 'Clear dimensions and result', clear: 'Clear the current dimensions and result? Cancel to keep everything.', clearAction: 'Confirm clear',
    languageTitle: 'Change language', language: 'Changing language clears the current dimensions and result. Continue?', languageAction: 'Clear and change language',
    ready: 'Enter usable inner box dimensions and single-item dimensions, then calculate capacity.', edited: 'Dimensions or settings changed. Calculate again to see the current count.',
  },
};

function initialize() {
  const language = document.documentElement.lang;
  if (!Object.hasOwn(COPY, language)) throw new Error('Unsupported page');
  const copy = COPY[language];
  const required = id => {
    const element = document.getElementById(id);
    if (!element) throw new Error('Page unavailable');
    return element;
  };
  const fieldIds = ['boxLengthRaw', 'boxWidthRaw', 'boxHeightRaw', 'itemLengthRaw', 'itemWidthRaw', 'itemHeightRaw', 'gapRaw'];
  const fields = fieldIds.map(required);
  const errorElements = fieldIds.map(id => required(`${id}-error`));
  const form = required('calculator');
  const rotation = required('allowRotation');
  const results = required('results');
  const rows = required('orientation-rows');
  const total = required('total');
  const layerSummary = required('layer-summary');
  const orientationSummary = required('orientation-summary');
  const tieNotice = required('tie-notice');
  const noFit = required('no-fit');
  const status = required('work-status');
  const errorSummary = required('error-summary');
  const decimal = required('insert-decimal');
  const clear = required('clear');
  const languageButton = required('change-language');
  const dialog = required('confirmation');
  const confirmTitle = required('confirmation-title');
  const confirmText = required('confirmation-text');
  const confirmButton = required('confirm-action');
  const cancelButton = required('cancel-action');
  const initStatus = required('init-status');
  const controls = [...document.querySelectorAll('input, button, fieldset')];
  let revision = 0;
  let currentResult = null;
  let activeField = null;
  let selectionStart = 0;
  let selectionEnd = 0;
  let pendingAction = null;
  let dialogOrigin = null;

  function clearErrors() {
    fields.forEach((field, index) => {
      field.removeAttribute('aria-invalid');
      errorElements[index].textContent = '';
      errorElements[index].hidden = true;
    });
    errorSummary.hidden = true;
    errorSummary.textContent = '';
  }

  function discardResult() {
    revision += 1;
    currentResult = null;
    results.hidden = true;
    rows.replaceChildren();
    total.textContent = '';
    layerSummary.textContent = '';
    orientationSummary.textContent = '';
    tieNotice.textContent = '';
    tieNotice.hidden = true;
    noFit.textContent = '';
    noFit.hidden = true;
  }

  function invalidate() {
    discardResult();
    clearErrors();
    status.textContent = copy.edited;
  }

  function reset() {
    pendingAction = null;
    if (dialog.open) dialog.close();
    fields.forEach((field, index) => { field.value = index === 6 ? '0' : ''; });
    rotation.checked = true;
    discardResult();
    clearErrors();
    activeField = null;
    selectionStart = 0;
    selectionEnd = 0;
    decimal.disabled = true;
    status.textContent = copy.ready;
  }

  function hasWork() {
    return fields.some((field, index) => field.value !== (index === 6 ? '0' : '')) || !rotation.checked || currentResult !== null;
  }

  function rememberSelection(field) {
    activeField = field;
    selectionStart = field.selectionStart ?? 0;
    selectionEnd = field.selectionEnd ?? selectionStart;
    decimal.disabled = false;
  }

  function completeAction(action) {
    reset();
    if (action === 'language') {
      window.location.assign(language === 'en' ? '/index.html' : '/en/index.html');
    } else {
      fields[0].focus();
    }
  }

  function requestAction(action, origin) {
    if (!hasWork()) { completeAction(action); return; }
    pendingAction = action;
    dialogOrigin = origin;
    confirmTitle.textContent = action === 'clear' ? copy.clearTitle : copy.languageTitle;
    confirmText.textContent = action === 'clear' ? copy.clear : copy.language;
    confirmButton.textContent = action === 'clear' ? copy.clearAction : copy.languageAction;
    dialog.showModal();
    cancelButton.focus();
  }

  function cancelAction() {
    pendingAction = null;
    dialog.close();
    dialogOrigin?.focus();
    dialogOrigin = null;
  }

  function render(result) {
    currentResult = result;
    total.textContent = result.total;
    layerSummary.textContent = copy.layers(String(result.oneLayerCount), String(result.layerCount));
    const winner = result.winnerIndex === null ? null : result.orientations[result.winnerIndex];
    orientationSummary.textContent = copy.orientation + (winner ? winner.itemAxes.join('') : copy.none);
    const tied = winner ? result.orientations.filter(row => row.total === result.total) : [];
    tieNotice.hidden = tied.length < 2;
    tieNotice.textContent = tied.length > 1 ? copy.ties : '';
    noFit.hidden = winner !== null;
    noFit.textContent = winner ? '' : copy.noFit;

    for (const orientation of result.orientations) {
      const row = document.createElement('tr');
      const heading = document.createElement('th');
      heading.scope = 'row';
      const axisName = document.createElement('span');
      axisName.className = 'axis-code';
      axisName.textContent = orientation.itemAxes.join('');
      heading.append(axisName);
      if (winner && orientation.total === result.total) {
        const label = document.createElement('span');
        label.className = 'row-mark';
        label.textContent = tied.length < 2 ? copy.winner : (orientation.index === result.winnerIndex ? copy.firstTie : copy.tie);
        heading.append(label);
        row.className = 'maximum-row';
      }
      row.append(heading);
      for (const value of [orientation.axesCounts.boxLength, orientation.axesCounts.boxWidth, orientation.axesCounts.boxHeight, orientation.total]) {
        const cell = document.createElement('td');
        cell.className = 'numeric';
        cell.textContent = String(value);
        row.append(cell);
      }
      const occupied = document.createElement('td');
      occupied.textContent = orientation.occupiedMm === null ? copy.notApplicable : `${orientation.occupiedMm.boxLength} × ${orientation.occupiedMm.boxWidth} × ${orientation.occupiedMm.boxHeight} mm`;
      row.append(occupied);
      rows.append(row);
    }
    results.hidden = false;
    status.textContent = winner ? `${copy.total}: ${result.total} ${copy.items}. ${layerSummary.textContent}` : copy.noFit;
  }

  // bootstrap.js already registered the synchronous capture preventDefault.
  form.addEventListener('submit', event => {
    event.preventDefault();
    discardResult();
    clearErrors();
    const snapshot = Object.fromEntries(fields.map((field, index) => [fieldIds[index], field.value]));
    snapshot.allowRotation = rotation.checked;
    const calculatedAt = revision;
    const response = calculateBoxFit(snapshot);
    if (calculatedAt !== revision) return;
    if (!response.ok) {
      const index = fieldIds.indexOf(response.error.field);
      errorSummary.textContent = index === -1 ? copy.request : copy.invalid;
      errorSummary.hidden = false;
      status.textContent = '';
      if (index !== -1) {
        const message = `${response.error.code === 'raw_too_long' ? copy.tooLong + ' ' : ''}${index === 6 ? copy.gap : copy.dimension}`;
        errorElements[index].textContent = message;
        errorElements[index].hidden = false;
        fields[index].setAttribute('aria-invalid', 'true');
        fields[index].focus();
      }
      return;
    }
    render(response.result);
  });

  fields.forEach(field => {
    field.addEventListener('input', () => { invalidate(); rememberSelection(field); });
    for (const eventName of ['focus', 'click', 'keyup', 'select', 'blur']) {
      field.addEventListener(eventName, () => rememberSelection(field));
    }
  });
  rotation.addEventListener('change', invalidate);
  decimal.addEventListener('click', () => {
    if (!activeField) return;
    const field = activeField;
    const start = Math.min(selectionStart, field.value.length);
    const end = Math.min(selectionEnd, field.value.length);
    if (field.value.length - (end - start) + 1 <= 12) {
      field.setRangeText('.', start, end, 'end');
      invalidate();
    }
    field.focus();
    rememberSelection(field);
  });
  clear.addEventListener('click', () => requestAction('clear', clear));
  languageButton.addEventListener('click', () => requestAction('language', languageButton));
  cancelButton.addEventListener('click', cancelAction);
  dialog.addEventListener('cancel', event => { event.preventDefault(); cancelAction(); });
  confirmButton.addEventListener('click', () => {
    const action = pendingAction;
    pendingAction = null;
    dialog.close();
    dialogOrigin = null;
    if (action) completeAction(action);
  });
  window.addEventListener('pagehide', reset);
  window.addEventListener('pageshow', event => { if (event.persisted) reset(); });
  reset();
  controls.forEach(control => { control.disabled = false; });
  decimal.disabled = true;
  initStatus.hidden = true;
}

try { initialize(); }
catch {
  document.querySelectorAll('input, button, fieldset').forEach(control => { control.disabled = true; });
  const notice = document.getElementById('init-status');
  if (notice) notice.hidden = false;
}
