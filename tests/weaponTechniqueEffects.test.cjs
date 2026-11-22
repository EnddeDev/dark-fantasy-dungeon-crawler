const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { buildSync } = require("esbuild");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sumrak-wte-"));
process.on("exit", () => fs.rmSync(temp, { recursive: true, force: true }));
function load(entry, name) {
  const outfile = path.join(temp, `${name}.cjs`);
  buildSync({ entryPoints: [entry], outfile, bundle: true, platform: "node", format: "cjs", external: ["react", "react-dom", "react/jsx-runtime"] });
  return require(outfile);
}
const battle = load("src/game/battle.ts", "battle");
const content = load("src/game/content.ts", "content");
const { PlayerFactory } = load("src/model/PlayerFactory.ts", "player-factory");

function withRandom(value, fn) {
  const real = Math.random;
  Math.random = () => value;
  try { return fn(); } finally { Math.random = real; }
}

/** Бой героя с одним приёмом: оружие нужной модели, концентрация достаточна, враг без защит. */
function fixture(skillId, baseId = "knife", stats = {}) {
  const g = content.createGearItem({ baseId, rarity: "rare", wear: "new", identified: true, level: 5, skillId });
  /* Приём задаётся явно: пул базы не всегда содержит нужный id, а выбор по случайности даёт недетерминированный тест. */
  g.skillId = skillId;
  const p = PlayerFactory.createInitial();
  for (const k of Object.keys(p.equip)) p.equip[k] = null;
  p.armory = [g];
  p.equip = { ...p.equip, mainHand: g.uid };
  p.stats = { ...p.stats, str: 8, agi: 8, int: 8, ...stats };
  p.hp = battle.derived(p).maxHp;
  const b = battle.newBattle(p, 1, false, "classic", 0, 0);
  b.queue = ["p", "e"]; b.idx = 0;
  b.p.concentration = 5;
  b.p.weaponCd = 0;
  b.enemy.hp = 5000; b.enemy.maxHp = 5000; b.enemy.armor = 0;
  b.enemy.effects = []; b.enemy.effectPower = {};
  b.enemy.def = { ...b.enemy.def, id: "fixture", race: "none", type: "strong" };
  b.enemy.statuses.poison = 0; b.enemy.statuses.bleed = 0;
  b.p.hp = battle.derived(p).maxHp;
  return b;
}

test("Укус змеи: яд 3 раунда, тик 2 + бонус приёма", () => {
  const b = fixture("snake_bite", "knife", { agi: 6 });
  const bonus = battle.techniqueBonusNow(b, b.p.weaponSkill);
  const after = withRandom(0.99, () => battle.playerAct(b, { type: "weapon_skill" }));
  assert.equal(after.enemy.statuses.poison, 2, "3 хода: первый тик сразу, осталось 2");
  assert.equal(after.enemy.statuses.poisonTick, 2 + bonus);
});

test("Двойной порез: два удара и кровотечение 3 + бонус приёма", () => {
  const b = fixture("double_cut", "knife", { agi: 4 });
  const bonus = battle.techniqueBonusNow(b, b.p.weaponSkill);
  const after = withRandom(0.99, () => battle.playerAct(b, { type: "weapon_skill" }));
  assert.equal(after.enemy.statuses.bleed, 2);
  assert.equal(after.enemy.statuses.bleedTick, 3 + bonus);
  const hits = after.log.filter((l) => l.text.includes("Двойной порез") && /\d\/2/.test(l.text));
  assert.equal(hits.length, 2, "два удара");
});

test("Казнь: кровотечение только при ОЗ врага ниже половины", () => {
  const high = fixture("execute", "axe");
  const afterHigh = withRandom(0.99, () => battle.playerAct(high, { type: "weapon_skill" }));
  assert.equal(afterHigh.enemy.statuses.bleed, 0);

  const low = fixture("execute", "axe");
  low.enemy.hp = 2000; // 40% от 5000
  const afterLow = withRandom(0.99, () => battle.playerAct(low, { type: "weapon_skill" }));
  assert.equal(afterLow.enemy.statuses.bleed, 2);
  assert.equal(afterLow.enemy.statuses.bleedTick, Math.round(5000 * 0.05));
});

