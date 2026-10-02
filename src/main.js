/*
 * main.js — точка входа: проверка наличия Three.js, создание симулятора, обработка ошибок запуска.
 */
(function () {
  function showError(titleKey, hintKey) {
    document.getElementById('errTitle').textContent = (LA.t && LA.t(titleKey)) || 'Error';
    document.getElementById('errText').textContent = (LA.t && LA.t(hintKey)) || '';
    document.getElementById('screen-loading').classList.remove('show');
    document.getElementById('screen-error').classList.add('show');
  }

  async function boot() {
    if (!window.THREE) { LA.I18N.setLang(LA.I18N.detect()); showError('err_three', 'err_three_hint'); return; }
    const sim = new LA.FlightSimulator(document.getElementById('gl'));
    window.LA_SIM = sim; // доступен из консоли для отладки: LA_SIM.phys, LA_SIM.state ...
    try { await sim.init(); }
    catch (e) {
      console.error('LA Flight Simulator failed to start:', e);
      if (!sim.fatalShown) showError('err_generic', 'err_generic_hint');
    }
  }
  boot();
})();
