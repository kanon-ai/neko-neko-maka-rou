(() => {
  "use strict";

  const canvas = document.querySelector("#game");
  const ctx = canvas.getContext("2d");
  const ui = {
    start: document.querySelector("#startOverlay"),
    end: document.querySelector("#endOverlay"),
    resultEyebrow: document.querySelector("#resultEyebrow"),
    resultTitle: document.querySelector("#resultTitle"),
    resultText: document.querySelector("#resultText"),
    hpBar: document.querySelector("#hpBar"),
    hpLabel: document.querySelector("#hpLabel"),
    floorLabel: document.querySelector("#floorLabel"),
    floorStat: document.querySelector("#floorStat"),
    levelStat: document.querySelector("#levelStat"),
    xpStat: document.querySelector("#xpStat"),
    fishStat: document.querySelector("#fishStat"),
    fishCount: document.querySelector("#fishCount"),
    keyStat: document.querySelector("#keyStat"),
    keyIcon: document.querySelector("#keyIcon"),
    killStat: document.querySelector("#killStat"),
    attackStat: document.querySelector("#attackStat"),
    defenseStat: document.querySelector("#defenseStat"),
    weaponStat: document.querySelector("#weaponStat"),
    armorStat: document.querySelector("#armorStat"),
    weaponIcon: document.querySelector("#weaponIcon"),
    log: document.querySelector("#log"),
    announcement: document.querySelector("#announcement"),
    sound: document.querySelector("#soundButton"),
    bgmSettings: document.querySelector("#bgmSettingsButton"),
    bgmPanel: document.querySelector("#bgmPanel"),
    bgmClose: document.querySelector("#bgmCloseButton"),
    bgmFile: document.querySelector("#bgmFileInput"),
    bgmFileName: document.querySelector("#bgmFileName"),
    bgmVolume: document.querySelector("#bgmVolume"),
    bgmVolumeLabel: document.querySelector("#bgmVolumeLabel"),
    bgmDefault: document.querySelector("#bgmDefaultButton"),
  };

  const COLS = 24;
  const ROWS = 16;
  const TILE = 40;
  const MAX_FLOOR = 10;
  const BALANCE = {
    startHp: 9,
    fishHeal: 4,
    floorHeal: 1,
    levelHeal: 3,
    levelHpGain: 1,
  };
  const colors = {
    void: "#171135", wallA: "#6647ae", wallB: "#805ac6", floorA: "#f49ac5",
    floorB: "#8ce5d2", fog: "#171135", ink: "#29184e", cream: "#fff7dd",
  };
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  let map = [];
  let rooms = [];
  let enemies = [];
  let items = [];
  let exit = { x: 0, y: 0 };
  let player;
  let floor = 1;
  let kills = 0;
  let state = "menu";
  let turn = 0;
  let shake = 0;
  let flash = 0;
  let audio = null;
  let bgmAudio = null;
  let bgmObjectUrl = null;
  let bgmTimer = null;
  let bgmStep = 0;
  let bgmVolume = Number(localStorage.getItem("catCandyBgmVolume") ?? 35) / 100;
  let muted = false;
  let announceTimer = 0;
  let logs = [];

  function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
  function clamp(value, min, max) { return Math.min(Math.max(value, min), max); }
  function choice(list) { return list[Math.floor(Math.random() * list.length)]; }
  function key(x, y) { return `${x},${y}`; }
  function distance(a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }
  function inBounds(x, y) { return x >= 0 && y >= 0 && x < COLS && y < ROWS; }
  function tileAt(x, y) { return inBounds(x, y) ? map[y][x] : 0; }
  function enemyAt(x, y) { return enemies.find((e) => e.x === x && e.y === y && e.hp > 0); }
  function itemAt(x, y) { return items.find((item) => item.x === x && item.y === y); }
  function usesMobileView() { return window.matchMedia("(max-width: 650px), (pointer: coarse)").matches; }
  function addLog(text) {
    logs.unshift(text);
    logs = logs.slice(0, 6);
    ui.log.innerHTML = logs.map((line) => `<li>${line}</li>`).join("");
  }
  function announce(text) {
    ui.announcement.textContent = text;
    ui.announcement.classList.remove("hidden");
    clearTimeout(announceTimer);
    announceTimer = setTimeout(() => ui.announcement.classList.add("hidden"), 1300);
  }

  function makeMap() {
    map = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
    rooms = [];
    for (let attempt = 0; attempt < 120 && rooms.length < 8; attempt++) {
      const room = { w: rand(4, 7), h: rand(3, 5), x: rand(1, COLS - 8), y: rand(1, ROWS - 6) };
      if (rooms.some((r) => room.x <= r.x + r.w + 1 && room.x + room.w + 1 >= r.x && room.y <= r.y + r.h + 1 && room.y + room.h + 1 >= r.y)) continue;
      carveRoom(room);
      if (rooms.length) connect(center(rooms.at(-1)), center(room));
      rooms.push(room);
    }
    if (rooms.length < 3) return makeMap();
  }

  function carveRoom(room) {
    for (let y = room.y; y < room.y + room.h; y++) for (let x = room.x; x < room.x + room.w; x++) map[y][x] = 1;
  }
  function center(room) { return { x: room.x + Math.floor(room.w / 2), y: room.y + Math.floor(room.h / 2) }; }
  function connect(a, b) {
    let x = a.x;
    let y = a.y;
    const horizontalFirst = Math.random() < .5;
    const carveX = () => { while (x !== b.x) { map[y][x] = 1; x += Math.sign(b.x - x); } };
    const carveY = () => { while (y !== b.y) { map[y][x] = 1; y += Math.sign(b.y - y); } };
    if (horizontalFirst) { carveX(); carveY(); } else { carveY(); carveX(); }
    map[y][x] = 1;
  }

  function randomFloor(occupied = new Set()) {
    for (let i = 0; i < 500; i++) {
      const room = choice(rooms);
      const p = { x: rand(room.x, room.x + room.w - 1), y: rand(room.y, room.y + room.h - 1) };
      if (!occupied.has(key(p.x, p.y))) return p;
    }
    return center(rooms[0]);
  }

  function setupFloor(keepStats = false) {
    makeMap();
    enemies = [];
    items = [];
    const start = center(rooms[0]);
    const old = player;
    player = {
      x: start.x, y: start.y, hp: keepStats ? old.hp : BALANCE.startHp, maxHp: keepStats ? old.maxHp : BALANCE.startHp,
      fish: keepStats ? old.fish : 1, hasKey: false, seen: new Set(), visible: new Set(),
      level: keepStats ? old.level : 1, xp: keepStats ? old.xp : 0,
      nextXp: keepStats ? old.nextXp : 6, weapon: keepStats ? old.weapon : 0,
      armor: keepStats ? old.armor : 0,
    };
    const occupied = new Set([key(player.x, player.y)]);
    exit = center(rooms.at(-1));
    occupied.add(key(exit.x, exit.y));

    const keyPos = randomFloor(occupied);
    occupied.add(key(keyPos.x, keyPos.y));
    items.push({ ...keyPos, type: "key" });
    for (let i = 0; i < 1 + Math.floor(floor / 3); i++) {
      const p = randomFloor(occupied);
      occupied.add(key(p.x, p.y));
      items.push({ ...p, type: "fish" });
    }
    if (floor % 2 === 0) {
      const upgradePos = randomFloor(occupied);
      occupied.add(key(upgradePos.x, upgradePos.y));
      const upgradeType = player.weapon > player.armor ? "armor" : player.armor > player.weapon ? "weapon" : choice(["weapon", "armor"]);
      items.push({ ...upgradePos, type: upgradeType });
    }
    for (let i = 0; i < 4 + floor * 2; i++) {
      const p = randomFloor(occupied);
      occupied.add(key(p.x, p.y));
      const type = choice(floor < 3 ? ["pudding", "mushroom"] : ["pudding", "mushroom", "glove"]);
      const stats = type === "mushroom" ? [3, 2] : type === "glove" ? [2, 2] : [2, 1];
      const hp = stats[0] + Math.floor((floor - 1) * .6);
      const attack = stats[1] + Math.floor((floor - 1) / 4);
      enemies.push({ ...p, type, hp, maxHp: hp, attack, xp: type === "mushroom" ? 3 : 2, awake: false });
    }
    computeFov();
    updateUi();
    announce(`第 ${floor} 層　${choice(["逆さまの食堂", "眠らない廊下", "木曜日の地下室", "月を煮る台所"])}`);
    addLog("階段がこちらを見ている。");
  }

  function computeFov() {
    player.visible.clear();
    const radius = 6;
    for (let y = player.y - radius; y <= player.y + radius; y++) {
      for (let x = player.x - radius; x <= player.x + radius; x++) {
        if (!inBounds(x, y) || Math.hypot(x - player.x, y - player.y) > radius) continue;
        if (lineVisible(player.x, player.y, x, y)) {
          player.visible.add(key(x, y));
          player.seen.add(key(x, y));
        }
      }
    }
  }

  function lineVisible(x0, y0, x1, y1) {
    let dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
    let dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    while (true) {
      if (x0 === x1 && y0 === y1) return true;
      if (!(x0 === player.x && y0 === player.y) && tileAt(x0, y0) === 0) return false;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  function tryMove(dx, dy) {
    if (state !== "play") return;
    initAudio();
    const nx = player.x + dx;
    const ny = player.y + dy;
    const foe = enemyAt(nx, ny);
    if (foe) {
      const damage = playerAttack();
      foe.hp -= damage;
      shake = 7;
      tone(310, .06, "square");
      addLog(`${enemyName(foe)}に ${damage} ダメージ。`);
      if (foe.hp <= 0) {
        kills++;
        gainXp(foe.xp);
        tone(560, .1, "triangle");
        addLog(`${enemyName(foe)}は都合よく消えた。`);
      }
      endTurn();
      return;
    }
    if (!tileAt(nx, ny)) {
      addLog("壁は今日、壁の気分らしい。");
      tone(90, .04, "square");
      return;
    }
    player.x = nx;
    player.y = ny;
    collectItem();
    if (player.x === exit.x && player.y === exit.y) {
      if (!player.hasKey) addLog("階段が鍵を要求して咳払いした。");
      else if (floor === MAX_FLOOR) return finish(true);
      else {
        floor++;
        player.hp = Math.min(player.maxHp, player.hp + BALANCE.floorHeal);
        setupFloor(true);
        tone(690, .15, "sine");
        return;
      }
    }
    endTurn();
  }

  function collectItem() {
    const item = itemAt(player.x, player.y);
    if (!item) return;
    items.splice(items.indexOf(item), 1);
    if (item.type === "fish") {
      player.fish++;
      tone(710, .08, "sine");
      addLog("床の魚を拾った。まだ温かい。");
    } else if (item.type === "key") {
      player.hasKey = true;
      tone(850, .12, "triangle");
      announce("出口の鍵を拾った！");
      addLog("鍵が「遅かったね」と言った。");
    } else if (item.type === "weapon") {
      player.weapon++;
      tone(930, .14, "square");
      announce(`ねこ剣が +${player.weapon} になった！`);
      addLog("剣が少しだけ剣らしくなった。");
    } else if (item.type === "armor") {
      player.armor++;
      tone(620, .16, "triangle");
      announce(`おしゃれ鎧が +${player.armor} になった！`);
      addLog("防具にリボンと防御力が増えた。");
    }
  }

  function playerAttack() {
    return 2 + player.weapon + Math.floor((player.level - 1) / 2);
  }

  function playerDefense() {
    return Math.ceil(player.armor / 2);
  }

  function gainXp(amount) {
    player.xp += amount;
    while (player.xp >= player.nextXp) {
      player.xp -= player.nextXp;
      player.level++;
      player.nextXp = 6 + player.level * 3;
      player.maxHp += BALANCE.levelHpGain;
      player.hp = Math.min(player.maxHp, player.hp + BALANCE.levelHeal);
      announce(`LEVEL UP！ Lv.${player.level}`);
      addLog("ひげが伸び、最大HPが少し上がった。");
      tone(1040, .2, "triangle");
    }
  }

  function endTurn() {
    turn++;
    enemies = enemies.filter((e) => e.hp > 0);
    enemies.forEach(moveEnemy);
    computeFov();
    updateUi();
    if (player.hp <= 0) finish(false);
  }

  function moveEnemy(enemy) {
    if (distance(enemy, player) <= 6 && lineVisible(player.x, player.y, enemy.x, enemy.y)) enemy.awake = true;
    if (!enemy.awake || Math.random() < .12) return;
    if (distance(enemy, player) === 1) {
      const damage = Math.max(1, enemy.attack - playerDefense());
      player.hp -= damage;
      flash = .35;
      shake = 10;
      tone(120, .09, "sawtooth");
      addLog(`${enemyName(enemy)}の攻撃。-${damage} HP`);
      return;
    }
    const candidates = dirs
      .map(([dx, dy]) => ({ x: enemy.x + dx, y: enemy.y + dy }))
      .filter((p) => tileAt(p.x, p.y) && !(p.x === player.x && p.y === player.y) && !enemyAt(p.x, p.y))
      .sort((a, b) => distance(a, player) - distance(b, player));
    if (candidates[0] && Math.random() < .88) Object.assign(enemy, candidates[0]);
  }

  function eatFish() {
    if (state !== "play") return;
    if (!player.fish) return addLog("魚の概念しか残っていない。");
    if (player.hp === player.maxHp) return addLog("今は満腹。たぶん。");
    player.fish--;
    player.hp = Math.min(player.maxHp, player.hp + BALANCE.fishHeal);
    tone(460, .13, "sine");
    addLog("魚を食べた。つじつまが少し戻る。");
    endTurn();
  }

  function waitTurn() {
    if (state !== "play") return;
    addLog("意味深に一拍おいた。");
    endTurn();
  }

  function finish(won) {
    state = "end";
    ui.end.classList.remove("hidden");
    ui.resultEyebrow.textContent = won ? "THE CASTLE APOLOGIZED" : "THE CASTLE SHRUGGED";
    ui.resultTitle.textContent = won ? "摩訶楼を踏破！" : "おひるねしました";
    ui.resultText.textContent = won
      ? `猫のミケロは ${kills} 体の珍妙な住人を退け、世界のつじつまを魚味に直しました。`
      : `第 ${floor} 層、撃破 ${kills} 体。夢だったことにして、もう一度どうぞ。`;
    tone(won ? 780 : 110, .35, won ? "triangle" : "sawtooth");
  }

  function startGame() {
    floor = 1;
    kills = 0;
    turn = 0;
    logs = [];
    state = "play";
    ui.start.classList.add("hidden");
    ui.end.classList.add("hidden");
    setupFloor();
    initAudio();
    startBgm();
  }

  function returnToTitle(ask = false) {
    if (ask && state === "play" && !window.confirm("今の冒険を終えてタイトルに戻りますか？")) return;
    state = "menu";
    pauseBgm();
    ui.end.classList.add("hidden");
    ui.start.classList.remove("hidden");
    ui.bgmPanel.classList.add("hidden");
    ui.bgmSettings.setAttribute("aria-expanded", "false");
  }

  function updateUi() {
    const hpRatio = Math.max(0, player.hp / player.maxHp);
    ui.hpBar.style.width = `${hpRatio * 100}%`;
    ui.hpLabel.textContent = `${Math.max(0, player.hp)} / ${player.maxHp}`;
    ui.floorLabel.textContent = floor;
    ui.floorStat.textContent = `${floor} / ${MAX_FLOOR}`;
    ui.levelStat.textContent = player.level;
    ui.xpStat.textContent = `${player.xp} / ${player.nextXp}`;
    ui.fishStat.textContent = player.fish;
    ui.fishCount.textContent = player.fish;
    ui.keyStat.textContent = player.hasKey ? "あり" : "なし";
    ui.keyIcon.textContent = player.hasKey ? "✓" : "?";
    ui.killStat.textContent = kills;
    ui.attackStat.textContent = playerAttack();
    ui.defenseStat.textContent = playerDefense();
    ui.weaponStat.textContent = `+${player.weapon}`;
    ui.armorStat.textContent = `+${player.armor}`;
    ui.weaponIcon.textContent = `+${player.weapon}`;
  }

  function enemyName(enemy) {
    return { pudding: "ひとつ目プリン", mushroom: "王冠キノコ", glove: "迷子の手袋" }[enemy.type];
  }

  function draw() {
    requestAnimationFrame(draw);
    syncCanvasSize();
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = colors.void;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawStars();
    const ox = shake ? rand(-shake, shake) : 0;
    const oy = shake ? rand(-shake, shake) : 0;
    shake *= .72;
    ctx.translate(ox, oy);
    if (player) {
      applyCamera();
      drawMap();
    }
    ctx.restore();
    if (flash > 0) {
      ctx.fillStyle = `rgba(255,90,120,${flash})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      flash *= .72;
    }
  }

  function drawStars() {
    ctx.fillStyle = "#ffffff55";
    for (let i = 0; i < 55; i++) {
      const x = (i * 173 + turn * 2) % canvas.width;
      const y = (i * 97) % canvas.height;
      ctx.fillRect(x, y, i % 5 === 0 ? 2 : 1, i % 5 === 0 ? 2 : 1);
    }
  }

  function syncCanvasSize() {
    const targetHeight = usesMobileView() ? 960 : 640;
    if (canvas.width !== 960) canvas.width = 960;
    if (canvas.height !== targetHeight) canvas.height = targetHeight;
  }

  function applyCamera() {
    const zoom = usesMobileView() ? 1.65 : 1;
    if (zoom === 1) return;

    const viewWidth = canvas.width / zoom;
    const viewHeight = canvas.height / zoom;
    const mapWidth = COLS * TILE;
    const mapHeight = ROWS * TILE;
    const centerX = player.x * TILE + TILE / 2;
    const centerY = player.y * TILE + TILE / 2;
    const cameraX = clamp(centerX - viewWidth / 2, 0, mapWidth - viewWidth);
    const cameraY = clamp(centerY - viewHeight / 2, 0, mapHeight - viewHeight);

    ctx.scale(zoom, zoom);
    ctx.translate(-cameraX, -cameraY);
  }

  function drawMap() {
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const id = key(x, y);
        if (!player.seen.has(id)) continue;
        const visible = player.visible.has(id);
        drawTile(x, y, visible);
      }
    }
    if (player.seen.has(key(exit.x, exit.y))) drawExit(exit.x, exit.y, player.visible.has(key(exit.x, exit.y)));
    items.forEach((item) => {
      if (player.visible.has(key(item.x, item.y))) drawItem(item);
    });
    enemies.forEach((enemy) => {
      if (player.visible.has(key(enemy.x, enemy.y))) drawEnemy(enemy);
    });
    drawCat(player.x, player.y);
    drawPlayerCursor(player.x, player.y);
  }

  function drawPlayerCursor(x, y) {
    const px = x * TILE, py = y * TILE;
    const pulse = Math.sin(performance.now() / 180) * 2;
    ctx.save();
    ctx.shadowColor = "#ffe56c";
    ctx.shadowBlur = 10;
    ctx.lineWidth = 5;
    ctx.strokeStyle = "#ff4fa3";
    ctx.strokeRect(px + 1.5, py + 1.5, TILE - 3, TILE - 3);
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#fff7dd";
    ctx.strokeRect(px + 3.5, py + 3.5, TILE - 7, TILE - 7);
    ctx.setLineDash([8, 4]);
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#ffe56c";
    ctx.strokeRect(px + 7.5, py + 7.5, TILE - 15, TILE - 15);
    ctx.setLineDash([]);
    ctx.fillStyle = "#ffe56c";
    ctx.beginPath();
    ctx.moveTo(px + 20, py - 1 + pulse);
    ctx.lineTo(px + 8, py - 16 + pulse);
    ctx.lineTo(px + 32, py - 16 + pulse);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#29184e";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  function drawTile(x, y, visible) {
    const px = x * TILE, py = y * TILE;
    if (map[y][x]) {
      ctx.fillStyle = (x + y) % 2 ? colors.floorA : colors.floorB;
      ctx.fillRect(px, py, TILE, TILE);
      ctx.fillStyle = "#ffffff22";
      ctx.fillRect(px + 3, py + 3, TILE - 6, 4);
      ctx.strokeStyle = "#512b7255";
      ctx.strokeRect(px + .5, py + .5, TILE - 1, TILE - 1);
      if ((x * 7 + y * 11) % 13 === 0) {
        ctx.fillStyle = "#fff6";
        ctx.beginPath(); ctx.arc(px + 29, py + 13, 3, 0, Math.PI * 2); ctx.fill();
      }
    } else if (dirs.some(([dx, dy]) => tileAt(x + dx, y + dy))) {
      ctx.fillStyle = (x + y) % 2 ? colors.wallA : colors.wallB;
      ctx.fillRect(px, py, TILE, TILE);
      ctx.fillStyle = "#ffffff18";
      ctx.fillRect(px + 4, py + 4, TILE - 8, 6);
      ctx.fillStyle = "#2a174c44";
      ctx.fillRect(px, py + TILE - 7, TILE, 7);
    }
    if (!visible) {
      ctx.fillStyle = "#171135b8";
      ctx.fillRect(px, py, TILE, TILE);
    }
  }

  function drawCat(x, y) {
    const cx = x * TILE + 20, cy = y * TILE + 21;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = "#ed6f51";
    ctx.beginPath(); ctx.moveTo(-12, -9); ctx.lineTo(-8, -20); ctx.lineTo(-2, -11); ctx.lineTo(7, -11); ctx.lineTo(13, -20); ctx.lineTo(14, -6); ctx.arc(1, -4, 15, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = colors.cream;
    ctx.beginPath(); ctx.ellipse(1, 2, 10, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = colors.ink;
    ctx.fillRect(-7, -6, 3, 4); ctx.fillRect(7, -6, 3, 4);
    ctx.strokeStyle = colors.ink; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(1, 0, 4, .2, Math.PI - .2); ctx.stroke();
    ctx.strokeStyle = "#ffe56c"; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(12, -14); ctx.lineTo(19, -23); ctx.stroke();
    ctx.strokeStyle = "#f7f0ff"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(12, 8); ctx.lineTo(21, -4); ctx.stroke();
    ctx.restore();
  }

  function drawEnemy(enemy) {
    const cx = enemy.x * TILE + 20, cy = enemy.y * TILE + 21;
    ctx.save(); ctx.translate(cx, cy);
    if (enemy.type === "pudding") {
      ctx.fillStyle = "#a877f0";
      ctx.beginPath(); ctx.moveTo(-14, 12); ctx.quadraticCurveTo(-16, -13, 0, -15); ctx.quadraticCurveTo(16, -13, 14, 12); ctx.closePath(); ctx.fill();
      ctx.fillStyle = colors.cream; ctx.beginPath(); ctx.arc(0, -3, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = colors.ink; ctx.beginPath(); ctx.arc(1, -3, 2, 0, Math.PI * 2); ctx.fill();
    } else if (enemy.type === "mushroom") {
      ctx.fillStyle = "#f0e8ce"; ctx.fillRect(-5, 0, 10, 14);
      ctx.fillStyle = "#ff6cae"; ctx.beginPath(); ctx.arc(0, 0, 14, Math.PI, 0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#ffe56c"; ctx.beginPath(); ctx.moveTo(-8, -11); ctx.lineTo(-4, -20); ctx.lineTo(0, -12); ctx.lineTo(6, -20); ctx.lineTo(9, -10); ctx.closePath(); ctx.fill();
    } else {
      ctx.fillStyle = "#65dffc";
      ctx.beginPath(); ctx.arc(0, 2, 10, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = 5; ctx.strokeStyle = "#65dffc";
      for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(i * 4, -4); ctx.lineTo(i * 5, -15 - Math.abs(i) * 2); ctx.stroke(); }
    }
    ctx.fillStyle = "#28164c"; ctx.fillRect(-13, 16, 26, 3);
    ctx.fillStyle = "#ff6d79"; ctx.fillRect(-13, 16, 26 * enemy.hp / enemy.maxHp, 3);
    ctx.restore();
  }

  function drawItem(item) {
    const cx = item.x * TILE + 20, cy = item.y * TILE + 20;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(Math.sin(performance.now() / 350 + item.x) * .12);
    if (item.type === "fish") {
      ctx.fillStyle = "#ffe56c"; ctx.beginPath(); ctx.ellipse(0, 0, 11, 7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(-17, -8); ctx.lineTo(-17, 8); ctx.closePath(); ctx.fill();
      ctx.fillStyle = colors.ink; ctx.fillRect(5, -2, 2, 2);
    } else if (item.type === "key") {
      ctx.strokeStyle = "#ffe56c"; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(-3, -4, 6, 0, Math.PI * 2); ctx.moveTo(2, 0); ctx.lineTo(13, 11); ctx.moveTo(8, 6); ctx.lineTo(12, 2); ctx.stroke();
    } else if (item.type === "weapon") {
      ctx.strokeStyle = "#fff7dd"; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(-10, 11); ctx.lineTo(10, -11); ctx.moveTo(5, -10); ctx.lineTo(11, -11); ctx.lineTo(10, -5); ctx.moveTo(-12, 7); ctx.lineTo(-6, 13); ctx.stroke();
    } else {
      ctx.fillStyle = "#65dffc";
      ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(13, -7); ctx.lineTo(10, 8); ctx.lineTo(0, 15); ctx.lineTo(-10, 8); ctx.lineTo(-13, -7); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#ffe56c"; ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function drawExit(x, y, visible) {
    const px = x * TILE, py = y * TILE;
    ctx.save(); ctx.globalAlpha = visible ? 1 : .35;
    ctx.fillStyle = player.hasKey ? "#ffe56c" : "#4b3979";
    ctx.fillRect(px + 6, py + 6, 28, 28);
    ctx.fillStyle = "#28164c";
    for (let i = 0; i < 3; i++) ctx.fillRect(px + 10 + i * 5, py + 11 + i * 5, 16 - i * 5, 3);
    ctx.restore();
  }

  function initAudio() {
    if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === "suspended") audio.resume();
  }

  function playBgmNote(freq, duration = .22) {
    if (muted || !audio || bgmAudio || bgmVolume <= 0) return;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, audio.currentTime);
    gain.gain.setValueAtTime(Math.max(.001, bgmVolume * .045), audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + duration);
    osc.connect(gain).connect(audio.destination);
    osc.start();
    osc.stop(audio.currentTime + duration);
  }

  function startInternalBgm() {
    if (bgmAudio || bgmTimer || muted || state !== "play") return;
    initAudio();
    const melody = [392, 523.25, 659.25, 523.25, 440, 587.33, 698.46, 587.33, 349.23, 440, 523.25, 659.25, 587.33, 523.25, 440, 329.63];
    bgmTimer = setInterval(() => {
      playBgmNote(melody[bgmStep % melody.length]);
      if (bgmStep % 4 === 0) playBgmNote(melody[bgmStep % melody.length] / 2, .42);
      bgmStep++;
    }, 280);
  }

  function stopInternalBgm() {
    clearInterval(bgmTimer);
    bgmTimer = null;
  }

  function startBgm() {
    if (muted || state !== "play") return;
    if (bgmAudio) {
      bgmAudio.volume = bgmVolume;
      bgmAudio.play().catch(() => {});
    } else {
      startInternalBgm();
    }
  }

  function pauseBgm() {
    stopInternalBgm();
    if (bgmAudio) bgmAudio.pause();
  }

  function useDefaultBgm() {
    if (bgmAudio) {
      bgmAudio.pause();
      bgmAudio = null;
    }
    if (bgmObjectUrl) {
      URL.revokeObjectURL(bgmObjectUrl);
      bgmObjectUrl = null;
    }
    ui.bgmFile.value = "";
    ui.bgmFileName.textContent = "内蔵：まかふしぎワルツ";
    bgmStep = 0;
    startBgm();
  }

  function tone(freq, duration, type) {
    if (muted || !audio) return;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = type; osc.frequency.value = freq;
    gain.gain.setValueAtTime(.055, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + duration);
    osc.connect(gain).connect(audio.destination);
    osc.start(); osc.stop(audio.currentTime + duration);
  }

  document.querySelector("#startButton").addEventListener("click", startGame);
  document.querySelector("#retryButton").addEventListener("click", startGame);
  document.querySelector("#resultTitleButton").addEventListener("click", () => returnToTitle(false));
  document.querySelector("#titleButton").addEventListener("click", () => returnToTitle(true));
  document.querySelector("#fishButton").addEventListener("click", eatFish);
  ui.bgmVolume.value = String(Math.round(bgmVolume * 100));
  ui.bgmVolumeLabel.textContent = String(Math.round(bgmVolume * 100));
  ui.bgmSettings.addEventListener("click", () => {
    const willOpen = ui.bgmPanel.classList.contains("hidden");
    ui.bgmPanel.classList.toggle("hidden", !willOpen);
    ui.bgmSettings.setAttribute("aria-expanded", String(willOpen));
  });
  ui.bgmClose.addEventListener("click", () => {
    ui.bgmPanel.classList.add("hidden");
    ui.bgmSettings.setAttribute("aria-expanded", "false");
  });
  ui.bgmVolume.addEventListener("input", () => {
    bgmVolume = Number(ui.bgmVolume.value) / 100;
    ui.bgmVolumeLabel.textContent = ui.bgmVolume.value;
    localStorage.setItem("catCandyBgmVolume", ui.bgmVolume.value);
    if (bgmAudio) bgmAudio.volume = bgmVolume;
  });
  ui.bgmFile.addEventListener("change", () => {
    const file = ui.bgmFile.files?.[0];
    if (!file) return;
    pauseBgm();
    if (bgmObjectUrl) URL.revokeObjectURL(bgmObjectUrl);
    bgmObjectUrl = URL.createObjectURL(file);
    bgmAudio = new Audio(bgmObjectUrl);
    bgmAudio.loop = true;
    bgmAudio.volume = bgmVolume;
    ui.bgmFileName.textContent = file.name;
    initAudio();
    startBgm();
  });
  ui.bgmDefault.addEventListener("click", useDefaultBgm);
  ui.sound.addEventListener("click", () => {
    muted = !muted;
    ui.sound.textContent = muted ? "×" : "♪";
    if (muted) pauseBgm();
    else {
      initAudio();
      startBgm();
    }
  });
  document.querySelectorAll("[data-move]").forEach((button) => button.addEventListener("click", () => {
    const [dx, dy] = button.dataset.move.split(",").map(Number);
    tryMove(dx, dy);
  }));
  document.querySelector("[data-wait]").addEventListener("click", waitTurn);
  window.addEventListener("keydown", (event) => {
    const moves = {
      ArrowUp: [0, -1], w: [0, -1], W: [0, -1],
      ArrowDown: [0, 1], s: [0, 1], S: [0, 1],
      ArrowLeft: [-1, 0], a: [-1, 0], A: [-1, 0],
      ArrowRight: [1, 0], d: [1, 0], D: [1, 0],
    };
    if (moves[event.key]) { event.preventDefault(); tryMove(...moves[event.key]); }
    else if (event.key === "q" || event.key === "Q") eatFish();
    else if (event.key === ".") waitTurn();
    else if (event.key === "Enter" && state !== "play") startGame();
  });

  draw();
})();