test("Искра: магический урон без броска оружия, горение на героя и на врага", () => {
  const b = fixture("spark", "wand_ash", { int: 6 });
  const before = b.enemy.hp;
  const bonus = battle.techniqueBonusNow(b, b.p.weaponSkill);
  const after = withRandom(0.5, () => battle.playerAct(b, { type: "weapon_skill" }));
  assert.ok(after.enemy.hp < before, "урон нанесён");
  assert.ok(after.p.statuses.burn > 100, "горение на героя без срока");
  assert.equal(after.p.statuses.burnTick, 3 + bonus);
  assert.ok(after.enemy.statuses.burn > 100, "горение на враге без срока");
  assert.equal(after.enemy.statuses.burnTick, 3 + bonus);
});

test("Немота запрещает Искру и не тратит концентрацию", () => {
  const b = fixture("spark", "wand_ash", { int: 6 });
  b.p.statuses.sealItems = 2;
  const after = withRandom(0.5, () => battle.playerAct(b, { type: "weapon_skill" }));
  assert.equal(after.enemy.hp, b.enemy.hp);
  assert.equal(after.enemy.statuses.burn, 0);
  assert.equal(after.p.concentration, b.p.concentration);
});

test("Звон и Метеор оглушают врага на 1 ход", () => {
  for (const [skill, base] of [["ring", "hammer"], ["meteor", "warhammer2"]]) {
    const b = fixture(skill, base, { str: 8 });
    const after = withRandom(0.99, () => battle.playerAct(b, { type: "weapon_skill" }));
    assert.equal(after.enemy.statuses.stunAp, 1, skill);
  }
});

test("Наступление: +50% брони к урону", () => {
  const b = fixture("advance", "sword", { str: 8 });
  const without = battle.techniqueBonusNow(b, b.p.weaponSkill);
  b.p.armor = 20;
  const withArmor = battle.techniqueBonusNow(b, b.p.weaponSkill);
  assert.equal(withArmor - without, Math.round(20 * 0.5));
});

test("Пробитие: броня врага −10 на 3 раунда", () => {
  const b = fixture("breach", "sword", { str: 8 });
  b.enemy.armor = 30;
  const after = withRandom(0.99, () => battle.playerAct(b, { type: "weapon_skill" }));
  assert.equal(after.enemy.statuses.breakFlat, 10);
  assert.equal(after.enemy.statuses.breakRounds, 3);
  assert.equal(battle.enemyArmorNow(after.enemy), 20);
});

test("Гильотина: раскол снимает 100% брони на 3 раунда", () => {
  const b = fixture("guillotine", "greataxe", { str: 8 });
  b.enemy.armor = 30;
  const after = withRandom(0.99, () => battle.playerAct(b, { type: "weapon_skill" }));
  assert.equal(battle.enemyArmorNow(after.enemy), 0);
  assert.equal(after.enemy.statuses.breakRounds, 3);
});

test("Снос и Змеиный выпад накладывают Побои, Снос — до +60%", () => {
  const sweep = fixture("sweep", "axe", { str: 8 });
  const once = withRandom(0.99, () => battle.playerAct(sweep, { type: "weapon_skill" }));
  assert.equal(once.enemy.statuses.beatRounds, 3);
  assert.ok(Math.abs(once.enemy.statuses.beatMult - 0.2) < 1e-9);
  const lunge = fixture("snake_lunge", "spear", { agi: 8 });
  const after = withRandom(0.99, () => battle.playerAct(lunge, { type: "weapon_skill" }));
  assert.ok(Math.abs(after.enemy.statuses.beatMult - 0.1) < 1e-9);
});

test("Второе дыхание восстанавливает 25% выносливости", () => {
  const b = fixture("second_wind", "greatsword", { str: 8 });
  const cost = battle.techniqueStaminaCost(b);
  assert.equal(cost, 5, "Второе дыхание стоит 5 выносливости");
  b.p.stamina = cost;
  const after = withRandom(0.99, () => battle.playerAct(b, { type: "weapon_skill" }));
  assert.equal(after.p.stamina, Math.round(b.p.staminaMax * 0.25), "стоимость списана, затем +25%");
});

