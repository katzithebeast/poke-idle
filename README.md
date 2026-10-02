# Poké Idle – bitevní scéna

Malá idle hra s animovanými pokémony (sprity Black/White z PokeAPI) a ručně kódovanými pixel-art arénami.

## Spuštění
Stačí otevřít `index.html` v prohlížeči (potřebuje internet kvůli spritům a knihovně gifuct-js).

## Soubory
- `index.html` – UI, pokémoni, deník (Pokédex), nastavení, světlo a barvy arén
- `pixel_arenas.js` – všechny arény kreslené kódem (480×270 px) a jejich animace
- `pixel_sprites.js` – pokébally, mince a trenér (pohled zezadu, animace hodu) kreslené kódem
- `pokemon_data.js` – vzácnost (0–4), typy, base staty pokémonů #1–649 a tabulka účinnosti typů (vygenerováno z PokeAPI)
- `shop.js` – mince, obchod, otevírání ballů (ruleta), odhalení výhry a lov s hodem
- `party.js` – tvoji pokémoni jako jedinci (hvězdičky ★, staty, level, XP), tým 6 míst a léčení v čase
- `battle.js` – idle souboj s HP a typy, HP lišty se jmény, divocí pokémoni podle arény, odemykání arén
- `boss.js` – Pán arény: aktivní souboj s načasováním útoku, jeho porážka odemkne další arénu
- `offline.js` – dopočítání soubojů, když hra neběžela (max. 8 h, poloviční odměny) + okno „Zatímco jsi byl pryč“
- `dev.js` – vývojářský režim: samostatné testovací uložení (`pokeIdleDev.*`) a nástroje (mince, levely, evoluce, arény, boss, offline…)
- `evolve.js` – evoluce s animací, předměty v Týmu (Lektvar, Oživení, Rare Candy) a spojování duplikátů na +1 ★

## Obchod a lov (experimentální)
Auto boj → mince → obchod (Poké / Great / Ultra / Master Ball) → otevření ballu jako bedna v CS
→ vylosovaný pokémon čeká v záložce Lovy → lov v jeho aréně: trenér hodí ball, načasuj hod
podle zmenšujícího se kroužku (mezerník / klik) → chycený pokémon se zapíše do deníku.
Zkratky: `O` obchod, `J` deník, mezerník = hod.

## Arény
Sopečný kráter, Bouřkový tesák, zasněžené hory, oceán, poušť, hřbitov, Pavoučí jeskyně,
Netherová bouře, Nebeská říše, Zpustošená země.

## Souboj a postup
Tvůj pokémon z týmu bojuje sám s divokými pokémony aktuální arény. Výhra = mince, XP (30 % i pro zbytek týmu)
a výhra v aréně. Po 15 výhrách tě vyzve **Pán arény** – jeho porážka odemkne další arénu
(Oceán Lv 2–6 → … → Nebeská říše Lv 80–100). Soupeři se přizpůsobí tvému levelu v rozsahu arény.
Když tvůj pokémon omdlí, boj stojí, dokud v Týmu (`T`) nepošleš dalšího. Kdo nebojuje, léčí se v čase.
Deník ukazuje jen pokémony, které opravdu máš (chycené na lovu).

## Evoluce a vylepšení
Když pokémon splní podmínku (level, kámen, Spojovací kabel místo výměny, přátelství = výhry v týmu),
objeví se v Týmu i v deníku tlačítko **Vyvinout**. Animaci jde zrušit klávesou B / Esc.
Duplikát stejného druhu jde v Týmu spojit → +1 ★ (max 5). Obchod → Předměty / Vylepšení
(víc mincí a XP, rychlejší léčení, automatická výměna, Shiny Charm).

## Nastavení
- **UI při nečinnosti**: vždy vidět / ztlumit / skrýt ovládání (životy zůstanou) / skrýt vše.
- **Vývojářský režim**: přepne hru do samostatného testovacího uložení s dev nástroji.
  Normální hra zůstává nedotčená – vypnutím se k ní vrátíš. Dev uložení jde smazat.
