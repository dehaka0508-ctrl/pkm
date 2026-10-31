// One-time seed for src/data/trainers.json (the user's 9 regions x 20 trainers).
// After this, edit data/trainers.xlsx and run `npm run trainers:import`, or edit the JSON.
//
// Line format inside a trainer block:
//   Species [@ Item] [| move1, move2, move3, move4] [* TeraType]
// Only what is known with confidence is written. Missing slots/moves stay empty (null),
// and the game shows them as "임시" (placeholder) until filled.
import fs from "node:fs";

const SRC = String.raw`
@kanto 관동
챔피언|그린|blue|1세대 레드·그린 챔피언전 (주인공이 파이리를 고른 경우)
  Pidgeot
  Alakazam
  Rhydon
  Arcanine
  Exeggutor
  Blastoise
사천왕|칸나|lorelei|1세대 레드·그린 사천왕전
  Dewgong
  Cloyster
  Slowbro
  Jynx
  Lapras
사천왕|시바|bruno|1세대 레드·그린 사천왕전
  Onix
  Hitmonchan
  Hitmonlee
  Onix
  Machamp
사천왕|국화|agatha|1세대 레드·그린 사천왕전
  Gengar
  Golbat
  Haunter
  Arbok
  Gengar
관장|웅|brock|금·은·크리스탈 체육관전
  Graveler
  Rhyhorn
  Omastar
  Onix
  Kabutops
관장|이슬|misty|금·은·크리스탈 체육관전
  Golduck
  Quagsire
  Lapras
  Starmie
관장|마티스|lt_surge|금·은·크리스탈 체육관전
  Raichu
  Electrode
  Magneton
  Electrode
  Electabuzz
관장|민화|erika|금·은·크리스탈 체육관전
  Tangela
  Jumpluff
  Victreebel
  Bellossom
관장|도희|janine|금·은·크리스탈 체육관전
  Crobat
  Weezing
  Weezing
  Ariados
  Venomoth
관장|초련|sabrina|금·은·크리스탈 체육관전
  Espeon
  Mr. Mime
  Alakazam
관장|강연|blaine|금·은·크리스탈 체육관전
  Magcargo
  Magmar
  Rapidash
관장|비주기|giovanni|1세대 레드·그린 체육관전
  Rhyhorn
  Dugtrio
  Nidoqueen
  Nidoking
  Rhydon
보스|아폴로|archer|하트골드·소울실버 라디오탑
  Houndour
  Koffing
  Houndoom
보스|로사&로이|rocket_grunt_f|레츠고 피카츄·이브이
  Arbok
  Weezing
박사|오박사|scientist_m|
주인공|레드|red|하트골드·소울실버 은빛산
  Pikachu @ Light Ball | Volt Tackle, Iron Tail, Quick Attack, Thunderbolt
  Espeon
  Snorlax
  Venusaur
  Charizard
  Blastoise
라이벌|진우|rival_m|
트레이너|반바지 꼬마|youngster_m|
트레이너|등산가|hiker|
트레이너|엘리트 트레이너|ace_trainer_m|

@johto 성도
챔피언|목호|lance|금·은·크리스탈 챔피언전
  Gyarados
  Dragonite
  Dragonite
  Aerodactyl
  Charizard
  Dragonite
사천왕|일목|will|금·은·크리스탈 사천왕전
  Xatu
  Jynx
  Exeggutor
  Slowbro
  Xatu
사천왕|카렌|karen|금·은·크리스탈 사천왕전
  Umbreon
  Vileplume
  Gengar
  Murkrow
  Houndoom
사천왕|독수|koga|금·은·크리스탈 사천왕전
  Ariados
  Venomoth
  Forretress
  Muk
  Crobat
관장|비상|falkner|금·은·크리스탈 체육관전
  Pidgey
  Pidgeotto
관장|호일|bugsy|금·은·크리스탈 체육관전
  Metapod
  Kakuna
  Scyther
관장|꼭두|whitney|금·은·크리스탈 체육관전
  Clefairy
  Miltank
관장|유빈|morty|금·은·크리스탈 체육관전
  Gastly
  Haunter
  Gengar
  Haunter
관장|사도|chuck|금·은·크리스탈 체육관전
  Primeape
  Poliwrath
관장|규리|jasmine|금·은·크리스탈 체육관전
  Magnemite
  Magnemite
  Steelix
관장|류옹|pryce|금·은·크리스탈 체육관전
  Seel
  Dewgong
  Piloswine
관장|이향|clair|금·은·크리스탈 체육관전
  Dragonair
  Dragonair
  Dragonair
  Kingdra
박사|공박사|scientist_m|
주인공|심향|player_m|
주인공|금선|player_f|
라이벌|실버|rival_m|하트골드·소울실버 재대결
  Weavile
  Crobat
  Magnezone
  Gengar
  Alakazam
기타|전통무용수|dancer|하트골드·소울실버 춤 연습장 (5명 합산)
  Espeon
  Umbreon
  Vaporeon
  Jolteon
  Flareon
기타|장로|unknown_m|금·은·크리스탈 모다피의탑
  Bellsprout
  Bellsprout
  Hoothoot
트레이너|초능력자|psychic_m|
트레이너|비키니 아가씨|swimmer_f|

@hoenn 호연
챔피언|성호|steven|루비·사파이어 챔피언전
  Skarmory
  Claydol
  Aggron
  Cradily
  Armaldo
  Metagross
사천왕|혁진|sidney|루비·사파이어·에메랄드 사천왕전
  Mightyena
  Shiftry
  Cacturne
  Crawdaunt
  Absol
사천왕|회연|phoebe|루비·사파이어·에메랄드 사천왕전
  Dusclops
  Banette
  Sableye
  Banette
  Dusclops
사천왕|미혜|glacia|루비·사파이어·에메랄드 사천왕전
  Sealeo
  Glalie
  Sealeo
  Glalie
  Walrein
사천왕|권수|drake|루비·사파이어 사천왕전
  Shelgon
  Altaria
  Kingdra
  Flygon
  Salamence
관장|원규|roxanne|에메랄드 체육관전
  Geodude
  Geodude
  Nosepass
관장|철구|brawly|에메랄드 체육관전
  Machop
  Meditite
  Makuhita
관장|암페어|wattson|에메랄드 체육관전
  Voltorb
  Electrike
  Magneton
  Manectric
관장|민지|flannery|에메랄드 체육관전
  Numel
  Slugma
  Camerupt
  Torkoal
관장|종길|norman|에메랄드 체육관전
  Spinda
  Vigoroth
  Linoone
  Slaking
관장|은송|winona|에메랄드 체육관전
  Swablu
  Tropius
  Pelipper
  Skarmory
  Altaria
관장|풍&란|tate|에메랄드 체육관전 (더블배틀)
  Claydol
  Xatu
  Lunatone
  Solrock
관장|윤진|wallace|루비·사파이어 체육관전
  Luvdisc
  Whiscash
  Sealeo
  Seaking
  Milotic
관장|아단|juan|에메랄드 체육관전
  Luvdisc
  Whiscash
  Sealeo
  Crawdaunt
  Kingdra
보스|마적|maxie|에메랄드
  Mightyena
  Crobat
  Camerupt
보스|아강|archie|에메랄드
  Mightyena
  Crobat
  Sharpedo
박사|털보박사|scientist_m|
주인공|휘웅|player_m|
주인공|봄이|player_f|
라이벌|민진|rival_m|에메랄드 챔피언로드
  Altaria
  Delcatty
  Roselia
  Magneton
  Gardevoir

@sinnoh 신오
챔피언|난천|cynthia|Pt 챔피언전
  Spiritomb | Dark Pulse, Psychic, Silver Wind, Shadow Ball
  Roserade
  Togekiss | Air Slash, Aura Sphere, Water Pulse, Shock Wave
  Lucario | Aura Sphere, Dragon Pulse, Psychic, Earthquake
  Milotic | Surf, Ice Beam, Mirror Coat, Aqua Ring
  Garchomp | Dragon Rush, Earthquake, Brick Break, Giga Impact
사천왕|충호|aaron|Pt 사천왕전
  Dustox
  Beautifly
  Vespiquen
  Heracross
  Drapion
사천왕|들국화|bertha|Pt 사천왕전
  Whiscash
  Gliscor
  Hippowdon
  Golem
  Rhyperior
사천왕|대엽|flint|Pt 사천왕전
  Houndoom
  Flareon
  Rapidash
  Infernape
  Magmortar
사천왕|오엽|lucian|Pt 사천왕전
  Mr. Mime
  Espeon
  Bronzong
  Alakazam
  Gallade
관장|강석|roark|Pt 체육관전
  Geodude
  Onix
  Cranidos
관장|유채|gardenia|Pt 체육관전
  Cherubi
  Turtwig
  Roserade
관장|자두|maylene|Pt 체육관전
  Meditite
  Machoke
  Lucario
관장|맥실러|crasher_wake|Pt 체육관전
  Gyarados
  Quagsire
  Floatzel
관장|멜리사|fantina|Pt 체육관전
  Duskull
  Haunter
  Mismagius
관장|동관|byron|Pt 체육관전
  Magneton
  Steelix
  Bastiodon
관장|무청|candice|Pt 체육관전
  Sneasel
  Piloswine
  Abomasnow
  Froslass
관장|전진|volkner|Pt 체육관전
  Jolteon
  Raichu
  Luxray
  Electivire
보스|태홍|cyrus|Pt 깨어진 세계
  Houndoom
  Honchkrow
  Crobat
  Gyarados
  Weavile
박사|마박사|scientist_m|
주인공|광휘|player_m_2|
주인공|빛나|player_f_2|
라이벌|용식|rival_m|Pt 포켓몬리그 앞 (나머지는 스타팅에 따라 다름)
  Staraptor
  Heracross
  Snorlax
트레이너|베테랑 트레이너|veteran_m|
트레이너|포켓몬 레인저|ranger_m|

@unova 하나
챔피언|노간주|alder|블랙·화이트 챔피언전
  Accelgor
  Bouffalant
  Druddigon
  Vanilluxe
  Escavalier
  Volcarona
챔피언|아이리스|iris|블랙2·화이트2 챔피언전
  Hydreigon
  Druddigon
  Aggron
  Archeops
  Lapras
  Haxorus
사천왕|망초|shauntal|블랙·화이트 사천왕전
  Cofagrigus
  Jellicent
  Golurk
  Chandelure
사천왕|블래리|grimsley|블랙·화이트 사천왕전
  Scrafty
  Liepard
  Krookodile
  Bisharp
사천왕|카를레야|caitlin|블랙2·화이트2 사천왕전
  Musharna
  Sigilyph
  Reuniclus
  Gothitelle
  Metagross
사천왕|연무|marshal|블랙·화이트 사천왕전
  Throh
  Sawk
  Mienshao
  Conkeldurr
관장|체렌|cheren|블랙2·화이트2 체육관전
  Patrat
  Lillipup
관장|알로에|lenora|블랙·화이트 체육관전
  Herdier
  Watchog
관장|아티|burgh|블랙·화이트 체육관전
  Whirlipede
  Dwebble
  Leavanny
관장|카밀레|elesa|블랙·화이트 체육관전
  Emolga
  Emolga
  Zebstrika
관장|야콘|clay|블랙·화이트 체육관전
  Krokorok
  Palpitoad
  Excadrill
관장|풍란|skyla|블랙·화이트 체육관전
  Swoobat
  Unfezant
  Swanna
관장|담죽|brycen|블랙·화이트 체육관전
  Vanillish
  Cryogonal
  Beartic
관장|사간|drayden|블랙·화이트 체육관전
  Fraxure
  Druddigon
  Haxorus
관장|시즈|marlon|블랙2·화이트2 체육관전
  Carracosta
  Wailord
  Jellicent
관장|보미카|roxie|블랙2·화이트2 체육관전
  Koffing
  Whirlipede
보스|N|plasma_grunt_m|블랙·화이트 N의 성 (블랙 기준)
  Zekrom
  Carracosta
  Vanilluxe
  Archeops
  Zoroark
  Klinklang
보스|게치스|ghetsis|블랙2·화이트2 플라스마 프리깃
  Cofagrigus
  Seismitoad
  Eelektross
  Drapion
  Toxicroak
  Hydreigon
박사|주박사|scientist_f|
주인공|명희|player_f_alternate|

@kalos 칼로스
챔피언|카르네|diantha|X·Y 챔피언전
  Hawlucha
  Tyrantrum
  Aurorus
  Gourgeist
  Goodra
  Gardevoir @ Gardevoirite
사천왕|간피|wikstrom|X·Y 사천왕전
  Klefki
  Probopass
  Scizor
  Aegislash
사천왕|파키라|malva|X·Y 사천왕전
  Pyroar
  Torkoal
  Chandelure
  Talonflame
사천왕|즈미|siebold|X·Y 사천왕전
  Clawitzer
  Gyarados
  Starmie
  Barbaracle
사천왕|드라세나|drasna|X·Y 사천왕전
  Dragalge
  Druddigon
  Altaria
  Noivern
관장|비올라|viola|X·Y 체육관전
  Surskit
  Vivillon
관장|자크로|grant|X·Y 체육관전
  Amaura
  Tyrunt
관장|코르니|korrina|X·Y 체육관전
  Mienfoo
  Machoke
  Hawlucha
관장|후쿠지|ramos|X·Y 체육관전
  Jumpluff
  Weepinbell
  Gogoat
관장|시트론|clemont|X·Y 체육관전
  Emolga
  Magneton
  Heliolisk
관장|마슈|valerie|X·Y 체육관전
  Mawile
  Mr. Mime
  Sylveon
관장|고지카|olympia|X·Y 체육관전
  Sigilyph
  Slowking
  Meowstic
관장|우르프|wulfric|X·Y 체육관전
  Abomasnow
  Cryogonal
  Avalugg
보스|플라드리|lysandre|X·Y 플라드리 연구소
  Mienshao
  Honchkrow
  Pyroar
  Gyarados @ Gyaradosite
박사|플라타느박사|scientist_m|X·Y 엔딩 후 (스타팅 3종)
  Venusaur
  Charizard
  Blastoise
주인공|칼름|player_m_alternate|
주인공|세레나|player_f_alternate|
라이벌|사나|rival_f|
기타|AZ|veteran_m|X·Y 엔딩 후
  Torkoal
  Golurk
  Sigilyph
트레이너|오컬트마니아|hex_maniac|

@alola 알로라
챔피언|글라디오|skull_grunt_m|썬·문 (일부만)
  Silvally
  Crobat
  Lucario
  Zoroark
사천왕|할라|hala|썬·문 사천왕전
  Hariyama
  Primeape
  Bewear
  Poliwrath
  Crabominable @ Fightinium Z
사천왕|라이치|olivia|썬·문 사천왕전
  Relicanth
  Carbink
  Golem-Alola
  Probopass
  Lycanroc-Midnight @ Rockium Z
사천왕|카일리|kahili|썬·문 사천왕전
  Skarmory
  Crobat
  Oricorio
  Mandibuzz
  Toucannon @ Flyinium Z
사천왕|멀레인|molayne|울트라썬·울트라문 사천왕전
  Klefki
  Bisharp
  Magnezone
  Metagross
  Dugtrio-Alola
관장|일리마|school_kid_m|
관장|수련|swimmer_f|
관장|마오|baker|
관장|마마네|scientist_m|
관장|키아웨|firebreather|
관장|아세로라|acerola|썬·문 사천왕전
  Sableye
  Drifblim
  Dhelmise
  Froslass
  Palossand @ Ghostium Z
관장|말리화|artist|울트라썬·울트라문 엔딩 후
  Klefki
  Granbull
  Shiinotic
  Wigglytuff
  Ribombee
관장|나누|officer|썬·문 대시련
  Sableye
  Krokorok
  Persian-Alola
관장|하푸우|worker_f|썬·문 대시련
  Dugtrio-Alola
  Gastrodon
  Flygon
  Mudsdale
보스|루자미네|lusamine|썬·문 에테르파라다이스
  Clefable
  Lilligant
  Mismagius
  Milotic
  Bewear
보스|구즈마|guzma|썬·문 에테르파라다이스
  Golisopod
  Masquerain
  Ariados
  Pinsir
박사|쿠쿠이박사|kukui|썬·문 챔피언 방어전 (스타팅 1종은 비움)
  Lycanroc
  Ninetales-Alola
  Braviary
  Magnezone
  Snorlax
주인공|영태|player_m|
주인공|미월|player_f|
라이벌|하우|rival_m|썬·문 챔피언 도전 (일부만)
  Raichu-Alola
  Tauros
  Noivern

@galar 가라르
챔피언|단델|leon|소드·실드 챔피언전 (스타팅에 따라 바뀌는 2종은 비움)
  Aegislash
  Dragapult
  Haxorus
  Charizard
사천왕|마리|marnie|소드·실드 챔피언컵
  Liepard
  Toxicroak
  Scrafty
  Morpeko
  Grimmsnarl
사천왕|비트|bede|소드·실드 체육관전
  Mawile
  Gardevoir
  Rapidash-Galar
  Hatterene
사천왕|마스터드|mustard|갑옷의 외딴섬 (일부만)
  Urshifu
관장|아킬|milo|소드·실드 체육관전
  Gossifleur
  Eldegoss
관장|야청|nessa|소드·실드 체육관전
  Goldeen
  Arrokuda
  Drednaw
관장|순무|kabu|소드·실드 체육관전
  Ninetales
  Arcanine
  Centiskorch
관장|채두|bea|소드 체육관전
  Hitmontop
  Pangoro
  Sirfetch'd
  Machamp
관장|어니언|allister|실드 체육관전
  Yamask-Galar
  Mimikyu
  Cursola
  Gengar
관장|포플러|opal|소드·실드 체육관전
  Weezing-Galar
  Mawile
  Togekiss
  Alcremie
관장|마쿠와|gordie|소드 체육관전
  Barbaracle
  Shuckle
  Stonjourner
  Coalossal
관장|멜론|melony|실드 체육관전
  Frosmoth
  Darmanitan-Galar
  Eiscue
  Lapras
관장|두송|piers|소드·실드 체육관전
  Scrafty
  Malamar
  Skuntank
  Obstagoon
관장|금랑|raihan|소드·실드 체육관전
  Flygon
  Gigalith
  Sandaconda
  Duraludon
보스|로즈|rose|소드·실드 에너지 플랜트
  Copperajah
  Ferrothorn
  Escavalier
  Perrserker
  Klinklang
박사|매그놀리아박사|scientist_f|
주인공|승재|player_m_2|
주인공|우리|player_f_2|
라이벌|호브|rival_m|소드·실드 챔피언컵 (일부만)
  Dubwool
  Corviknight
  Snorlax
기타|소도&실디|macro_grunt_m|

@paldea 팔데아
챔피언|테사|geeta|스칼렛·바이올렛 챔피언전
  Espathra
  Gogoat
  Veluza
  Avalugg
  Kingambit
  Glimmora * Rock
사천왕|칠리|rika|스칼렛·바이올렛 사천왕전
  Whiscash
  Camerupt
  Donphan
  Dugtrio
  Clodsire * Ground
사천왕|뽀삐|poppy|스칼렛·바이올렛 사천왕전
  Copperajah
  Magnezone
  Bronzong
  Corviknight
  Tinkaton * Steel
사천왕|청목|larry|스칼렛·바이올렛 사천왕전
  Tropius
  Oricorio
  Altaria
  Staraptor
  Flamigo * Flying
사천왕|팔자크|hassel|스칼렛·바이올렛 사천왕전
  Noivern
  Haxorus
  Dragalge
  Flapple
  Baxcalibur * Dragon
관장|단풍|katy|스칼렛·바이올렛 체육관전
  Nymble
  Tarountula
  Teddiursa * Bug
관장|콜사|brassius|스칼렛·바이올렛 체육관전
  Petilil
  Smoliv
  Sudowoodo * Grass
관장|모야모|iono|스칼렛·바이올렛 체육관전
  Wattrel
  Bellibolt
  Luxio
  Mismagius * Electric
관장|곤포|kofu|스칼렛·바이올렛 체육관전
  Veluza
  Wugtrio
  Crabominable * Water
관장|라임|ryme|스칼렛·바이올렛 체육관전 (더블배틀)
  Banette
  Mimikyu
  Houndstone
  Toxtricity * Ghost
관장|리파|tulip|스칼렛·바이올렛 체육관전
  Farigiraf
  Gardevoir
  Espathra
  Florges * Psychic
관장|그루샤|grusha|스칼렛·바이올렛 체육관전
  Frosmoth
  Beartic
  Cetitan
  Altaria * Ice
보스|모란|penny|스칼렛·바이올렛 스타단 최종전
  Vaporeon
  Jolteon
  Flareon
  Leafeon
  Umbreon
  Sylveon * Fairy
박사|올림박사|scientist_f|스칼렛 에어리어 제로 (AI 박사)
  Slither Wing
  Scream Tail
  Brute Bonnet
  Flutter Mane
  Sandy Shocks
  Roaring Moon
박사|투로박사|scientist_m|바이올렛 에어리어 제로 (AI 박사)
  Iron Moth
  Iron Bundle
  Iron Hands
  Iron Jugulis
  Iron Thorns
  Iron Valiant
주인공|보민|player_m|
주인공|푸름|player_f|
라이벌|네모|nemona|스칼렛·바이올렛 엔딩 후 (스타팅 1종은 비움)
  Lycanroc
  Goodra
  Dudunsparce
  Orthworm
  Pawmot
기타|페퍼|unknown_m|스칼렛·바이올렛 에어리어 제로
  Greedent
  Cloyster
  Scovillain
  Toedscruel
  Garganacl
  Mabosstiff
기타|클라벨|rich_m|스칼렛·바이올렛 엔딩 후 (스타팅 1종은 비움)
  Oranguru
  Abomasnow
  Polteageist
  Gyarados
  Amoonguss
`;