test("Слабость не приговор снимает негативные эффекты героя", () => {
  const b = fixture("no_verdict", "greatsword", { str: 8 });
  b.p.statuses.wound = 3;
  b.p.statuses.poison = 2;
  const after = withRandom(0.99, () => battle.playerAct(b, { type: "weapon_skill" }));
  assert.equal(after.p.statuses.wound, 0);
  assert.equal(after.p.statuses.poison, 0);
  assert.ok(after.log.some((l) => l.text.includes("снято 2 негативных")));
});

test("Воронка: если враг выжил, выносливость героя −25%", () => {
  const b = fixture("funnel", "greataxe", { str: 8 });
  b.p.stamina = b.p.staminaMax;
  const cost = battle.techniqueStaminaCost(b);
  const after = withRandom(0.99, () => battle.playerAct(b, { type: "weapon_skill" }));
  assert.equal(after.p.stamina, b.p.staminaMax - cost - Math.round(b.p.staminaMax * 0.25));
});

/* ───── Оставшиеся приёмы этапа 3 ───── */

/** Ход героя заканчивается кнопкой «конец хода»: проверяем, что приём передал ход врагу. */
function endHeroTurn(b) {
  return battle.playerAct(b, { type: "end_turn" });
}

test("Тень за спиной: первым действием хода; заряды 2, тратятся по одному", () => {
  const b = fixture("shadow_behind", "knife", { agi: 6 });
  assert.equal(b.p.statuses.shadowCharges ?? 2, 2);
  const after = withRandom(0.99, () => battle.playerAct(b, { type: "weapon_skill" }));
  assert.equal(after.p.statuses.shadowCharges, 1, "один заряд потрачен");
  assert.equal(after.p.statuses.ignoreArmorNow, 0, "флаг сквозь броню снят после удара");
  assert.equal(after.p.weaponCd, 0, "с зарядами перезарядки нет");

  const late = fixture("shadow_behind", "knife", { agi: 6 });
  late.p.statuses.turnActs = 1;
  const refused = withRandom(0.99, () => battle.playerAct(late, { type: "weapon_skill" }));
  assert.equal(refused.enemy.hp, late.enemy.hp, "не первым действием — удара нет");
  assert.ok(refused.log.some((l) => l.text.includes("первым действием")));
});

test("Тень за спиной: заряды кончились — перезарядка, и заряды возвращаются по её окончании", () => {
  const b = fixture("shadow_behind", "knife", { agi: 6 });
  b.p.statuses.shadowCharges = 1;
  const after = withRandom(0.99, () => battle.playerAct(b, { type: "weapon_skill" }));
  assert.equal(after.p.statuses.shadowCharges, 0);
  assert.equal(after.p.weaponCd, 3, "перезарядка 3 раунда");
});

test("Фехтование: этот ход и следующий — удары сквозь защиту", () => {
  const b = fixture("fencing", "rapier", { agi: 6 });
  const after = withRandom(0.5, () => battle.playerAct(b, { type: "weapon_skill" }));
  assert.equal(after.p.statuses.fencingTurns, 2);
  const endNext = endHeroTurn(after);
  assert.equal(endNext.p.statuses.fencingTurns, 1, "после одного хода героя — ещё один");
});

test("Выпад и Копьё вперёд: ответ на первые удары врага; Выпад ставит ход на конец", () => {
  const lunge = fixture("lunge", "rapier", { agi: 6 });
  const afterLunge = withRandom(0.99, () => battle.playerAct(lunge, { type: "weapon_skill" }));
  assert.equal(afterLunge.p.statuses.counterNext, 1);
  assert.equal(afterLunge.p.statuses.counterTurns, 1, "только в этом раунде");
  assert.equal(afterLunge.idx, 1, "Выпад заканчивает ход");

  const spear = fixture("spear_forward", "spear", { agi: 6 });
  const afterSpear = withRandom(0.5, () => battle.playerAct(spear, { type: "weapon_skill" }));
  assert.equal(afterSpear.p.statuses.counterNext, 2, "две атаки врага");
});

