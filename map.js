(function () {
  'use strict';

  async function waitForMapAndNames(timeout = 10000, interval = 150) {
    const start = Date.now();
    while (
      typeof window.__mapName__ === 'undefined' ||
      typeof window.__layerNames__ === 'undefined'
    ) {
      if (Date.now() - start > timeout) {
        console.error('❌ Таймаут: window.__mapName__ или window.__layerNames__ не заданы.');
        return null;
      }
      await new Promise((r) => setTimeout(r, interval));
    }
    const mapName = window.__mapName__;
    while (typeof window[mapName] === 'undefined') {
      if (Date.now() - start > timeout) {
        console.error('❌ Таймаут: объект карты window[' + mapName + '] не найден.');
        return null;
      }
      await new Promise((r) => setTimeout(r, interval));
    }
    return { mapName, map: window[mapName], categories: window.__layerNames__ };
  }

  (async function main() {
    console.log('[map.js] Старт...');
    const ctx = await waitForMapAndNames(12000, 200);
    if (!ctx) return;
    const { map, categories } = ctx;

    console.log('✅ Карта найдена.');
    console.log('Категории:', categories);

// === Создание групп и панели слоёв ===
const groups = {};
const overlayLayers = {};

for (const cat of categories) {
  const group = L.featureGroup();
  groups[cat] = group;
  overlayLayers[cat] = group;
  // Добавляем пустую группу, чтобы контроллер "увидел" слой
  group.addTo(map);
  // Убираем обратно, чтобы слой по умолчанию был выключен
  map.removeLayer(group);
}

// создаём и добавляем панель слоёв
const layersControl = L.control
  .layers(null, overlayLayers, { collapsed: false, position: 'topright' })
  .addTo(map);

const styleFix = document.createElement('style');
styleFix.textContent = `
  .leaflet-control-layers {
    display: block !important;
    opacity: 1 !important;
    visibility: visible !important;
    z-index: 2000 !important;
    position: relative !important;
  }
  .leaflet-top.leaflet-right {
    z-index: 2000 !important;
  }
`;
document.head.appendChild(styleFix);

// Делаем панель визуально выше всех элементов (чтобы не пряталась)
setTimeout(() => {
  const controlContainer = document.querySelector('.leaflet-control-layers');
  if (controlContainer) {
    controlContainer.style.zIndex = '1500';
    controlContainer.style.position = 'relative';
    controlContainer.style.background = 'rgba(255,255,255,0.8)';
    controlContainer.style.borderRadius = '8px';
    controlContainer.style.padding = '4px';
  }
}, 500);

// Проверим лог (должен показать список категорий)
console.log('🟢 Панель слоёв создана. Доступные категории:', Object.keys(overlayLayers));


    //  DOM — полноэкранный overlay для звука/картинок
    const darkOverlay = document.createElement('div');
    Object.assign(darkOverlay.style, {
      position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
      backgroundColor: 'rgba(0,0,0,0.9)', display: 'none', opacity: 0,
      transition: 'opacity 0.8s ease', zIndex: 999
    });
    document.body.appendChild(darkOverlay);

    const overlayImage = document.createElement('img');
    Object.assign(overlayImage.style, {
      position: 'fixed', top: '50%', left: '50%',
      transform: 'translate(-50%, -50%) scale(1)',
      width: '100vw', height: '100vh', objectFit: 'cover',
      display: 'none', opacity: 0,
      transition: 'opacity 1s ease, transform 20s ease-in-out',
      zIndex: 1000
    });
    document.body.appendChild(overlayImage);

    const audioPlayer = document.createElement('audio');
    document.body.appendChild(audioPlayer);

const closeSoundButton = document.createElement('button');
closeSoundButton.textContent = '×';
Object.assign(closeSoundButton.style, {
  position: 'fixed',
  top: '15px',
  left: '20px', // 🔹 перемещаем кнопку в левый верхний угол
  fontSize: '30px',
  color: '#fff',
  background: 'rgba(0,0,0,0.6)',
  border: 'none',
  borderRadius: '50%',
  width: '45px',
  height: '45px',
  cursor: 'pointer',
  display: 'none',
  zIndex: 1002
});
document.body.appendChild(closeSoundButton);

    function hideOverlay() {
      audioPlayer.pause();
      audioPlayer.currentTime = 0;
      darkOverlay.style.opacity = 0;
      overlayImage.style.opacity = 0;
      setTimeout(() => {
        darkOverlay.style.display = 'none';
        overlayImage.style.display = 'none';
        closeSoundButton.style.display = 'none';
      }, 600);
    }
    closeSoundButton.addEventListener('click', hideOverlay);
    audioPlayer.addEventListener('ended', hideOverlay);

    //  Стили popups (маленькие картинки для видов и т.п.) ===
    const style = document.createElement('style');
    style.textContent = `
      .leaflet-popup-content-wrapper {
        background: rgba(0,0,0,0.75);
        color: #fff;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.4);
        backdrop-filter: blur(4px);
      }
      .custom-popup { font-family: Arial, sans-serif; font-size: 13px; }
      .species-popup img { width: 90px; height: auto; border-radius: 6px; margin-top:6px; }
    `;
    document.head.appendChild(style);

    //  Загружаем data.json
    let data;
    try {
      const resp = await fetch('data.json');
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      data = await resp.json();
      console.log('✅ Загружено объектов:', data.length);
    } catch (err) {
      console.error('Ошибка загрузки data.json:', err);
      return;
    }

    const allObjects = [];
    const activeSpecies = { group: null };

    function makeIcon(url, size = [30, 40]) {
      return L.icon({
        iconUrl: url,
        iconSize: size,
        iconAnchor: [size[0] / 2, size[1]],
        popupAnchor: [0, -Math.round(size[1] * 0.9)]
      });
    }

    //  Создание объектов: маркеры, полигоны, полилинии
    for (const obj of data) {
      const group = groups[obj.category];
      if (!group) {
        console.warn('Категория не найдена в overlay list:', obj.category);
        continue;
      }

      try {
        // 1) Звуковые маркеры в "Природа" — открывают полноэкранную картинку и звук
        if (obj.sound && obj.image && obj.category === 'Природа' && obj.type === 'marker') {
          const icon = makeIcon(obj.icon || 'sound.png', [30, 36]);
          const marker = L.marker(obj.coords, {
            icon,
            minZoom: obj.min_zoom ?? 0,
            maxZoom: obj.max_zoom ?? 18
          });

          marker.on('click', () => {
 // скрыть панель слоёв
  const controlContainer = document.querySelector('.leaflet-control-layers');
  if (controlContainer) controlContainer.style.display = 'none';            darkOverlay.style.display = 'block';
            overlayImage.src = obj.image;
            overlayImage.style.display = 'block';
            closeSoundButton.style.display = 'block';

            // плавно показать
            requestAnimationFrame(() => {
              darkOverlay.style.opacity = 1;
              overlayImage.style.opacity = 1;
              overlayImage.style.transform = 'translate(-50%, -50%) scale(1.05)';
            });
            // небольшая анимация приближения
            setTimeout(() => {
              overlayImage.style.transform = 'translate(-50%, -50%) scale(1.0)';
            }, 10000);

            audioPlayer.src = obj.sound;
            audioPlayer.loop = true;
            audioPlayer.play().catch(console.error);
          });
// при закрытии — вернуть панель
closeSoundButton.addEventListener('click', () => {
  hideOverlay();
  const controlContainer = document.querySelector('.leaflet-control-layers');
  if (controlContainer) controlContainer.style.display = 'block';
});
          marker.__category = obj.category;
          marker.__year = obj.year ?? null;
          allObjects.push(marker);
          continue;
        }

//  Особый маркер слайд-шоу
if (obj.name === "Храм Воздвижения Креста Господня") {
  const icon = makeIcon(obj.icon || 'church.png');

  const marker = L.marker(obj.coords, {
    icon,
    minZoom: obj.min_zoom ?? 0,
    maxZoom: obj.max_zoom ?? 18
  });

  marker.on('click', () => {
    // скрыть панель слоёв
    const controlContainer = document.querySelector('.leaflet-control-layers');
    if (controlContainer) controlContainer.style.display = 'none';

    //  overlay
    const overlay = document.createElement('div');
    overlay.className = 'slideshow-overlay';
    Object.assign(overlay.style, {
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      backgroundColor: 'rgba(0,0,0,0.9)',
      zIndex: 1000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'column',
      overflow: 'hidden',
      transition: 'opacity 1s ease'
    });
    document.body.appendChild(overlay);

    //  изображение
    const img = document.createElement('img');
    Object.assign(img.style, {
      position: 'absolute',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%) scale(1)',
      width: '100vw',
      height: '100vh',
      objectFit: 'cover',
      opacity: 0,
      transition: 'opacity 1s ease, transform 15s ease-in-out'
    });
    overlay.appendChild(img);

    //  текст
    const text = document.createElement('div');
    Object.assign(text.style, {
      position: 'absolute',
      bottom: '10%',
      left: '50%',
      transform: 'translateX(-50%)',
      color: '#fff',
      fontSize: '28px',
      fontFamily: 'Georgia, serif',
      textAlign: 'center',
      background: 'rgba(0, 0, 0, 0.4)',
      padding: '15px 25px',
      borderRadius: '10px',
      maxWidth: '80%',
      opacity: 0,
      transition: 'opacity 1.5s ease'
    });
    overlay.appendChild(text);

    //  кнопка закрытия
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    Object.assign(closeBtn.style, {
      position: 'fixed',
      top: '15px',
     left: '25px',
      fontSize: '36px',
      background: 'rgba(0,0,0,0.5)',
      color: '#fff',
      border: 'none',
      borderRadius: '50%',
      width: '50px',
      height: '50px',
      cursor: 'pointer',
      zIndex: 1001
    });
    overlay.appendChild(closeBtn);

    const slides = [
      { src: 'images/slide1.jpg', text: 'Агрогородок Вистычи славится уникальным памятником архитектуры — Храмом Воздвижения Креста Господня.' },
      { src: 'images/slide2.jpg', text: 'Храм был построен в 1748 году и являлся частью монастыря ордена цисцерианцев.' },
      { src: 'images/slide3.jpg', text: 'В 1866 году монастырь был упразднен, а здание передано Православной церкви. Кроме храма, от монастыря сегодня остались фрагменты стен корпусов.' },
      { src: 'images/slide4.jpg', text: 'Храм пережил несколько войн, долгое время был разрушен и пустовал. Только в 2011 году началось масштабное обновление храма.' },
      { src: 'images/slide5.jpg', text: 'В 2023 году храм отметил свой 345-летний юбилей. В 2024 году Крестовоздвиженский храм получил в дар 10 уникальных колоколов, аналогов которым нет во всей Брестской области.' }
    ];

    const audioTracks = {
      part1: new Audio('sounds/molitva.mp3'),
      part2: new Audio('sounds/vera.mp3'),
      part3: new Audio('sounds/kolokol.mp3')
    };

    let index = 0;
    let currentTrack = null;

    Object.values(audioTracks).forEach(a => { a.loop = true; a.volume = 0.8; });

    function fadeAudio(audio, target, duration = 1000) {
      if (!audio) return;
      const step = 50;
      const diff = (target - audio.volume) / (duration / step);
      const fade = setInterval(() => {
        audio.volume += diff;
        if ((diff > 0 && audio.volume >= target) || (diff < 0 && audio.volume <= target)) {
          clearInterval(fade);
          audio.volume = target;
          if (target === 0) { audio.pause(); audio.currentTime = 0; }
        }
      }, step);
    }

    function playTrackForSlide(i) {
      let newTrack = i <= 2 ? audioTracks.part1 : i <= 3 ? audioTracks.part2 : audioTracks.part3;
      if (currentTrack === newTrack) return;
      if (currentTrack) fadeAudio(currentTrack, 0, 1000);
      currentTrack = newTrack;
      currentTrack.currentTime = 0;
      currentTrack.volume = 0;
      currentTrack.play().catch(console.error);
      fadeAudio(currentTrack, 0.8, 1000);
    }

    function showSlide(i) {
      const s = slides[i];
      img.style.opacity = 0;
      text.style.opacity = 0;
      setTimeout(() => {
        img.src = s.src;
        text.textContent = s.text;
        img.style.opacity = 1;
        text.style.opacity = 1;
      }, 300);
      playTrackForSlide(i);
    }

    showSlide(index);

    overlay.addEventListener('click', () => {
      index = (index + 1) % slides.length;
      showSlide(index);
    });

    function closeAll() {
      Object.values(audioTracks).forEach(a => { a.pause(); a.currentTime = 0; });
      overlay.remove();
      const controlContainer = document.querySelector('.leaflet-control-layers');
      if (controlContainer) controlContainer.style.display = 'block';
    }

    closeBtn.onclick = closeAll;
  });

  marker.__category = obj.category;
  allObjects.push(marker);
  groups[obj.category].addLayer(marker);
  continue;
}


        // 2) Полигоны охраняемых территорий — при click показываем маркеры видов
        if (obj.type === 'polygon') {
          const polygon = L.polygon(obj.coords, {
            color: obj.color || 'green',
            fillColor: obj.fill_color || '#7CFC00',
            fillOpacity: obj.fill_opacity ?? 0.4,
            weight: obj.weight ?? 2,
            minZoom: obj.min_zoom ?? 0,
            maxZoom: obj.max_zoom ?? 18
          }).bindPopup(`<b>${obj.name}</b>${obj.info ? '<br>' + obj.info : ''}`);

          polygon.__category = obj.category;
          polygon.__species = obj.species || null;
          polygon.__year = obj.year ?? null;

          polygon.on('click', () => {
            // если уже показана группа видов — убрать её
            if (activeSpecies.group) {
              map.removeLayer(activeSpecies.group);
              activeSpecies.group = null;
              return;
            }
            if (!Array.isArray(obj.species) || obj.species.length === 0) {
              polygon.openPopup();
              return;
            }
            const sg = L.featureGroup();
            obj.species.forEach(sp => {
              const ic = makeIcon(sp.icon || 'images/fauna.png', [26, 26]);
              const m = L.marker(sp.coords, { icon: ic, minZoom: sp.min_zoom ?? 0, maxZoom: sp.max_zoom ?? 18 });
              m.__category = obj.category;
              // цикличное поведение по клику: 1 - факт, 2 - фото+название, 3 - закрыть
              let clickCount = 0;
              m.on('click', () => {
                clickCount = (clickCount + 1) % 3;
                if (clickCount === 1) {
                  m.bindPopup(`<i>${sp.fact || ''}</i>`, { autoClose: false, className: 'custom-popup' }).openPopup();
                } else if (clickCount === 2) {
                  m.bindPopup(`<div class="species-popup"><b>${sp.name || ''}</b><br>${sp.image ? `<img src="${sp.image}" alt="${sp.name}">` : ''}</div>`, { autoClose: false, className: 'custom-popup' }).openPopup();
                } else {
                  m.closePopup();
                }
              });
              sg.addLayer(m);
            });
            sg.addTo(map);
            activeSpecies.group = sg;
          });

          allObjects.push(polygon);
          continue;
        }

        // 3) Поли линии
        if (obj.type === 'polyline') {
          const pl = L.polyline(obj.coords, {
            color: obj.color || '#3388ff',
            weight: obj.weight ?? 3,
            opacity: obj.opacity ?? 0.8,
            minZoom: obj.min_zoom ?? 0,
            maxZoom: obj.max_zoom ?? 18
          }).bindPopup(`<b>${obj.name}</b>${obj.info ? '<br>' + obj.info : ''}`);

          pl.__category = obj.category;
          pl.__year = obj.year ?? null;
          allObjects.push(pl);
          continue;
        }


        // 4) Обычные маркеры (включая церкви, населённые пункты и т.п.)
        if (obj.type === 'marker') {
          const icon = makeIcon(obj.icon || 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png', [30,40]);
          const marker = L.marker(obj.coords, {
            icon,
            minZoom: obj.min_zoom ?? 0,
            maxZoom: obj.max_zoom ?? 18
          });

          // Попап — правильно собираем HTML с интерполяцией
          const popupHtml = `
            <div class="custom-popup" style="max-width:260px;">
              <b>${obj.name}</b>
              ${obj.info ? '<br>' + obj.info : ''}
              ${obj.image ? `<br><img src="${obj.image}" style="width:100%;margin-top:6px;border-radius:6px;">` : ''}
            </div>`;

          marker.bindPopup(popupHtml, { autoClose: false });
          marker.__category = obj.category;
          marker.__year = obj.year ?? null;
          allObjects.push(marker);
          continue;
        }

        // если тип неизвестен — просто логируем
        console.warn('Неизвестный тип объекта (пропускаем):', obj.type);
      } catch (err) {
        console.error('Ошибка создания объекта:', obj, err);
      }
    } // /for data

    //  Видимость по zoom и добавление в группы ===
    function updateVisibilityOnZoom() {
      const z = map.getZoom();
      for (const [cat, group] of Object.entries(groups)) {
        // если слой не включён пользователем, пропускаем
        if (!map.hasLayer(group)) continue;
        group.clearLayers();
        for (const o of allObjects) {
          const minZ = o.options?.minZoom ?? 0;
          const maxZ = o.options?.maxZoom ?? 18;
          if (o.__category === cat && z >= minZ && z <= maxZ) {
            group.addLayer(o);
          }
        }
      }
    }

    // События: зум и переключение слоёв
    map.on('zoomend', updateVisibilityOnZoom);
    map.on('overlayadd', (e) => {

//  🎨 ЭФФЕКТ "СТАРИННОЙ" КАРТЫ + ЛЕНТА ВРЕМЕНИ (SLIDER)

// 🕰️ Контейнер ленты времени
const timelineContainer = document.createElement('div');
Object.assign(timelineContainer.style, {
  position: 'fixed',
  bottom: '25px',
  left: '50%',
  transform: 'translateX(-50%)',
  zIndex: '1001',
  display: 'none',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '6px',
  color: '#fff',
  fontFamily: 'Arial, sans-serif',
  textAlign: 'center'
});
document.body.appendChild(timelineContainer);

//  подпись с годом
const yearLabel = document.createElement('div');
Object.assign(yearLabel.style, {
  fontSize: '22px',
  fontWeight: 'bold',
  color: '#fff',
  background: 'rgba(0, 0, 0, 0.55)',
  padding: '8px 20px',
  borderRadius: '10px',
  marginBottom: '8px',
  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
  backdropFilter: 'blur(3px)',       // 🔹 добавляет эффект стекла
  textShadow: '0 2px 6px rgba(0,0,0,0.8)', // 🔹 делает надпись четче
  letterSpacing: '1px',
  transition: 'background 0.5s ease, color 0.5s ease'
});
yearLabel.textContent = 'Выберите год';
timelineContainer.appendChild(yearLabel);


//  сам ползунок
const timelineSlider = document.createElement('input');
Object.assign(timelineSlider, {
  type: 'range',
  min: 1941,
  max: 1945,
  step: 1,
});
Object.assign(timelineSlider.style, {
  width: '320px',
  appearance: 'none',
  height: '6px',
  borderRadius: '4px',
  background: 'linear-gradient(90deg, #7b5e3b 0%, #d1b58a 100%)',
  outline: 'none',
  cursor: 'pointer'
});
timelineContainer.appendChild(timelineSlider);

//  Переменная текущего года
let currentWarYear = null;
let firstYearSelected = false;

//  Реакция на изменение ползунка
timelineSlider.addEventListener('input', (e) => {
  const value = Number(e.target.value);

  // 🔹 При первом выборе полностью заменяем текст и фон
  if (!firstYearSelected) {
    firstYearSelected = true;
    yearLabel.textContent = ''; // очищаем полностью
    yearLabel.style.background = 'transparent';
  }

  // теперь просто показываем выбранный год
  yearLabel.textContent = value;
  currentWarYear = value;

  updateVisibilityOnZoom();
});


//  Функция фильтрации и отрисовки
function updateVisibilityOnZoom() {
  const z = map.getZoom();
  for (const [cat, group] of Object.entries(groups)) {
    if (!map.hasLayer(group)) continue;
    group.clearLayers();

    for (const o of allObjects) {
      const minZ = o.options?.minZoom ?? 0;
      const maxZ = o.options?.maxZoom ?? 18;
      if (o.__category === cat && z >= minZ && z <= maxZ) {

        // фильтрация по годам только для ВОВ
        if (cat === 'Великая Отечественная война') {
          const objYear = Number(o.__year);

          // если год не выбран — скрываем все маркеры
          if (!currentWarYear) continue;
          if (isNaN(objYear) || objYear !== currentWarYear) continue;
        }

        group.addLayer(o);
      }
    }
  }
}

//  Эффекты при включении/выключении слоя
map.on('overlayadd', (e) => {
  if (e.name === 'Великая Отечественная война') {
    // показываем ползунок
    timelineContainer.style.display = 'flex';

    // обнуляем состояние — только надпись "Выберите год"
    currentWarYear = null;
    firstYearSelected = false;
    yearLabel.textContent = 'Выберите год';
    yearLabel.style.background = 'rgba(0,0,0,0.6)';
    yearLabel.style.color = '#ccc';
    updateVisibilityOnZoom();

    // эффект старой карты — сепия в коричнево-серых тонах
    const tilePane = document.querySelector('.leaflet-tile-pane');
    if (tilePane) {
      tilePane.style.transition = 'filter 1s ease';
      tilePane.style.filter =
        'grayscale(80%) sepia(60%) contrast(1.1) brightness(0.9) hue-rotate(-15deg)';
    }
  }
});

map.on('overlayremove', (e) => {
  if (e.name === 'Великая Отечественная война') {
    // убираем ползунок и сбрасываем состояние
    timelineContainer.style.display = 'none';
    currentWarYear = null;
    firstYearSelected = false;
    updateVisibilityOnZoom();

    // возвращаем нормальную карту
    const tilePane = document.querySelector('.leaflet-tile-pane');
    if (tilePane) tilePane.style.filter = '';
  }
});

// при зуме обновляем
map.on('zoomend', updateVisibilityOnZoom);




      // если включён слой, обновляем видимость его объектов
      updateVisibilityOnZoom();
    });
    map.on('overlayremove', (e) => {
      // при выключении слоя — убираем его содержимое и сбрасываем виды
      groups[e.name]?.clearLayers();
      if (activeSpecies.group) {
        map.removeLayer(activeSpecies.group);
        activeSpecies.group = null;
      }
    });

    // начальная отрисовка — если какие-то группы уже включены
    updateVisibilityOnZoom();

    console.log('✅ map.js полностью инициализирован.');
  })();
})();