// Region default battle gimmick (Dynamax isn't supported by the Gen 9 simulator).
const GIMMICK = { kalos: "mega", alola: "z", paldea: "tera" };

const regions = [];
let region = null;
let trainer = null;
const ids = new Set();
for (const raw of SRC.split("\n")) {
  if (!raw.trim()) continue;
  if (raw.startsWith("@")) {
    const [id, name] = raw.slice(1).split(" ");
    region = { id, name, trainers: [] };
    regions.push(region);
    continue;
  }
  if (!raw.startsWith(" ")) {
    const [role, name, sprite, source] = raw.split("|");
    let id = `${region.id}-${name}`;
    while (ids.has(id)) id += "_";
    ids.add(id);
    trainer = { id, name, role, sprite, source: source || "", gimmick: GIMMICK[region.id] || null, team: [] };
    region.trainers.push(trainer);
    continue;
  }
  const line = raw.trim();
  let [left, tera] = line.split("*").map(s => s.trim());
  let [head, movesStr] = left.split("|").map(s => s.trim());
  let [species, item] = head.split("@").map(s => s.trim());
  const moves = (movesStr ? movesStr.split(",").map(s => s.trim()) : []);
  while (moves.length < 4) moves.push(null);
  trainer.team.push({ species, item: item || null, ability: null, nature: null, moves, teraType: tera || null });
}
for (const r of regions) {
  for (const t of r.trainers) while (t.team.length < 6) t.team.push(null);
  console.log(r.name, r.trainers.length);
}
fs.writeFileSync("src/data/trainers.json", JSON.stringify({ version: 1, regions }, null, 1));
console.log("wrote src/data/trainers.json");