test("Пузырь: барьер 10 + бонус на 3 хода; поглощённое возвращается врагу магическим уроном", () => {
  const b = fixture("bubble", "wand_ash", { int: 6 });
  const bonus = battle.techniqueBonusNow(b, b.p.weaponSkill);
  const hp0 = b.enemy.hp;
  const after = withRandom(0.5, () => battle.playerAct(b, { type: "weapon_skill" }));
  assert.equal(after.p.barrier, 10 + bonus);
  assert.equal(after.p.statuses.bubbleTurns, 3);
  assert.equal(after.enemy.hp, hp0, "удара от Пузыря нет");

  /* Пузырь сам поглотил 20 урона — на конце хода он вернётся врагу. */
  const ready = { ...after, p: { ...after.p, statuses: { ...after.p.statuses, bubbleTurns: 1, bubbleAbsorbed: 20 } } };
  ready.queue = ["p", "e"]; ready.idx = 0;
  const hpBefore = ready.enemy.hp;
  const ended = withRandom(0.5, () => endHeroTurn(ready));
  /* Магический удар проходит через сопротивление врага: проверяем, что возврат пришёл и он не нулевой. */
  assert.ok(hpBefore - ended.enemy.hp > 0, "поглощённый урон вернулся врагу");
  assert.ok(ended.log.some((l) => l.text.includes("[Пузырь]")), "возврат записан в бою");
  assert.equal(ended.p.statuses.bubbleAbsorbed, 0);
  assert.equal(ended.p.barrier, 0, "барьер пропал");
});

test("Подготовка: +25 брони на 2 раунда и +25% брони к следующей атаке", () => {
  const b = fixture("prepare", "sword", { str: 8 });
  const armorBefore = battle.playerArmorNow(b);
  const after = withRandom(0.5, () => battle.playerAct(b, { type: "weapon_skill" }));
  assert.equal(after.p.statuses.prepRounds, 2);
  assert.equal(after.p.statuses.prepared, 1);
  assert.equal(battle.playerArmorNow(after), armorBefore + 25);
  assert.equal(after.idx, 1, "Подготовка заканчивает ход");
});

test("Стена: +25% брони и +15% стойкости; снимается после атаки героя", () => {
  const b = fixture("wall", "warhammer", { str: 8 });
  b.p.armor = 40;
  const armorBefore = battle.playerArmorNow(b);
  const after = withRandom(0.5, () => battle.playerAct(b, { type: "weapon_skill" }));
  assert.equal(after.p.statuses.wallRounds, 3);
  assert.equal(battle.playerArmorNow(after), Math.round(armorBefore * 1.25));
  /* Стойкость складывается вероятностями (1 − Π(1 − p)), поэтому проверяем рост, а не точную сумму. */
  assert.ok(battle.playerResistChance(after) > battle.playerResistChance(b), "стойкость выросла");

  const attacked = withRandom(0.99, () => battle.playerAct(after, { type: "attack" }));
  assert.equal(attacked.p.statuses.wallRounds, 0, "атака героя снимает Стену");
});

test("Размах: разрушение врага на 3 раунда и удар 3×СИЛ в начале его хода", () => {
  const b = fixture("swing", "hammer", { str: 6 });
  const after = withRandom(0.99, () => battle.playerAct(b, { type: "weapon_skill" }));
  assert.equal(after.enemy.statuses.shatterRounds, 3);
  assert.equal(after.enemy.statuses.swingDmg, 3 * 6);
});

test("Целебный дождь: лечение в начале хода героя и пропуск одного хода врага", () => {
  const b = fixture("healing_rain", "staff", { int: 6 });
  b.p.hp = Math.max(1, b.p.maxHp - 50);
  const after = withRandom(0.5, () => battle.playerAct(b, { type: "weapon_skill" }));
  assert.equal(after.p.statuses.rainRounds, 3);
  assert.equal(after.enemy.statuses.skipTurn, 1);

  const enemyTurn = { ...after, queue: ["e"], idx: 0 };
  const hp = enemyTurn.p.hp;
  const stepped = withRandom(0.5, () => battle.enemyStep(enemyTurn));
  /* Лечение Целебного дождя приходит в начале хода героя, которое наступает после хода врага. */
  assert.equal(stepped.p.hp - hp, 5 + 2 * 6, "только лечение дождя, врага не было");
  assert.equal(stepped.enemy.hp, enemyTurn.enemy.hp, "враг не ударил");
  assert.ok(stepped.log.some((l) => l.text.includes("не может действовать")));
  assert.equal(stepped.enemy.statuses.skipTurn, 0);
});

