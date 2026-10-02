/*
 * I18N.js — две локали (EN/RU). Статические тексты размечены data-i18n, динамические берутся через LA.t().
 */
globalThis.LA = globalThis.LA || {};

(function () {
  const dict = {
    en: {
      title: 'LA Flight Simulator',
      subtitle: 'Take off in a small propeller plane, tour a stylized Los Angeles — downtown towers, Hollywood Hills, the coast — and land back at the airport.',
      start: 'Start Flight',
      loadingTitle: 'Preparing the flight',
      ld_terrain: 'Shaping the terrain…', ld_ground: 'Painting streets and parks…', ld_city: 'Building the city…', ld_landmarks: 'Placing landmarks…', ld_done: 'Ready',
      controls: 'Controls',
      c_pitch: 'Pitch down / up', c_roll: 'Roll left / right', c_yaw: 'Yaw left / right', c_throttle: 'Throttle up / down', c_brake: 'Wheel brakes',
      c_cam: 'Camera', c_restart: 'Restart', c_pause: 'Pause', c_more: 'Sound · Assist · Units · Shadows · Language · Invert pitch', c_arrows: 'Arrows work as W A S D. Alt throttle: X / Z.',
      note: 'Stylized map: roads, buildings and landmarks are schematic, not geographically exact.',
      mobile: 'This game needs a keyboard. Open it on a desktop or laptop for the best experience.',
      st_ground: 'ON GROUND', st_takeoff: 'TAKEOFF', st_flying: 'FLYING', st_stall: 'STALL', st_landed: 'LANDED', st_crashed: 'CRASHED',
      h_speed: 'Airspeed', h_alt: 'Altitude', h_hdg: 'Heading', h_thr: 'Throttle', h_vs: 'Vertical speed',
      u_kt: 'kt', u_kmh: 'km/h', u_ft: 'ft', u_m: 'm', u_fpm: 'ft/min', u_ms: 'm/s',
      w_stall: 'STALL — nose down, add power', w_pull: 'PULL UP', w_range: 'LEAVING FLIGHT AREA — TURN BACK', w_stallwarn: 'STALL WARNING',
      m_title: 'Sightseeing flight', m_next: 'Next', m_dist: 'Distance', m_time: 'Time', m_done: 'Complete',
      s_takeoff: 'Take off', s_downtown: 'Downtown Los Angeles', s_griffith: 'Griffith Observatory', s_sign: 'Hollywood Sign', s_pier: 'Santa Monica Pier', s_coast: 'Coastline', s_final: 'Final approach', s_land: 'Land on the runway',
      t_cp: 'Checkpoint', t_missed: 'Checkpoint missed — circle back', t_airborne: 'Airborne', t_land_away: 'Landed off the runway — the mission needs the airport',
      p_title: 'Paused', p_resume: 'Resume', p_restart: 'Restart', p_settings: 'Settings',
      set_sound: 'Sound', set_assist: 'Flight assist', set_units: 'Units', set_shadows: 'Shadows', set_lang: 'Language', set_invert: 'Invert pitch',
      on: 'On', off: 'Off', metric: 'Metric', imperial: 'Imperial',
      r_crashed: 'Crashed', r_restart: 'Restart', r_hint: 'Press R to restart',
      cr_terrain: 'You hit the terrain.', cr_building: 'You hit a building.', cr_water: 'You hit the water. A land plane cannot ditch.',
      cr_hard: 'Touchdown too hard.', cr_bank: 'Wing dropped at touchdown — bank too steep.', cr_attitude: 'Bad pitch at touchdown.', cr_speed: 'Touchdown speed too high.', cr_drift: 'Sideways drift at touchdown.', cr_range: 'You flew out of the flight area.',
      l_title: 'Landed', l_smooth: 'Smooth landing', l_good: 'Good landing', l_firm: 'Firm landing', l_hard: 'Hard landing — you walked away',
      l_vs: 'Touchdown rate', l_runway: 'Airport surface', l_offrunway: 'Off the airport',
      l_continue: 'Free flight', l_again: 'Fly again',
      f_title: 'Sightseeing Flight Complete', f_time: 'Total flight time', f_cps: 'Checkpoints', f_landing: 'Landing',
      err_gl: 'WebGL is unavailable', err_gl_hint: 'Enable hardware acceleration in your browser settings or try a current Chrome, Edge or Firefox.',
      err_three: 'Could not load the 3D engine', err_three_hint: 'Check that libs/three.min.js exists and open the game through a local web server: python -m http.server 8000',
      perf_shadows: 'Low frame rate — shadows turned off', perf_res: 'Low frame rate — resolution lowered', err_generic: 'Something went wrong while starting the game', err_generic_hint: 'Open the browser console (F12) for details and reload the page.',
      hint_keys: 'P pause · C camera · R restart · F3 debug',
      dbg: 'Debug', cam_chase: 'Chase', cam_cockpit: 'Cockpit', cam_cine: 'Cinematic',
    },
    ru: {
      title: 'LA Flight Simulator',
      subtitle: 'Взлетите на лёгком винтовом самолёте, облетите стилизованный Лос-Анджелес — башни Даунтауна, Голливудские холмы, побережье — и посадите машину в аэропорту.',
      start: 'Начать полёт',
      loadingTitle: 'Подготовка к полёту',
      ld_terrain: 'Формируем рельеф…', ld_ground: 'Рисуем улицы и парки…', ld_city: 'Строим город…', ld_landmarks: 'Ставим ориентиры…', ld_done: 'Готово',
      controls: 'Управление',
      c_pitch: 'Тангаж: вниз / вверх', c_roll: 'Крен: влево / вправо', c_yaw: 'Рыскание: влево / вправо', c_throttle: 'Газ: больше / меньше', c_brake: 'Тормоза колёс',
      c_cam: 'Камера', c_restart: 'Рестарт', c_pause: 'Пауза', c_more: 'Звук · Помощник · Единицы · Тени · Язык · Инверсия тангажа', c_arrows: 'Стрелки работают как W A S D. Газ также: X / Z.',
      note: 'Стилизованная карта: дороги, здания и ориентиры схематичны, а не географически точны.',
      mobile: 'Для игры нужна клавиатура. Лучше открыть её на компьютере или ноутбуке.',
      st_ground: 'НА ЗЕМЛЕ', st_takeoff: 'ВЗЛЁТ', st_flying: 'ПОЛЁТ', st_stall: 'СРЫВ', st_landed: 'ПОСАДКА', st_crashed: 'АВАРИЯ',
      h_speed: 'Скорость', h_alt: 'Высота', h_hdg: 'Курс', h_thr: 'Газ', h_vs: 'Верт. скорость',
      u_kt: 'уз', u_kmh: 'км/ч', u_ft: 'фт', u_m: 'м', u_fpm: 'фт/мин', u_ms: 'м/с',
      w_stall: 'СРЫВ — нос вниз, добавьте газ', w_pull: 'ТЯНИТЕ ВВЕРХ', w_range: 'ВЫЛЕТ ЗА ЗОНУ ПОЛЁТА — РАЗВЕРНИТЕСЬ', w_stallwarn: 'БЛИЗКО К СРЫВУ',
      m_title: 'Обзорный полёт', m_next: 'Далее', m_dist: 'Расстояние', m_time: 'Время', m_done: 'Выполнено',
      s_takeoff: 'Взлёт', s_downtown: 'Даунтаун Лос-Анджелеса', s_griffith: 'Обсерватория Гриффита', s_sign: 'Знак Hollywood', s_pier: 'Пирс Санта-Моники', s_coast: 'Береговая линия', s_final: 'Заход на посадку', s_land: 'Посадка на полосу',
      t_cp: 'Контрольная точка', t_missed: 'Точка пропущена — вернитесь', t_airborne: 'Взлетели', t_land_away: 'Посадка вне полосы — для миссии нужен аэропорт',
      p_title: 'Пауза', p_resume: 'Продолжить', p_restart: 'Заново', p_settings: 'Настройки',
      set_sound: 'Звук', set_assist: 'Помощник пилота', set_units: 'Единицы', set_shadows: 'Тени', set_lang: 'Язык', set_invert: 'Инверсия тангажа',
      on: 'Вкл', off: 'Выкл', metric: 'Метрические', imperial: 'Авиационные',
      r_crashed: 'Авария', r_restart: 'Заново', r_hint: 'Нажмите R для рестарта',
      cr_terrain: 'Столкновение с землёй.', cr_building: 'Столкновение со зданием.', cr_water: 'Падение в воду: сухопутный самолёт не садится на воду.',
      cr_hard: 'Слишком жёсткое касание.', cr_bank: 'Крыло зацепило полосу — слишком большой крен.', cr_attitude: 'Неверный тангаж при касании.', cr_speed: 'Слишком высокая скорость касания.', cr_drift: 'Снос в сторону при касании.', cr_range: 'Вы покинули зону полёта.',
      l_title: 'Посадка', l_smooth: 'Мягкая посадка', l_good: 'Хорошая посадка', l_firm: 'Жёсткая посадка', l_hard: 'Грубая посадка — но вы живы',
      l_vs: 'Вертикальная скорость касания', l_runway: 'Покрытие аэропорта', l_offrunway: 'Вне аэропорта',
      l_continue: 'Свободный полёт', l_again: 'Лететь снова',
      f_title: 'Обзорный полёт завершён', f_time: 'Общее время полёта', f_cps: 'Контрольные точки', f_landing: 'Посадка',
      err_gl: 'WebGL недоступен', err_gl_hint: 'Включите аппаратное ускорение в настройках браузера или откройте игру в актуальном Chrome, Edge или Firefox.',
      err_three: 'Не удалось загрузить 3D-движок', err_three_hint: 'Проверьте, что файл libs/three.min.js на месте, и запустите игру через локальный сервер: python -m http.server 8000',
      perf_shadows: 'Низкий FPS — тени отключены', perf_res: 'Низкий FPS — снижено разрешение', err_generic: 'При запуске игры что-то пошло не так', err_generic_hint: 'Откройте консоль браузера (F12) и перезагрузите страницу.',
      hint_keys: 'P пауза · C камера · R рестарт · F3 отладка',
      dbg: 'Отладка', cam_chase: 'Сзади', cam_cockpit: 'Кабина', cam_cine: 'Кинематограф',
    },
  };

  const I = (LA.I18N = { lang: 'en', dict });
  LA.t = (k) => (dict[I.lang] && dict[I.lang][k]) || dict.en[k] || k;
  I.setLang = (l) => {
    I.lang = dict[l] ? l : 'en';
    if (typeof document !== 'undefined') {
      document.documentElement.lang = I.lang;
      I.apply(document);
    }
  };
  I.apply = (root) => {
    root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = LA.t(el.getAttribute('data-i18n')); });
  };
  I.detect = () => {
    const nav = (typeof navigator !== 'undefined' && (navigator.language || '')) || '';
    return /^ru|^uk|^be|^kk/i.test(nav) ? 'ru' : 'en';
  };
})();