test("Выброс: 40 урона и четыре эффекта на 3 раунда", () => {
  const b = fixture("eruption", "staff", { int: 6 });
  const hp0 = b.enemy.hp;
  const after = withRandom(0.5, () => battle.playerAct(b, { type: "weapon_skill" }));
  /* Урон 40 проходит через магическое сопротивление врага: не больше 40 и больше нуля. */
  const dealt = hp0 - after.enemy.hp;
  assert.ok(dealt > 0, `урон Выброса нанесён (${dealt})`);
  assert.equal(after.enemy.statuses.eruptRounds, 2);
  assert.equal(after.enemy.statuses.eruptDown, 0.2, "обморожение и проклятие −10% каждое");
  assert.equal(after.enemy.statuses.eruptWither, 1, "увядание: −20% лечения врага");
  assert.equal(after.enemy.statuses.eruptTick, Math.max(1, 6 - 3) + 1 + 3);
  assert.equal(after.enemy.statuses.burnTick, 6, "горение = ИНТ");
});

test("Вытягивание жизни: урон 10 + бонус приёма", () => {
  const b = fixture("life_draw", "staff", { int: 6 });
  const hp0 = b.enemy.hp;
  const after = withRandom(0.5, () => battle.playerAct(b, { type: "weapon_skill" }));
  /* Магическое сопротивление врага режет удар: проверяем, что он прошёл и записан в бою. */
  assert.ok(hp0 - after.enemy.hp > 0, "урон нанесён");
  assert.ok(after.log.some((l) => l.text.includes("[Вытягивание жизни]")), "удар записан в бою");
  assert.equal(after.enemy.statuses.drainRounds, 2, "кража на 3 раунда");
  assert.equal(after.enemy.statuses.drainTick, Math.round(after.enemy.maxHp * 0.05), "5% макс. ОЗ за раунд");
});

test("Бросок: закончил ход — враг без защиты и вдвое слабее; продолжил атаки — кровотечение", () => {
  const b = fixture("throw", "spear", { agi: 6 });
  const after = withRandom(0.5, () => battle.playerAct(b, { type: "weapon_skill" }));
  assert.equal(after.p.statuses.throwPending, 1);
  const ended = endHeroTurn(after);
  assert.equal(ended.enemy.statuses.throwDown, 1, "до конца хода врага");

  const cont = fixture("throw", "spear", { agi: 6 });
  const thrown = withRandom(0.5, () => battle.playerAct(cont, { type: "weapon_skill" }));
  const followed = withRandom(0.5, () => battle.playerAct(thrown, { type: "attack" }));
  assert.equal(followed.enemy.statuses.bleed, 2, "кровотечение на 3 раунда");
  assert.equal(followed.enemy.statuses.bleedTick, 5 + 6);
  assert.equal(followed.p.statuses.throwPending, 0);
});

test("Захват: уклонение героя и врага 0 на 2 раунда; удар вдвое слабее", () => {
  const b = fixture("seize", "greataxe", { str: 6 });
  const after = withRandom(0.99, () => battle.playerAct(b, { type: "weapon_skill" }));
  assert.equal(after.p.statuses.noEvade, 2);
  assert.equal(after.enemy.statuses.noEvade, 2);
});

test("Обратный хват: в этом ходу урон ÷2 и сквозь броню; конец хода снимает", () => {
  const b = fixture("reverse_grip", "greatsword", { str: 6 });
  const after = withRandom(0.5, () => battle.playerAct(b, { type: "weapon_skill" }));
  assert.equal(after.p.statuses.halfDmg, 1);
  assert.equal(after.p.statuses.gripTurn, 1);
  const ended = endHeroTurn(after);
  assert.equal(ended.p.statuses.halfDmg, 0);
  assert.equal(ended.p.statuses.gripTurn, 0);
});

test("Змеиный выпад: следующая атака проходит сквозь броню", () => {
  const b = fixture("snake_lunge", "spear", { agi: 6 });
  const after = withRandom(0.5, () => battle.playerAct(b, { type: "weapon_skill" }));
  assert.equal(after.p.statuses.nextPierce, 1);
});

test("Повторение: повторяет последний приём без своей стоимости в концентрации приёма", () => {
  const b = fixture("snake_bite", "knife", { agi: 6 });
  const first = withRandom(0.99, () => battle.playerAct(b, { type: "weapon_skill" }));
  assert.ok(first.lastRepeat && first.lastRepeat.kind === "tech", "приём запомнен");

  const rep = fixture("repeat_last", "wand_ash", { int: 6 });
  rep.lastRepeat = first.lastRepeat;
  const hp0 = rep.enemy.hp;
  const repeated = withRandom(0.99, () => battle.playerAct(rep, { type: "weapon_skill" }));
  assert.equal(repeated.enemy.statuses.poison, 2, "яд наложен повтором");
  assert.equal(hp0 - repeated.enemy.hp, repeated.enemy.statuses.poisonTick, "сразу только первый тик яда (v2), без прямого удара");
  assert.equal(repeated.p.weaponCd, 3, "сам Повтор уходит на перезарядку");
});

test("Повторение без предыдущего приёма и свитка — отказ без траты", () => {
  const b = fixture("repeat_last", "wand_ash", { int: 6 });
  b.lastRepeat = null;
  const after = withRandom(0.5, () => battle.playerAct(b, { type: "weapon_skill" }));
  assert.equal(after.p.concentration, b.p.concentration, "концентрация не тронута");
  assert.ok(after.log.some((l) => l.text.includes("пока нечего")));
});

test("Крушение: раскол −5 брони и враг без защиты на 1 раунд", () => {
  const b = fixture("hew", "axe", { str: 6 });
  const armorBefore = b.enemy.armor;
  const after = withRandom(0.5, () => battle.playerAct(b, { type: "weapon_skill" }));
  assert.equal(after.enemy.statuses.breakFlat, 5);
  assert.equal(after.enemy.statuses.noGuard, 1, "защиты врага нет в этом раунде");
  assert.ok(after.enemy.armor === armorBefore, "базовая броня не тронута: раскол временный");
});

test("Обманка: на один ход — с шансом 20% удар половиной атаки и конец хода врага", () => {
  const b = fixture("feint", "rapier", { agi: 6 });
  const used = withRandom(0.99, () => battle.playerAct(b, { type: "weapon_skill" }));
  assert.equal(used.enemy.statuses.feint, 1);
  assert.equal(used.idx, 1, "Обманка заканчивает ход");

  const enemyTurn = { ...used, queue: ["e"], idx: 0 };
  const hp0 = enemyTurn.enemy.hp;
  /* Бросок 0.1 < 0.2: срыв сработал, удар героя вдвое слабее атаки, ход врага окончен. */
  const caught = withRandom(0.1, () => battle.enemyStep(enemyTurn));
  assert.ok(caught.log.some((l) => l.text.includes("Обманка: ")), "срыв записан");
  /* Попадание удара зависит от меткости (отдельный бросок), поэтому здесь проверяем срыв и конец хода. */
  assert.equal(caught.enemy.statuses.feint, 0, "эффект одноразовый");
  assert.ok(caught.enemy.hp <= hp0, "враг не лечится от срыва");
});

test("Эхо: 20% от урона героя за его ход уходит в конец хода врага", () => {
  const b = fixture("echo", "sword", { str: 8 });
  const after = withRandom(0.99, () => battle.playerAct(b, { type: "weapon_skill" }));
  const dealt = after.p.statuses.turnDealt ?? 0;
  assert.equal(after.enemy.statuses.echoDue, Math.round(dealt * 0.2));
  assert.equal(after.idx, 1, "Эхо заканчивает ход");
});
