# Relic of the Clouds → APK

O jogo já estava quase pronto: ele detecta o app Android sozinho e usa o servidor online. Este projeto só embrulha tudo com o **Capacitor**.

## 1. Antes de tudo: o endereço do servidor
No `index.html`, procure por `MP_HOST_DEFAULT=''` e coloque o endereço público do seu servidor (ex.: `'https://meujogo.onrender.com'`). Preenchido, o campo de endereço some e todo mundo do APK usa esse servidor.
Se deixar vazio, o app tenta `https://relic-of-the-clouds.onrender.com` e o jogador pode digitar outro endereço.
Use sempre `https://` (o WebSocket vira `wss://` sozinho).

## 2. Gerar o APK (precisa de Node 18+, JDK 17 e Android Studio/SDK)
```bash
npm install
npm run android:add     # cria a pasta android/ (só na primeira vez)
npm run icons           # gera ícones e splash a partir de resources/
npm run apk             # gera android/app/build/outputs/apk/debug/app-debug.apk
```
Para abrir no Android Studio: `npm run open`.
Depois de qualquer mudança no `index.html`: `npm run sync`.

## 3. APK assinado (Play Store / instalar em qualquer celular)
No Android Studio: **Build → Generate Signed App Bundle / APK**. Guarde o arquivo `.jks` e a senha: sem eles você não consegue atualizar o app depois.

## Sem instalar nada no PC
Suba a pasta (sem `node_modules`) para um repositório no GitHub e use um build online (Codemagic, Appflow) ou o PWABuilder com o jogo hospedado.

## O que o projeto faz
- `npm run www` copia o `index.html` para `www/` sem o servidor embutido (−22 KB) e trava o zoom por pinça.
- `scripts/patch-android.js` deixa o app em tela cheia imersiva, com a tela sempre acesa e rotação livre.
- `capacitor.config.json`: id `com.relicoftheclouds.game` (troque se quiser), fundo `#0b1220`.
- `server.js` **não vai no APK**: hospede-o separado (Render, Railway, Fly…) com `TRUST_PROXY=1`.
- `resources/icon.png` e `splash.png` são provisórios: troque pelos seus (1024×1024 e 2732×2732).

## Observações
- A fonte pixel (VT323) vem do Google Fonts: precisa de internet na primeira abertura. Para funcionar 100% offline, baixe `VT323-Regular.woff2` e declare um `@font-face` no `index.html`.
- O save local usa `localStorage`, que o Capacitor mantém entre aberturas do app.

## Chefe novo: O Vagador
- Aparece em cerca de metade das ilhas que **não** têm chefe normal (covil fixo por ilha, uma vez por ilha). Ao chegar na ilha o jogo avisa a direção e a distância.
- Foice na mão esquerda, lança na direita. É **lento**: a dificuldade vem do **dano** (golpes tiram 40–60% da sua vida) e da **defesa**, não da velocidade. Enfurecido (<50% de vida) ele NÃO fica mais rápido, só +15% de dano e mais ataques.
- **Defesa:** ignora 35% do seu dano (45% enfurecido). Com a guarda fechada (preparando/executando ataque, aura tracejada) ignora 70% (75%). Um golpe só tira no máximo 3% da vida máxima dele. Ataque nas pausas entre os golpes.
- **Dois grupos de ataque** (aviso, zonas e projéteis mudam de cor):
  - **FOICE (vermelho sangue):** Ceifada Crescente, Redemoinho das Lâminas, Foice Arremessada, Almas Vagantes, Névoa Vagante, **Ceifa Espectral** (teleporta e paralisa).
  - **LANÇA (amarelo):** Estocada Perfurante (paralisa se a lança acertar), Salto Empalador, Cruz dos Ossos, Passo das Sombras (teleporta), **Lança do Vazio** (teleporta, marca uma linha e paralisa; uma estaca cai logo depois, dê o dash ao acordar), Chuva de Lanças.
- **ULTIMATO · Sentença do Vagador** (foice + lança): um anel aos pés dele mostra a carga (vermelho, depois amarelo). Dispara quando enche (45 s), ao enfurecer e aos 20% de vida. Ele fica parado e com a guarda no máximo:
  1. **Ceifa Total (vermelho):** a área enorme em volta dele explode (~2x o dano normal). Só escapa quem estiver num **círculo verde** (3 círculos; 2 enfurecido).
  2. **Cravada Final (amarelo):** raios de lança cruzam a arena (~1,8x o dano) e **paralisam** quem pegar. Fique **entre** os raios.
  3. Depois ele fica **EXAUSTO por 4,5 s**: sem defesa, dano total. É a sua recompensa por sobreviver.
- **Combo:** às vezes ele emenda **dois ataques seguidos, sempre de grupos diferentes** (foice + lança, em qualquer ordem): 30% de chance na fase 1, 50% enfurecido. O 2º ataque tem o próprio aviso, que começa quando o 1º está acabando. Ataques que paralisam nunca abrem um combo.
- **Teleporte:** nos ataques marcados acima, e também sozinho: se você foge ele aparece perto de você (aviso de círculo roxo), se você fica colado nele ele se afasta.
- **Paralisia:** você não anda nem dá dash por ~1 s (ainda pode atacar). Depois fica 1,6 s imune a nova paralisia.
- Fase 1 usa 6 ataques; enfurecido usa os 12.
- Recompensa: ouro + 50% de chance do acessório **Capuz do Vagador** (cada inimigo derrotado cura 3% da vida e 2% do Núcleo).
- Tudo está no fim do bloco `<script>` principal do `index.html`, numa função isolada que começa em `O VAGADOR`. Para ajustar dificuldade edite `VC` (defesa, limite por golpe, pausa, imunidade, `ult` = segundos para carregar o ultimato, `exh` = duração da exaustão) e `BVAG` (vida `hp`, dano `dm`, velocidade `sp`); o tempo de aviso de cada ataque está em `NYXT`.

## Chefes de ilha compartilhados entre os jogadores (multijogador)
No servidor, o chefe de cada ilha (Rei Caranguejo, Ent Ancestral, Kraken da Lagoa, Colosso Glacial, Titã de Magma, Rei Escorpião, Águia-Trovão) é **o mesmo para todo mundo do servidor**:
- **Mesmo chefe, mesma vida.** O servidor guarda a vida de cada chefe (chave `b<seed da ilha>`). O dano de todos os jogadores sai da mesma barra.
- **Vida e nível = soma dos jogadores perto.** Cada jogador que entra na luta manda a vida e o nível que o chefe teria para ele sozinho; o chefe passa a ter a **soma das vidas** e a **soma dos níveis** (o dano e a velocidade dele seguem a mesma fórmula do jogo com o nível somado). Quando alguém entra ou sai (ou desconecta) o servidor recalcula e a vida atual mantém a mesma **porcentagem**. Um aviso na tela mostra "ajustado ao grupo: N jogadores · Nv X". A recompensa de cada um continua a do **próprio nível**.
- **Um "dono" roda a IA** (o primeiro a chegar). Ele manda o estado do chefe ~10x por segundo; os outros veem o chefe no mesmo lugar, com os mesmos avisos de ataque, projéteis e zonas (sorteio por semente, igual para todos). Cada jogador só leva dano no **próprio** personagem.
- **O chefe escolhe o alvo** entre todos os jogadores em terra perto dele (o mais próximo).
- **Se o dono sai, desconecta ou fecha o jogo**, outro jogador assume na hora e o chefe continua da mesma vida. Se ninguém ficar por perto por 3 min, o chefe "reseta" (volta com a vida cheia).
- **Recompensa:** quem causar pelo menos **1% da vida** do chefe (e quem der o golpe final) recebe a recompensa inteira (ouro, XP, drops e contadores), como se tivesse matado sozinho. Os outros veem o aviso de que o chefe caiu.
- **Renascimento:** o servidor faz o chefe voltar depois de `BOSS_RESPAWN_MIN` minutos (padrão **10**, igual ao tempo que o jogo já usava). `BOSS_RESPAWN_MIN=0` = nunca renasce. Ex.: `BOSS_RESPAWN_MIN=15 node server.js`.
- **Sem servidor (modo solo) nada muda:** o chefe é local e funciona como antes. Se a conexão cair no meio da luta, o chefe vira um chefe comum.
- Anti-trapaça: o servidor limita o dano por mensagem (35% da vida do chefe) e a frequência.
- **Outros chefes em terra também são compartilhados** (mesma vida/nível somados, morte e recompensa iguais, renascimento no servidor): **Guardião Tubarão** (templo), **Samurai Dragão Branco**, **Rei Almôndega** (gato) e **O Vagador**. O Guardião Tubarão usa a mesma réplica exata dos chefes de ilha. Samurai, Rei Almôndega e Vagador têm IA própria e usam o modo *híbrido*: o chefe fica no mesmo lugar para todos, mas os ataques são simulados em cada aparelho, direcionados ao próprio jogador (assim cada um leva o dano do que vê). O samurai só luta depois de atacado: se quem bate é outro jogador, ele acorda para todos.
- Tempos de renascimento no servidor (iguais ao `BRSM` do jogo): chefe de ilha e guardião 10 min, samurai 15 min, Rei Almôndega 20 min, Vagador 20 min. `BOSS_RESPAWN_MIN=N` força N minutos para todos (0 = nunca renasce).
- A chave do samurai agora é fixa por ilha (`sam<seed>`); antes era sorteada a cada abertura do jogo, então ele "renascia" sozinho ao recarregar.
- Não entram (continuam locais): **Nyx** e o **chefe da raça** (fazem parte de missões pessoais de cada jogador), o fantasma invocado e os chefes do mar e do céu (Tubarão Mecânico, Colosso Antigo, Leviathan, Dragão das Nuvens, Rei Bolha), que dependem do navio de cada jogador.
- Código: servidor no bloco `CHEFES DE ILHA COMPARTILHADOS` (no `server.js` e no bloco `x-server` do `index.html`, os dois estão iguais) e cliente em `const SBOSS` (dentro do bloco do multijogador) + as funções `bossAI`, `bossFire` e `monAI`.

## Monstros das ilhas visíveis e atacáveis por outros jogadores (multijogador)
Os monstros comuns de cada ilha continuam sendo gerados e simulados no aparelho de cada jogador (o **dono**). Vida, nível, dano e velocidade **não mudam**: o servidor só repassa o que o dono já tem.
- **Quem vê:** cada jogador em terra manda ~5x por segundo os 8 monstros mais próximos dele (tipo, posição, vida real, vida máxima, nível/dano reais, id). Os outros jogadores em terra, a até 2000 de distância, veem esses monstros andando, com a mesma aparência (inclui elite).
- **Atacar:** o monstro de outro jogador entra na lista de alvos. O golpe vai pelo servidor até o dono (`mh`), que desconta da vida **real** do monstro. O servidor confere: os dois em terra, alcance (1300), no máximo 40 golpes/s e dano limitado à vida máxima do monstro.
- **Foco no dono:** o monstro continua perseguindo e atacando o jogador designado (o dono). O movimento é sempre o do dono.
- **Só ataca quem o atacou:** quem bate no monstro passa a poder ser atingido por ele por **8 s** após o último golpe, e só se estiver ao alcance dos golpes dele (corpo a corpo, pancada em área, tiro, salto/mergulho), com o **mesmo dano** que ele tem. Quem nunca o atacou não leva dano.
- **Recompensa:** quem der o golpe final recebe a recompensa normal (XP, ouro, drops). O dono não recebe a recompensa se outro jogador matar o monstro dele.
- Não entram: chefes (já são compartilhados por outro sistema) e guardas de vila.
- Código: servidor, mensagens `mn` e `mh` (no `server.js` e no bloco `x-server` do `index.html`, iguais); cliente, bloco `MONSTROS DAS ILHAS DOS OUTROS JOGADORES` (antes de `function conn()`).

## Missões (375 missões, cada grupo com um NPC)
**Não existe mais o botão 📜 nem a tecla L.** As missões ficam com **10 NPCs no pátio do Castelo Nuvem**: chegue perto, converse até o fim da fala e o painel daquele NPC abre. Cada NPC só mostra as missões dele. O progresso é salvo no navegador, por mundo (`npv_qst_<semente>`), e as recompensas (ouro, XP e 💀) caem sozinhas quando a missão é cumprida (aviso no topo da tela). Cada NPC tem um ícone flutuante e um acessório próprio na cabeça.

| NPC | Missões | Posição (a partir do centro do castelo) |
|---|---|---|
| ⚓ Grumete Pip | 🌱 Básicas (28) e 🎈 Triviais (15) | -80, 60 |
| 🧭 Contramestre Dorival | 📋 Normais (68) e ⏳ Longas (58) | 380, 840 |
| ⚡ Mensageiro Faísca | ⚡ Rápidas (25) | -320, 680 |
| 🗡️ Sargento Brasa | 🗡️ Difíceis (35) e ✨ Especiais (38) | 760, -340 |
| 📖 Cronista Evaristo | 📖 Lore (27) | -520, -340 |
| 😈 Frei Sebastião | Sete Pecados Capitais (7) | -960, 560 |
| 🏛️ Calíope, a Musa | Mitologia Grega (18) | -760, -280 |
| 🔨 Skald Gunnar | Mitologia Nórdica (10) | 960, 340 |
| 🏺 Escriba Neferu | Mitologia Egípcia (10) | 920, -100 |
| 🕯️ O Encapuzado | 🕵️ Secretas (26) e 👑 Superiores (10) | -760, -560 |

- 🕵️ **Secretas** e 👑 **Superiores** **só podem ser vistas depois de cumpridas**: não aparecem como ???, não têm dica e nem o total é mostrado (o painel do Encapuzado só conta quantas já foram reveladas). Elas se cumprem sozinhas, sem aceitar nada.
- 😈 **Sete Pecados**: Soberba (nível 40), Avareza (30000 de ouro), Luxúria (12 acessórios), Ira (1500 abates), Gula (20000 de ouro gasto), Inveja (20 armas/relíquias) e Preguiça (5 min parado).
- 🏛️ **Grega**: os 12 trabalhos de Héracles (Leão de Nemeia, Hidra, Corça, Javali, Estábulos, Pássaros, Touro, Éguas, Cinturão, Gerião, Maçãs, Cérbero) mais Medusa, Minotauro, Ícaro, Prometeu, Midas e Sísifo.
- 🔨 **Nórdica**: Yggdrasil, Fenrir, Jörmungandr, Sleipnir, Mjölnir, Olho de Odin, Valhalla, Loki, Valquírias e Ragnarök. 🏺 **Egípcia**: Barca de Rá, Anúbis, Osíris, Ísis, Sekhmet, Bastet, Khepri, Apófis, Esfinge e Travessia do Duat.
- 👑 **Superiores** (10, ligadas à mitologia e aos feitos maiores): Redenção dos Pecados, Pecado Original, Semideus de Atenas, Ascensão ao Olimpo, Einherjar de Odin, Faraó das Areias, Retorno do Hades, Rei dos Titãs, Fúria de Poseidon e Panteão Completo (todas as 45 missões de mitologia). Dão ouro alto, 💀 e títulos.
- ⚡ **Rápidas**: contra o relógio. No painel do Faísca toque em *Aceitar*; o tempo só corre com o jogo aberto e o painel fechado; se acabar, é só tentar de novo. Só uma por vez (o cronômetro fica no topo).
- 📖 **Lore**: 4 capítulos em sequência (*Diário das Nuvens*, *Os Sete Guardiões*, *Lendas Sombrias*, *Céus e Abismos*). Cada missão libera a próxima e conta um pedaço da história ao ser concluída; os capítulos dão títulos.
- Código: bloco `MISSÕES` no fim do `index.html` (antes do bloco `x-server`). Para criar/ajustar missões, edite a seção `DADOS` (`A(cat,id,ícone,título,descrição,estatística,meta,ouro,xp,{extras})`); para mudar o NPC ou a posição, edite `NPCS` (campo `cats` diz quais categorias o NPC cuida; `HID` lista as categorias que só aparecem depois de cumpridas). Estatísticas disponíveis: `kill dash skill hurt death perfect wind glide chest km gold goldmax spent play idlemax nohitmax streakmax elite boss bisl bvag bsam bgat bnyx bshk bmega kpir kele kdes ksky ksea kjun kgla kvol khom mapopen invopen menuopen shopopen saveopen lv tiles weap acc skin ccmax elq lev drg` e as de conjunto `sins greek norse egypt myth` (quantas missões de cada grupo já foram cumpridas).
- Observação: chefes de mar/céu que têm sistema próprio (Colosso, Tubarão Mecânico, Rei Bolha) não têm missão própria; o Leviathan e o Dragão das Nuvens contam. Não há missão de pesca (o jogo não expõe esse contador).
- Observação 2: os NPCs de missão só existem no Castelo Nuvem; a Mestra Vera (missões de raça) e o Capitão Bravo (contratos de caça) continuam como estavam.

## Chefe novo: Beelzebub (Gula) · Pântano da Boca
- Vive na ilha **Pântano da Boca** (some dos outros chefes de ilha) e acorda quando você chega a ~1,5 km do covil dele, longe da Boca do centro.
- **Mais difícil e mais blindado que Asmodeus:** vida 10000, dano 48, mais rápido. Defesa própria (`BZA`): ignora 45% do seu dano (55% enfurecido), 80%/85% com a guarda fechada, resiste mais se você cola nele, e um golpe só tira no máximo 2% da vida dele. Pausas entre ataques mais curtas, combos mais frequentes, ultimato a cada 32 s e exaustão de 3,6 s. 17 ataques + ULTIMATO.
- **Fases:** abaixo de 50% vira a *Forma Voraz* (cresce, libera todos os ataques, +25% de dano); abaixo de 25% entra o *Banquete Sem Fim* (combos, pausas curtas, +45% de dano).
- **Ultimato "Banquete Infinito":** 7 GARFOS gigantes cruzam a arena, um depois do outro, cada um avisado por uma faixa vermelha. Quem leva uma garfada perde vida e ENERGIA (Núcleo), e o Beelzebub recupera 1% da vida por garfo. Depois ele fica EXAUSTO (dano total). Ajustes: `BZF`.
- **Iscas 🍖:** pegar uma deixa você empanturrado (lento por 3 s). A Boca do pântano continua inalando durante a luta.
- **Recompensa:** 9000–12000 de ouro, título *Senhor da Gula*, acessório *Coroa de Moscas* (cura 3% por abate) e a conquista *Fim do Banquete*.
- Ajustes no código: `BZB` (chefe), `BZC` (iscas), `AC` (defesa, compartilhado com Asmodeus).
- **Fase 2 (Forma Voraz):** a cabeça se solta e fica FLUTUANDO, soltando moscas de lá; o corpo se levanta sozinho. Novos ataques: **Rolagem do Glutão** (o corpo vira bola e rola 3-4 vezes pela arena na sua direção, com a linha vermelha avisando o caminho; a cabeça atira moscas ao mesmo tempo) e **Enxame da Cabeça**. Depois de rolar ele fica TONTO por ~2,4 s: é a hora de bater. Ajustes: `BZR`.

## Contrato de Mamon · como abrir a Mão da Avareza
- Depois de derrotar **Beelzebub**, o NPC **Mamon, o Agiota** (💰, pátio do Castelo Nuvem, perto do centro, ao norte) libera uma missão só: **Contrato de Mamon** (`w_mamon`).
- A missão é ligada à riqueza e MUITO difícil: **ter 150000 de ouro de uma vez**, contando só o ouro juntado DEPOIS da queda de Beelzebub (estatística `avmax`). Gastar ou depositar derruba o total.
- Ao cumprir, a ilha **Mão da Avareza** se abre no mar (a função `AVQ()` agora olha esta missão, e não mais só o Beelzebub). Antes do Beelzebub cair, o Mamon só dá uma dica e o painel não abre.
- Regra de design: as missões que desbloqueiam pecados devem ser muito difíceis. Para ajustar, edite a linha `A('w','w_mamon',...)` (meta, ouro e XP) no bloco `MISSÕES`; o NPC fica em `NPCS.mam` e a trava em `GATE`.

## Chefe: Mammon, o Rei da Avareza · palma da Mão da Avareza
- Aparece quando você chega perto do centro da palma (Círculo de Riquezas) da ilha Mão da Avareza. **Mais difícil que o Beelzebub:** vida 16000 (Beelzebub 10000), dano 56 (48), defesa maior (ignora 50%/60% do dano, 82%/88% com a guarda fechada, mais ainda se você cola nele), máx. de 1,8% da vida por golpe, combos e fase 3 (abaixo de 25%: mais dano, pausas curtas). Recompensa 18000 a 24000 de ouro. Missão nova: "Fim da Avareza".
- **20 ataques + ULTIMATO** (Beelzebub: 17 + ultimato). Fase 1 usa 13 deles; fase 2 usa 20.
- **Fase 1:** demônio de cajado (sprites de frente, costas, esquerda e direita). **Fase 2 (abaixo de 50%):** afunda no tesouro e fica parado sobre a pilha de ouro (sprite da caveira), mais dano e mais ataques.
- **ULTIMATO (carrega em 34 s, e dispara ao entrar na fase 2 e na fase 3):** na fase 2 é o **REDEMOINHO DE OURO**: ele solta anéis de moedas sem parar, o círculo gira e forma um redemoinho com 2 brechas que giram junto; no meio ele inverte o giro (aviso na tela). Siga a brecha para ficar vivo. Depois ele fica EXAUSTO (dano total). Na fase 1 o ultimato é a COBRANÇA TOTAL (5 anéis de moedas fechando em você, com 2 brechas).
- **Cajado da Compra:** ele lança o cajado (vai e volta). Se acertar, **compra** uma das suas habilidades: o botão dela trava com um 🔒 e o preço. Toque no botão para recomprar com ouro. Sem recomprar, não dá para usar essa habilidade até o fim da luta; no fim (boss morto, você sai da palma ou desmaia) todas voltam. A trava é por botão (Z, X, C...), não por arma.
- **Preços (altos):** (3000 + 22 x custo de Núcleo da habilidade), +35% a cada recompra na luta, x1,4 na fase 2. Gastar ouro também derruba o total do Contrato de Mamon.
- Código: bloco `MAMMON` no fim do `index.html`. Ajustes: `MMB` (vida, dano, listas de ataques `MMA1`/`MMA2`) e `MMD` (defesa, ultimato, preços, velocidade do cajado). Sprites embutidos em base64 (`MMI`). Para facilitar o redemoinho, mexa em `dA`/`dB` (giro), `iv` (intervalo) e no `.4` das brechas dentro do case `mmult`.

## Ilha nova: Perna da Preguiça · depois do Mammon
- **Desbloqueio (2 etapas):** 1) derrote **Mammon**; 2) cumpra o **Contrato da Preguiça** (`q_preg`) com a NPC **Sesta, a Sonolenta** (🦥, pátio do Castelo Nuvem, ao norte do centro). Antes do Mammon cair ela só dá uma dica e o painel não abre.
  - A missão: **ficar parado 15 minutos SEGUIDOS** (900 s, estatística `pgmax`), no navio ou em terra. Só conta o tempo parado DEPOIS da queda do Mammon. Andar, navegar ou abrir menu/painel zera a contagem (o painel da Sesta também). Recompensa: 20000 de ouro e 300 de XP.
  - Ao cumprir, a ilha surge no mar à frente do navio e o jogo avisa a direção e a distância. No multijogador ela fica num lugar fixo (anel de 5 células), igual para todos. A função `PGQ()` (ao lado de `AVQ()`) olha a missão `q_preg`.
  - Ajustes: linha `A('q','q_preg',...)` (meta em segundos, ouro e XP), NPC em `NPCS.pre`, trava em `GATE.q`.
- **Formato:** uma **perna dobrada**: coxa inclinada, joelho redondo, canela e pé grande com 5 dedos. É bem larga (cerca de 1900 de largura por 6500 de altura) para servir de **arena**.
- **Rio de água parada:** nasce numa poça na coxa, passa pelo **lago do joelho** e termina numa poça no pé. Sem correnteza e sem dano, só te segura.
- **Pasto:** ovelhas e vacas pastando (algumas dormindo, com "z"), cercas, fardos de feno, capim, lírios e juncos. É tudo enfeite: os bichos não atacam. Sem árvores e sem pedras.
- **Lento (a regra da ilha):** em terra firme você anda a **60%** da velocidade; na **água parada, 38%**. O **dash não é afetado**.
- **Arena:** a cada 30 s chegam 2 monstros (pirata, atirador, mago ou brutamontes), no máximo 6 vivos na ilha. Não nasce vila nem elite de bioma aqui.
- **Código:** bloco `ILHA PERNA DA PREGUIÇA` logo depois do bloco da Mão da Avareza (fim do primeiro `<script>`). Ajustes em `PGD` (`slow`, `water`, `wave`, `waveN`, `waveMax`). O formato fica em `pregGeo` (cápsulas da coxa, canela e pé, `TOES` para os dedos, `C` para o caminho do rio e `lakes` para os lagos). Os enfeites vêm de `pregMap` e o desenho de `pregDraw`.
- Ainda **não tem chefe** na ilha. O próximo da fila dos Sete Pecados seria o da Preguiça.

## Elementos · fraquezas, resistências e combinações
O jogo agora tem **10 elementos**: ⚔️ Físico · 🔥 Fogo · 💧 Água · ❄️ Gelo · ⚡ Raio · 🌿 Natureza · 🪨 Terra · ☀️ Luz · 🌑 Sombra · 🩸 Sangue. O elemento do seu ataque é o da **arma em mãos** (chip no canto esquerdo, embaixo dos botões; toque nele para abrir a tabela completa). Cada monstro e chefe também tem um elemento (alguns têm dois: o 2º conta metade).

**Roda de vantagem** (cada elemento vence 2 e perde para 2): Fogo>Gelo,Natureza · Água>Fogo,Terra · Gelo>Água,Natureza · Natureza>Terra,Raio · Terra>Raio,Fogo · Raio>Água,Gelo. **Trio especial:** Luz>Sombra>Sangue>Luz. **Físico** (espadas, pistolas e punhos comuns) é neutro: nunca ganha nem perde.
- **Fraqueza:** dano ×1,5 (aparece "FRACO!"). **Resistência:** ×0,65. **Mesmo elemento:** ×0,5 ("ABSORVE"). Elemento contra inimigo sem elemento (piratas, etc.): ×1,1.
- **Chefes** sentem menos (×1,3 de fraqueza, ×0,83 de resistência), para não virarem fáceis nem impossíveis. Defesas próprias dos chefes (Vagador, Beelzebub, Mammon…) continuam valendo.
- **Combinações:** acerte um elemento e, **em até 4 s**, outro elemento diferente no mesmo alvo (troque de arma na barra) = **reação**: Vapor (fogo+água), Derretimento (fogo+gelo, +100%), Incêndio, Plasma, Magma, Congelar (água+gelo, paralisa 1,6 s), Eletrocussão, Lama, Florescer (cura), Estilhaçar, Geada, Fissura, Combustão, Aterramento (devolve Núcleo), Raízes, **Eclipse (luz+sombra, +130%)**, Radiância, Drenar (cura), Sangue Ferve e Purificação. Contra chefes o bônus é 60% e a paralisia é curta (máx. 0,4 s).
- **Onde mexer:** bloco `ELEMENTOS` logo antes de `function hit` no `index.html`. `ELM_CFG` (multiplicadores, janela de 4 s, queimadura), `ELM_W` (elemento de cada arma, por nome), `ELM_M` (de cada monstro/chefe, pelo tipo) e `ELM_R` (reações). Armas e monstros fora das tabelas ficam físico/neutro. O dano passa por um ponto só (`hit`), então vale para todas as habilidades.
- Ainda **não** existe resistência elemental do jogador (os ataques dos monstros não têm elemento): é o próximo passo natural (acessórios de resistência).

## Troca de arma durante habilidades
Antes o jogo não deixava trocar de arma enquanto uma habilidade estava rodando (Rajada, Metralha, Tempestade de Areia etc.). Agora a troca é **imediata**. A habilidade que já começou termina normalmente, com o dano e o elemento da arma que a lançou, e a arma nova já pode atacar e usar as habilidades dela. Se você lançar uma habilidade da arma nova antes da antiga acabar, a antiga é interrompida. Só ficam travados os modos longos da Katana (corrida, combo e espelho) e o cruzado do Punho Estrela, que dependem da própria arma. Código: `setSel`, `attack`, `skill` e o bloco `if(ss){…}` do `index.html`.


---

## Desempenho (otimizações recentes)

- **Congelamento corrigido**: as armas dos Pecados são registradas depois da barra de armas; agora `syncWeapons()` cria cooldown e botão delas (antes `combat()` lançava erro em todo quadro e o jogo travava).
- **Loop só começa depois que todos os scripts carregaram** (evitava `altarDraw is not defined` no início).
- **Cache de terreno das ilhas** (tiles de 128 px): cada ilha é pintada uma vez e depois só copiada. Biomas animados (`lagoon`, `volcano`) e zoom diferente do normal usam o desenho direto de antes. Se algo der errado, o cache se desliga sozinho (`TCX.off`).
- **Sprites de nuvem** gerados já na escala da tela (sem reduzir 3x com suavização a cada quadro).
- **`pixelize`** com Uint32 e sem reconversões.
- **Qualidade por nível** `QT=[[PS,SS],...]`: 0 = 4/2 (desktop), 1 = 4/1 (celular, 1/4 dos pixels), 2 = 5/1, 3 = 6/1. Começa pelo tipo de aparelho e **cai sozinha** se o quadro passar de ~24 ms (sobe de volta se sobrar folga). Forçar: `?q=0..3` na URL ou `setQuality(n)` no console. O último nível fica salvo em `localStorage` (`npv_ql`).
- **Fontes do Google** carregam sem bloquear o início dos scripts.

## Ilha nova: Pântano do Sangue Fervente · depois do Belphegor
- **Desbloqueio:** 1) derrote **Belphegor**; 2) cumpra o **Contrato da Ira** (`i_ira`) com a NPC **Ardência, a Colérica** (🩸, pátio do Castelo Nuvem, a nordeste). Antes do Belphegor cair ela só dá uma dica e o painel não abre.
  - A missão: **derrotar 666 inimigos com a vida abaixo de 50%** (estatística `irk`). Só conta DEPOIS da queda do Belphegor. Recompensa: 30000 de ouro e 400 de XP.
  - Ao cumprir, a ilha surge no mar à frente do navio e o jogo avisa a direção e a distância. No multijogador fica num lugar fixo (anel de 6 células). A função `IRQ()` (ao lado de `PGQ()`) olha a missão `i_ira`.
- **Ilha:** pântano redondo e irregular com 9 **poças de sangue em ebulição** (bolhas, vapor, crosta rachada e espinhos). Sem árvores, pedras ou vila.
- **Mecânica:** dentro de uma poça você perde **2,5% da vida máxima a cada 0,5 s** e anda a 70% da velocidade (o dash não é afetado). Ondas de 3 monstros a cada 25 s (máx. 8 vivos). A dor ajuda no contrato: ficar abaixo de 50% de vida é o que faz os abates contarem.
- **Código:** bloco `ILHA PÂNTANO DO SANGUE FERVENTE` logo depois do bloco da Perna da Preguiça. Ajustes em `IRD` (`dmg`, `tick`, `slow`, `wave`, `waveN`, `waveMax`). Poças em `iraGeo` (`pools`). Missão: linha `A('i','i_ira',...)`; NPC em `NPCS.ira`; trava em `GATE.i`.
- **Chefe:** Azazel (veja abaixo). Aparece quando você chega perto do centro do pântano.

## Chefe: Azazel · A Ira · Pântano do Sangue Fervente
- **O mais forte dos pecados:** vida 48000 (Belphegor 30000, Mammon 16000), dano 80 (66 / 56), defesa alta (ignora 60%; 68% na fase 2; 87%/92% com a guarda fechada), no máx. 1,2% da vida por golpe. Escala com o **nível de pecado** (cada pecado cumprido dá +4 níveis a todos os chefes).
- **29 ataques** (Mammon: 20 + ultimato): 27 comuns + **Fúria Contagiante** + **Ultimato**. Fase 1 usa 14 comuns; fase 2 (abaixo de 50%, **Forma Infernal** com o sprite de chamas) libera todos; fase 3 (abaixo de 25%): mais dano, mais velocidade e pausas curtas. Os 27 comuns são receitas curtas na tabela `AZR` (tipos: leque, anel com brecha, espiral, zonas perseguidoras, rastro, cruz, chuva, muro com brecha, órbita, poças, meteoros, coroa/prisão).
- **😡 Fúria Contagiante:** o anel vermelho avisa; depois você fica **IRADO** por 6 s: corre sozinho para o Azazel (o dash ainda funciona) e fica **CONFUSO**:
  - ataque comum: 30% de chance de **bater em si mesmo** (4% da vida máx., no máx. 1 vez a cada 1,2 s);
  - habilidade: 40% de chance de **usar outra habilidade** da arma (gasta o Núcleo e o recarregamento dela, como se tivesse apertado o botão errado) e 18% de chance de se machucar.
  - Perto dele há pancada no chão a cada 1,1 s. Depois da fúria você fica 7 s sem poder ser irado de novo. Ajustes em `AZD` (`rageT`, `rageCd`, `swap`, `self`, `selfDm`).
- **Ultimato (carrega em 26 s e dispara ao entrar na fase 2 e na fase 3):** fase 1 = **Tempestade Rubra** (5 anéis de zonas + espiral); fase 2 = **Fúria Cega** (te deixa irado + espiral de 6 braços + zonas). Depois ele fica **EXAUSTO por 4 s** (dano total).
- **Recompensa:** 50000 a 70000 de ouro e a conquista **Fim da Ira** (`baza`). Derrotá-lo **cumpre o pecado da Ira** (se ainda não estava), ou seja, **+1 nível de pecado** (monstros +4 níveis, monstro corrompido, acessório e arma lendária da Ira).
- **Sprites:** embutidos em base64 (`AZI`): frente, costas, esquerda, direita e Forma Infernal. Código: bloco `AZAZEL` no fim do `index.html`. Elemento: fogo + sangue.


## Prints do jogo num navegador headless (Farol Colossal)
`scripts/screenshot-farol.js` abre o `index.html` num Chromium sem janela (Playwright), começa um jogo novo, faz o Farol Colossal surgir e tira prints por fora e por dentro.
```bash
npm install
npm run shots:install    # baixa o Chromium (uma vez)
npm run shots:farol      # prints em screenshots/  (celular 390x760)
npm run shots:farol -- --desktop   # tela larga 1280x720
```
Saem: `00-inicio`, `01-fora-na-porta`, `02-fora-corpo-da-torre`, `03-fora-do-navio` e `04` a `08` (interior: entrada, térreo, andares 26 e 54, topo com a lanterna). Obs.: o jogo só desenha o farol com zoom ≥ 0,3, então de longe (visão do leme) a torre não aparece. Se algo falhar, o script salva `screenshots/debug-erro.png` e mostra os erros da página. O script chama funções do jogo direto (`spawnFarol`, `farEnter`, `FARI`), então, se você renomear essas funções no `index.html`, ajuste o script.

## Títulos dos chefes
Todo chefe do jogo tem tela de título (nome grande + subtítulo exclusivo, com barras de cinema, cor do chefe, uma vez por luta) e ícone de cabeça 16x16 na barra de vida. Lista: Rei Caranguejo, Ent Ancestral, Kraken da Lagoa, Colosso Glacial, Titã de Magma, Rei Escorpião, Águia-Trovão, Guardião Tubarão, Megacamarão, Megalagosta, Rei Bolha, Tubarão Mecânico, Dragão das Nuvens, Colosso Antigo, Leviathan, Samurai Dragão Branco, Rei Almôndega (o "Gatão", boss_gatao), Capitão Fantasma, Nyx, O Vagador, os 5 pecados (Asmodeus, Beelzebub, Mammon, Belphegor, Azazel) e os 4 chefes de raça (Colosso de Sucata, Rei Falcão, Lebre Lunar, Campeão Ancião).
Chefes de terra: o título aparece ao chegar a 800 de distância (no Samurai, ao despertar). Chefes do mar e do céu: no começo da luta.
Para mudar os textos, edite a tabela `T` no bloco `TÍTULOS DOS CHEFES ESPECIAIS` (fim do `index.html`): `n` = título, `s` = subtítulo, `c` = cor. A distância de ativação é `800` no `monStep`.

### Molduras personalizadas dos títulos
Cada chefe tem a **sua própria moldura** (desenho SVG + cor do texto + animação de entrada + animação contínua), desenhada atrás do nome. Exemplos: Rei Almôndega = o título dentro de uma **asa de dragão** com coroa; Rei Caranguejo = duas garras gigantes segurando a placa; Kraken = tentáculos com ventosas; Leviathan = 17 olhos que piscam; Guardião Tubarão = mandíbulas com dentes; Mammon = moeda de ouro com raios; Megalagosta = ringue de boxe com luvas; Samurai = pergaminho com sol vermelho e katana que reluz; e assim por diante (29 molduras; o Megacamarão usa a mesma nos dois nomes de chave).
- Onde fica: bloco `MOLDURAS DOS TÍTULOS` (dentro do script `TÍTULOS DOS CHEFES ESPECIAIS`, no fim do `index.html`). Tabela `FRM`, uma entrada por chave de `T`.
- Campos de cada moldura: `svg` (desenho em viewBox 640x300), `pl` (placa do texto: `x,y` centro, `w,h` área), `fm` (tamanho máximo da letra), `sp` (nº de letras a partir do qual o nome quebra em 2 linhas; padrão 13), `tc`/`ts` (cor do texto / contorno), `en` (entrada: `zoom drop unfurl rise glitch spin slide pop`), `tx` (efeito do texto: `tx-glow tx-pulse tx-shake tx-wave tx-flick tx-zap tx-slow tx-shine`).
- Classes de animação usáveis dentro do SVG: `a1 a1b` (piscar), `a2 a2s` (flutuar), `a3` (pulsar), `a4` (balançar), `spn gr gr2` (girar), `dr dr2` (pingar), `rs rs2 rs3` (bolhas/brasas subindo), `bz bz2 bz3` (zumbido), `fl1 fl2` (chamas), `bolt bolt2 bolt3` (raios).
- Para testar sem lutar contra o chefe: no console do navegador, `BOSS_TITLE_SHOW(BOSS_TITLES.boss_gatao)` (troque a chave pela do chefe).
- Chefe novo sem moldura continua funcionando: aparece com o título grande de sempre.

## Ícones dos chefes (16x16)
Cada chefe tem um ícone de cabeça em pixel art, desenhado na frente da barra de vida. Chefes de terra: ao lado esquerdo da barra sobre a cabeça. Leviathan, Dragão das Nuvens, Tubarão Mecânico e Colosso Antigo: ao lado esquerdo da barra do topo da tela (o emoji sai). Os desenhos estão no bloco `ÍCONES 16x16 DOS CHEFES` no fim do `index.html` (objeto `IC`: 16 linhas de 16 letras; cores em `PAL`). Os ícones não têm moldura. Estão incluídos os chefes de raça (Colosso de Sucata, Rei Falcão, Lebre Lunar, Campeão Ancião), Megacamarão, Megalagosta e Rei Bolha. Chefe sem ícone cadastrado continua só com a barra.

### Molduras em pixel art (substituem os SVG)
As molduras dos títulos agora são desenhadas em pixel art (grade 160x75, escala 4, `image-rendering:pixelated`), geradas uma vez por chefe e guardadas em cache. O título aparece no topo da tela. Código: bloco `PIXEL ART DAS MOLDURAS`, logo antes de `frameHTML`.
- `PXC` tem a arte própria de cada chefe (polígonos, linhas e elipses; contorno e luz/sombra são automáticos). `PXD` define o formato da placa (`r` retangular, `o` oval, `p` pontuda, `s` pergaminho) e enfeites extras. Os campos `en` (entrada), `tx` (efeito do texto), `pl`, `tc` e `ts` de `FRM` continuam valendo.
- `g.bl.push([x,y,cor])` cria pixels que piscam (gemas, olhos, chamas). Se a geração falhar, a moldura volta ao SVG antigo.

## Ilha nova: Olho da Serpente (pós-Azazel)
- **Como desbloquear:** derrote Azazel, depois fale com **Argos, o Vigia** (pátio do Castelo Nuvem) e cumpra o **Contrato do Olho**: 150 Esquivas Perfeitas feitas DEPOIS de derrotar Azazel (recompensa: 60000 de ouro e 500 XP). Ao cumprir, a ilha surge no mar à frente do navio (no multijogador fica num lugar fixo, no anel de 7 células).
- **A ilha:** um olho gigante (formato de amêndoa, íris verde, veias vermelhas). A pupila é um **poço de serpentes** e há 8 ninhos menores ao redor.
- **Poços:** dentro deles você anda a 70% da velocidade, perde vida aos poucos e fica envenenado. O dash não é afetado.
- **Olhar do Olho:** a cada 6 s ele te marca com 3 círculos vermelhos (um olho desenhado no chão) que explodem depois de ~1,2 s. Saia do círculo ou use o dash.
- **Serpentes:** saem do poço e dos ninhos sem parar (até 12 ao mesmo tempo): cobra veloz, naja que cospe veneno e jiboia grande. Mordida e cuspe envenenam por 5 s.
- **Ajustes:** objeto `OLD` no `index.html` (dano, velocidade, tempo do olhar, quantidade de serpentes). A meta da missão está em `A('y','y_olho',...)`.

## Chefe novo: Leviatã (Inveja) · Olho da Serpente
- Aparece quando você chega perto da pupila da ilha **Olho da Serpente** (aberta pelo Contrato do Olho). Vida 60000 (Azazel 48000), dano 90 (80).
- **31 ataques de padrão** (leques, anéis, espirais, zonas de mira, rastros, cruzes, chuvas, muros, órbitas, poças, meteoros, coroas) + **Espelho da Inveja** + **Mergulho** + **Ultimato**. O Azazel tem 27 + Fúria + ultimato.
- **Fase 1** usa 16 ataques (e o Espelho). **Fase 2** (<50% de vida, "Forma do Abismo": só cabeça e asas saindo do chão) usa todos e mergulha. **Fase 3** (<25%): mais dano e pausas curtas.
- 🪞 **Espelho da Inveja:** copia o seu último ataque ou habilidade (2 na fase 2) e devolve em projéteis e zonas verdes. O formato segue o tipo da habilidade (leque, rajada, redemoinho, onda, impacto...).
- 🐍 **Mergulho (fase 2):** ele afunda e fica intocável, persegue você por baixo, avisa com um círculo vermelho e emerge. Depois fica **EXPOSTO** (dano total) por 2,4 s.
- **Ultimato:** fase 1 = Olhar da Serpente (anéis de zonas + espiral); fase 2 = Inveja Absoluta (espiral de 6 braços + zonas + 2 espelhos). Depois ele fica EXAUSTO por 4 s.
- Ao cair: +1 nível de pecado (Inveja) e a conquista **Fim da Inveja**.
- Tudo está no fim do segundo bloco `<script>`, na função que começa em `LEVIATÃ`. Ajustes: `LVTB` (vida, dano, velocidade), `LVTD` (defesa, mergulho, ultimato) e `LVTR` (receita de cada ataque).


## Itens extras depois de cada pecado · Oficina dos Pecados (NPC Dona Fagulha)
Cada pecado agora dá **mais itens**: uma arma de dano nova, um acessório com passiva, um material próprio e, no fim, itens secretos. Tudo aparece numa seção nova no fim do painel da Oficina (tecla **O**).
- **Como libera:** o pecado de cada item libera quando a missão do pecado é cumprida **ou** o chefe dele é derrotado. Ao cumprir um pecado você ganha **+4 do material dele** (jogadores antigos recebem o pacote uma vez, ao abrir o jogo).
- **Materiais (7, um por pecado):** 🪞 Caco de Espelho Dourado (Soberba) · 🪙 Moeda Amaldiçoada (Avareza) · 🌹 Pétala Carmesim (Luxúria) · 🔥 Brasa da Fúria (Ira) · 🦷 Dente Voraz (Gula) · 🐍 Escama Esmeralda (Inveja) · 💤 Poeira do Sono (Preguiça).
  - Caem dos **monstros corrompidos** do próprio pecado (15% por abate, 30% e 2 unidades nos elites) e dos **chefes dos pecados** (8 a 12 por chefe: Asmodeus→Pétala, Beelzebub→Dente, Mammon→Moeda, Belphegor→Poeira, Azazel→Brasa, Leviatã→Escama). Como a Soberba não tem chefe, o Caco também cai (2 por chefe) de qualquer chefe do jogo, depois que a Soberba é cumprida.
  - Ficam salvos junto com o save do jogo (dentro de `sin.x`) e no navegador. Não caem dos eventos de dia/noite.
- **Armas de dano (1 por pecado, mais fortes que a arma lendária do pecado):** Espada do Orgulho Estilhaçado (260), Fuzil do Credor (240), Colar de Espinhos (210, teleguiado), Manoplas do Vulcão Rubro (140, muito rápido), Garfo do Glutão (280, cura), Besta Olho-Verde (250, teleguiada) e Cobertor de Chumbo (330). Cada uma tem 3 habilidades e elemento próprio (tabela `ELM_W`). Preço: 10 do material do pecado + 3 do material do pecado seguinte.
- **Acessórios (1 por pecado):** Auréola do Orgulho (+25% de dano com vida acima de 80%) · Anel do Credor (+40% de ouro) · Véu de Pétalas (15% de atordoar) · Brasão da Fúria Cega (até +40% de dano quanto menos vida) · Cinto do Banquete (cada abate cura 4% da vida e 3% do Núcleo) · Olhar da Cobra Verde (+25% de dano em chefes) · Travesseiro Encantado (parado por 2 s, regenera 2,5% da vida por segundo). Preço: 6 do próprio + 2 do pecado anterior.
- **🕯️ Receitas secretas:** ficam escondidas como "???" até você ter **pelo menos 1 de cada um dos 7 materiais**. Depois aparecem:
  - **Lâmina dos Sete Pecados** (arma secreta, dano 420, 3 habilidades) · 8 de cada material;
  - **Coroa dos Sete Pecados** (acessório de cabeça: cada abate cura 3% da vida e 3% do Núcleo, e 10% de chance de uma explosão sombria) · 6 de cada;
  - **Selo dos Sete Pecados** (permanente: +15% de dano e +10% de alcance) · 4 de cada.
- **Onde mexer:** bloco `ITENS EXTRAS DOS PECADOS`, logo depois do bloco `EVOLUÇÃO DO MUNDO PELOS PECADOS` no `index.html`. `SX` (armas, acessórios e materiais de cada pecado), `DROPS` (chances e quantidades), `COST` (preços), `SECRET` (preços dos itens secretos) e `BOSSK` (qual chefe dá qual material). No console: `SINX.add('ira', 20)` dá 20 Brasas da Fúria para testar.


## Oficina só pela NPC · 7 ataques nas armas dos pecados · receitas escondidas
- **Não existe mais a tecla O.** A Oficina abre falando com a NPC **Dona Fagulha** (pátio do Castelo Nuvem).
- **7 ataques por arma de dano dos pecados** (15 armas: 7 lendárias, 7 da Oficina e a Lâmina dos Sete Pecados): as 3 antigas (Z X C) + 4 novas (V B N e a tecla **,** vírgula). Código: bloco `ATAQUES DOS PECADOS` (tabela `ADD` e moldes `SNK`/`SNT`/`SNE`) logo depois do bloco `ITENS EXTRAS DOS PECADOS`. O dano de cada golpe é o dano da arma × `dm`.
- **Armas lendárias também se fazem na Oficina**: 8 do material do próprio pecado + 2 do pecado anterior (`COST.lOwn`, `COST.lPrev`). Elas continuam podendo cair dos monstros corrompidos.
- **Receita escondida:** na "Oficina dos Pecados" uma receita só aparece se você tiver pelo menos 1 de cada material dela (função `seen`). Vale só para os itens dos pecados e as receitas secretas.


## Ilha nova: Cabeça Gélida (Soberba · pós-Leviatã)
- **Como desbloquear:** derrote o Leviatã, depois fale com **Argos, o Vigia** e cumpra o **Contrato do Gelo**: 100 inimigos SEGUIDOS sem levar dano, contando só depois do Leviatã (recompensa: 80000 de ouro e 600 XP). Tomar um golpe zera a sequência. Ao cumprir, a ilha surge no mar à frente do navio (no multijogador fica num lugar fixo, no anel de 8 células).
- **A ilha:** uma cabeça colossal de gelo vista de cima (testa larga, queixo estreito, orelhas, coroa de espinhos de gelo, sobrancelhas arrogantes). Os **lagos gélidos** ficam nos olhos, na testa, nas narinas, na boca e nas orelhas.
- **Lagos:** dentro deles você perde vida aos poucos e anda a 60% da velocidade. Demorar ~2,6 s dentro = **CONGELADO** por 1,3 s (quase não anda) e depois fica 4 s imune. Aparece uma barra de frio em cima do personagem.
- **Granizo:** a cada 7 s, 4 círculos de gelo marcam o chão perto de você e caem depois de ~1,1 s. Saia do círculo ou use o dash. Ser atingido também enche a barra de frio.
- **Inimigos de gelo:** golem de gelo, lobo glacial e arqueira de cristal aparecem sem parar (até 10 ao mesmo tempo). A ilha não tem árvores, pedras nem vila.
- **Ajustes:** objeto `GEL` no `index.html` (dano do lago, lentidão, tempo de congelar, granizo, quantidade de inimigos). A meta da missão está em `A('y','y_gelo',...)`. Ainda **não tem chefe** na ilha.


## Chefe final: Lúcifer (Soberba) · Cabeça Gélida
- **Onde:** aparece quando você chega a ~1,5 km do centro da ilha **Cabeça Gélida** (aberta pelo Contrato do Gelo, depois do Leviatã). O último e o mais difícil dos sete pecados: vida 90000 (Leviatã 60000), dano 105 (90), defesa maior (ignora 66%; 72% na fase 2; 90%/94% com a guarda fechada) e no máx. 0,9% da vida por golpe.
- **Ataques:** 24 padrões (leques, anéis, espirais, zonas de mira, rastros, cruzes, chuvas, muros, órbitas, poças, meteoros, coroas) + **Usurpação** + **Reflexos do Orgulho** + **Ultimato**. Fase 1 usa 12 padrões e a Usurpação; fase 2 (<50%, *Forma Ardente*, sprite vermelho) usa todos; fase 3 (<25%): mais dano, pausas curtas e os reflexos voltam.
- 👑 **USURPAÇÃO (ataque especial, não é o ultimato):** o aviso é um anel dourado em volta dele. Por 6,5 s (8 s na fase 2, 10 s na fase 3) **cada ataque e cada habilidade sua vira um ataque DELE e bate em você**. Ataque comum = bola dourada vinda dele (e de cada reflexo vivo); habilidade = padrão de zonas/projéteis em cima de você (o slot da habilidade define o padrão, tabela `LCU`). Seus golpes não saem e não gastam recarga nem energia. Limites: 1 ataque a cada 0,6 s e 1 habilidade a cada 1,1 s. O dash dá invulnerabilidade como sempre. Aparece uma faixa dourada no topo com a contagem; **o melhor é não atacar e desviar**. Intervalo mínimo de 13 s entre usurpações.
- 🪞 **Fase 2: duas cópias**, uma de cada lado da arena (±980 de distância). Cada reflexo tem 10% da vida dele, ataca com padrões roxos mais leves (70% do dano) e some quando Lúcifer cai. Enquanto houver reflexos vivos ele fica mais blindado (+3,5% de defesa por cópia). **Para matar Lúcifer é obrigatório derrubar as duas cópias:** enquanto houver reflexo vivo (ou antes da fase 2) a vida dele trava em 1 e ele não morre. Derrubar os dois o deixa ABALADO (dano total) por 2,4 s: é a hora do golpe final. Se ele recriar as cópias, ele volta a ser imortal até derrubá-las de novo. Ele recria os reflexos com o ataque *Reflexos do Orgulho* e ao entrar na fase 3. Os reflexos param de atacar durante o ultimato e quando ele está exposto. Os reflexos dão só 1 de ouro.
- **Ultimato (carrega em 26 s e dispara ao entrar na fase 2 e na fase 3):** fase 1 = *Eclipse da Soberba* (5 anéis de zonas + espiral); fase 2 = *Tríade do Orgulho* (espiral de 6 braços dele + espirais roxas cruzadas dos reflexos + zonas). Depois ele fica **EXAUSTO por 4 s**.
- **Recompensa:** 120000–160000 de ouro, 8–12 **Cacos de Espelho Dourado** (material da Soberba), **cumpre o pecado da Soberba** (+1 nível de pecado, se ainda não cumprido) e a conquista **Fim da Soberba** (`bluc`, missão `e_luc`).
- **Código:** bloco `LÚCIFER · A SOBERBA` (novo `<script>` logo depois do bloco do Leviatã). Ajustes: `LCB` (vida, dano, velocidade), `LCD` (defesa, usurpação `us/us2/us3/usCd/usAt/usSk/usDm`, reflexos `cloneHp/cloneDm/cloneX/cloneDf`, ultimato `ult/exh/exp`), `LCR` (receita de cada ataque), `LCA1/LCA2/LCAC` (listas de ataques da fase 1, fase 2 e dos reflexos) e `LCU` (o que cada habilidade vira quando usurpada). Sprites (frente, costas, esquerda, direita + versão ardente) embutidos em base64 em `LCI`. Também foram adicionados: tela de título e moldura (`FRM`/`PXC`), ícone 16x16 (`IC.lucifer`), elemento luz/fogo, `BOSSK` (material da Soberba) e a missão `e_luc`. Lúcifer é local (não é compartilhado no multijogador), como o Leviatã.

## Ilha nova: Útero Profano (Magnitude)
- **Onde fica:** na Magnitude, na célula ao lado do Nexus (cerca de 24 mil px a **leste** do Nexus da Magnitude). É uma ilha única e fixa (igual para todos no multijogador); aparece no minimapa (🩸) depois de explorada.
- **Não dá para desembarcar:** o navio só **sobrevoa**. O botão "Desembarcar" não aparece, a tecla R mostra um aviso e a ilha nunca conta como terra firme (`nearLand` e `landOK` a ignoram). Não tem vila, baús, monstros nem chefe.
- **Visual (feito a partir do desenho):** carne vermelha e rosa. Corpo largo cheio de casas amontoadas (janelas quadradas, redondas, triangulares e em arco; algumas acesas), **cúpula central com costelas e uma torre com luz no topo**, dois braços que descem com uma **esfera de costelas** no fim de cada um, duas dobras em V com espinhos, veias, poros e um **colo com pingos de carne** pendurados (alguns soltam gotas). A ilha "bate" como um coração (veias e brilho pulsam) e o navio passa por cima da cidade.
- **Desempenho:** a cidade tem 3 níveis de detalhe (perto, leme e longe) para não pesar no celular.
- **Ajustes:** bloco `MAGNITUDE · ÚTERO PROFANO` no `index.html` (procure por `UTC`): posição/escala (`UTC`), formas do corpo (`CMP`), cores das casas (`UTP`) e as quantidades de casas, veias, poros e pingos dentro de `utGeo`. Para mudar o lugar da ilha, troque `cx`, `cy`, `dx`, `dy` em `UTC`.

## Diário de Bordo
- O diário fica numa **mesa na cabine do navio** (parede do fundo), aberto como um livro; a mesa é uma **mesa de navegação** cheia de mapas e instrumentos, e ao chegar nela rola uma **cena**: a tela vira a mesa vista de cima, com o livro subindo no meio; **não há botão nem tecla**: é só andar até a mesa. Esc ou X fecha. Cada troca de aba (Bestiário, NPCs, Itens, Biomas) **passa uma folha** do livro. Quatro abas: **Bestiário** (criaturas e chefes: vida, dano, ataques, abates), **NPCs** (o que cada um disse), **Itens** (armas, acessórios e navios) e **Biomas** (avistado/visitado, criaturas e chefe).
- Tudo começa como `???` e vai sendo preenchido sozinho enquanto você joga. Um aviso aparece a cada descoberta nova.
- **Sprites em pixel art (16x16):** cada entrada do diário usa um sprite desenhado na paleta do jogo, com contorno escuro (criaturas, chefes, biomas, armas, acessórios, navios e NPCs sem ícone). Os chefes reaproveitam os ícones 16x16 da barra de vida. Os sprites ficam no bloco `SPRITES 16x16 DO DIÁRIO` do `index.html` (`m:` criaturas, `o:` biomas, `a:` acessórios, `w:` armas, `s:` navio, `n:` NPC); para trocar um, edite as linhas dele (`h` = metade esquerda espelhada, `f` = quadro inteiro).
- **Multijogador:** o diário é por conta e servidor (chave `relicDiario_mp_<conta>_<servidor>_<semente>`; o diário antigo do aparelho é copiado na primeira vez) e viaja junto com o save da nuvem (campo `dj`, sem as falas dos NPCs), então abre igual em outro aparelho; ao carregar, junta com o local (maior contagem, data mais antiga).
- **Chefes compartilhados:** quando o servidor avisa a morte do chefe, o diário conta o abate, anota se foi **vitória com recompensa** (dano suficiente), se foi **em grupo** e **quem derrotou por último**. Chefe que já estava derrotado no servidor entra no bestiário como avistado. O topo mostra **👑 Chefes** (derrotados/total).
- Salva à parte, por mundo, no `localStorage` (chave `relicDiario_*`). Está no último bloco `<script>` do `index.html` (`window.DIARIO.reset()` apaga o diário do mundo atual).


## Ilha Sakura
Depois de derrotar o **Samurai Dragão Branco** surge, na célula vazia mais próxima do navio, uma **ilha de sakura** (bioma *Bosque de Sakura*: cerejeiras e pétalas, sem inimigos nem baús) com um **portal torii** no centro (só cenário, não leva a lugar nenhum). A posição fica salva no próprio save (chave `sakura:cx,cy` no conjunto `opened`). O código está no bloco `ILHA SAKURA` do `index.html`, logo antes do diário.


## Samurai errante (Samurai Dragão Branco)
- O Samurai Dragão Branco agora **vaga pelas ilhas**, igual ao Vagador: além da ilha da Baleia Celeste, ele aparece em parte das ilhas que não têm chefe normal nem Vagador (≈ 35% dessas), anda devagar pela ilha, para um pouco e continua. Cada ilha tem a sua chave `sam<seed>` (o servidor já aceitava esse formato: vida/nível somados, morte e renascimento de 15 min valem igual).
- **SEM a Katana Refletora**: é o samurai de sempre. Dorme/vaga até ser atacado, depois luta com os 8 ataques, e ao cair dá a katana de novo.
- **COM a Katana Refletora**: ele fica **pacífico e invulnerável** (nenhum golpe tira vida, não acorda, não ataca). Quando você chega perto ele para e solta frases sobre procurar o sentido da vida; se você bater nele, responde com uma frase curta. Se a katana sair do seu inventário (`OWNR[49]` falso), ele volta a poder ser derrotado.
- Tudo está logo depois do bloco do Samurai no `index.html`, em `SAMURAI ERRANTE`. Frases: `SAMW.L` (conversa) e `SAMW.H` (quando você ataca). Chance de aparecer: `H2(93,11,l.seed)>=.35` em `samWSpot`. Velocidade de caminhada: `70` em `samWalk`.

### Samurai errante no servidor (multijogador)
- O samurai errante usa o mesmo esquema *híbrido* dos outros chefes compartilhados (chave `sam<seed>`): **todos veem ele no mesmo lugar, andando junto**. O dono (jogador mais perto) manda a posição; quem não é dono só segue essa posição e anima as pernas. Se o dono sai, outro assume do ponto onde ele estava. Vida, nível, morte e renascimento (15 min) são os do servidor. Não precisou mudar o `server.js` nem o bloco `x-server`.
- **Katana é de cada jogador**: quem tem a Katana Refletora vê ele pacífico e não consegue feri-lo; quem não tem pode lutar com ele, e a vida compartilhada cai para todos. Se alguém sem katana o acorda, o samurai que o outro jogador (com katana) vê continua pacífico.
- Quem tem a katana entra no chefe compartilhado só como "espectador" (vida 10 e nível 1 na soma do servidor), então ficar perto **não deixa o samurai mais forte** para quem está lutando.
- Se o dono tem a katana e outro jogador está batendo nele, ele **fica parado** (alvo fixo) até 8 s depois do último golpe.
- Código: funções `samMark`, `samWalk` (ramo `m.sh&&m.rem`) e `samWTune` (`m.fight`) no bloco `SAMURAI ERRANTE`.

## Fragmento Carregado (Pulmão de Zeus)
- Novo **material** da mochila (aba *Materiais*, raridade **Lendário**): 🗡️ **Fragmento Carregado**, um caco de uma lâmina preta ainda cheio de raios. Fica salvo junto com os outros materiais (`MAT.fcarr`) e **não cai** de eventos nem de inimigos.
- **Onde pegar:** no **Pulmão de Zeus**, existe **1 fragmento por mundo**, cravado no chão num ponto fixo da ilha (muda de mundo para mundo, mas é sempre o mesmo no seu), entre 45% e 80% do raio da ilha, **fora** das vilas, templos e para-raios (ou seja, na área dos raios e dos inimigos). Ele brilha, solta faíscas e tem um anel dourado no chão. É só chegar perto (~110) para pegar. Depois de pego, some (chave `zfrag<seed>` no `opened` do save).
- A **Dodona, a Oráculo**, dá a dica numa das falas.
- O item ainda **não é usado em nenhuma receita**. Para usar em algo (ex.: arma de lâmina preta), é só pôr `fcarr` no custo (`cost`) da receita.
- Código: `fcarr` em `MATS`/`MR`/`MSRC`; objeto `frag` no fim de `zeuBuild`; coleta em `zeuPlay` (`zfrag`); desenho em `zeuFrag`.

## Entregar o Fragmento Carregado ao Samurai errante
- Com a **Katana Refletora** (samurai pacífico) e pelo menos 1 🗡️ Fragmento Carregado na mochila, chegue perto (~200) do Samurai Dragão Branco errante: o fragmento é entregue automaticamente (-1 fragmento), ele comenta e você ganha **+3000 de ouro**.
- Sem a katana ele é hostil e não aceita a entrega. Código: bloco "ENTREGAR O FRAGMENTO CARREGADO" logo antes de "GARRA DO REI ALMÔNDEGA" (`SAMW.fq` = falas).
- **Agradecimento + história:** ao receber o fragmento ele agradece. Depois da 1ª entrega, nas **próximas 11 aparições** do samurai errante (com a katana) ele comenta como o fragmento mudou (calma → do tamanho da mão → adaga → … → katana). Falas em `SAMW.fh`; progresso salvo em `OPENED` (`samfq:N`).
- **Troca de ilha:** o samurai errante muda de ilha a cada **8 minutos** (relógio real, `SAMW.EP`). Quando a época muda e a ilha dele não o recebe mais, ele se despede e some; outra ilha passa a recebê-lo. Não sai no meio de uma luta (acordado/apanhando) nem em chefe compartilhado no multijogador.
- **12ª aparição na ilha de sakura:** depois das 11 falas, o passeio normal do samurai pausa (se a ilha de sakura já existe) e a 12ª aparição acontece obrigatoriamente na ilha de sakura, com uma fala final (`SAMW.fin`). Depois disso ele volta a vagar normalmente.
- **Multijogador:** o contador é **do servidor** (arquivo `samfrag.json` em `DATA_DIR`, por servidor/sala). Basta uma pessoa entregar o fragmento para o contador começar para todos (qualquer jogador que encontre o samurai conta uma aparição, uma vez por ilha/época). Mas **só quem entregou o fragmento vê as falas** (`samgave` no save de cada jogador). Mensagens novas: `sfg` (entregou), `sfq` (aparição), `sfr` (resposta). Atualize o `server.js` no Render junto com o `index.html` (a cópia embutida no index.html também foi atualizada).
- **Aviso da 12ª aparição:** quando a 12ª aparição acontece, aparece um aviso **rosa** com 🌸: “O guardião se lembrou de quem ele é” (`SAMW.ann`). No multijogador o servidor manda para **todos os jogadores do servidor**, tenham entregado o fragmento ou não; no solo aparece para o jogador.
- **Fala na ilha de sakura:** quando você chega perto dele (ou bate nele) na ilha de sakura, em vez das falas aleatórias ele diz sempre a fala do propósito / Mesa dos sugosha (`SAMW.sk`), com intervalo de 16 s entre repetições.


## Yomi Tempestade Maldita (espada lendária única)
- **O que é:** a lâmina negra de raios (cabo azul, guarda dourada, brilho ciano na base). Arma **branca** (classe Espada), dano 150, **elemento raio + sombra** (`ELM_W`). Aparece no inventário (Tab) quando é criada.
- **Como conseguir:** na **Oficina de Criação** (NPC Dona Fagulha), seção *Armas de Oficina*. Custo: 🗡️ 1 Fragmento Carregado + 💠 12 Cristal de Nuvem + ⭐ 8 Poeira Estelar + 🌈 4 Cristal Prisma + ⚙️ 8 Engrenagem Mecânica. (O Fragmento Carregado é o do Pulmão de Zeus; só existe 1 por mundo. Se quiser entregá-lo ao Samurai errante **e** forjar a espada, mude o custo em `CRAW.push` no fim do `index.html`.)
- **6 habilidades (Z X C V B N):**
  1. ⚡ **Corte Relâmpago** (150 · 3 s): teleporta para a frente cortando tudo no caminho, com onda de raio na chegada.
  2. 🌩️ **Cadeia de Trovões** (220 · 6 s): um raio que salta por até 8 inimigos (sem inimigos, 3 raios caem à frente).
  3. 👣 **Passo do Trovão** (260 · 8 s): teleporta para as **costas** do inimigo mais próximo e dá 3 cortes, o último com trovão.
  4. 🌀 **Ciclone Elétrico** (300 · 10 s): gira por 1 s, puxando os inimigos e cortando em volta; invulnerável enquanto gira.
  5. ⛈️ **Tempestade Maldita** (380 · 12 s): área de tempestade (~4 s) que derruba raios e aplica maldição (sangramento).
  6. ☠️ **Julgamento de Yomi** (550 · 18 s): até 5 teleportes encadeados com trovão em inimigos diferentes e, no fim, um pilar de raios em área (muito dano).
- **Teleporte:** é um *dash* curtíssimo e muito rápido (reaproveita a colisão do jogo, então não atravessa o mar nem sai da ilha) e você fica invulnerável enquanto dura. Função `yTp`.
- **Onde mexer:** o registro da arma (nome, dano, custo da receita, elemento) fica no **último `<script>`** do `index.html` (registrada por último de propósito, para não mudar o índice das outras armas e os saves antigos continuarem valendo). As habilidades ficam no bloco `YOMI TEMPESTADE MALDITA`, logo depois do Punho Estrela (`YOMK`, números de dano em `w.dmg × fator`); o sprite é `IMW.yomi`.
- **Testar:** no console, `yomiLiberar()` libera a espada direto.


## Corpo dos NPCs (mesmo corpo do jogador)
- Todos os NPCs humanos (menos os que viram chefe: Samurai, Nyx, Capitão Fantasma, Guardião Tubarão etc.) agora usam o **mesmo corpo do jogador** (16x22, 4 direções, olhando para você quando você chega perto), cada um com cabelo, chapéu, roupa, sapato, acessórios e ferramenta próprios (ferreiro de avental, barba e martelo; cozinheira de touca e concha; guardas de elmo e lança...).
- Inclui vilas, castelo, NPCs de missão, Mestra Vera, Orvalho, Tio Baú, Dona Espuma, Tobias, Mestre Lian, Madame Gene, Morgana (Nit), Homem em chamas e os moradores do Pulmão de Zeus. Ficaram como estavam: Homem petrificado (estátua), Gato preso, corujas e os chefes.
- **Onde editar:** `NPCX.LOOK` (script "CORPO DOS NPCs" no fim do `index.html`), chave = nome do NPC. O cabeçalho do script lista estilos de cabelo, chapéus, roupas, acessórios e ferramentas. NPC fora da tabela recebe um visual automático (cor do NPC + cabelo/chapéu sorteados pelo nome).


## Chefes em pixel art com line art
- Os 8 chefes das ilhas (**Rei Caranguejo, Guardião Tubarão, Ent Ancestral, Colosso Glacial, Titã de Magma, Kraken da Lagoa, Rei Escorpião, Águia-Trovão**) agora são desenhados em pixel art com contorno em cada parte (line art), luz no canto superior esquerdo e sombra no inferior direito. Continuam animados (pernas, garras, tentáculos, asas), ficam brancos ao levar dano e mantêm o brilho vermelho do modo enfurecido.
- Os chefes que já tinham sprite próprio (pecados, Mammon, Nyx, Vagador, Zeus etc.) não foram tocados.
- **Onde editar:** script "CHEFES EM PIXEL ART" no fim do `index.html` (`PXB.BOSS`, uma entrada por chefe, chave = tipo do monstro). Para redesenhar outro chefe, copie uma entrada e use as formas `E, Ci, Pg, Ln, Bz, Er, dot`. 1 pixel = 4 unidades do mundo.

## Príncipe Cúmulo (Castelo Nuvem)
- Fica no meio do castelo, um pouco à frente do torreão, entre os dois guardas. Por enquanto só se vangloria e fala coisas arrogantes.
- **Balão de fala:** quando você chega perto, ele solta uma frase a cada ~7 s e "empina o peito" a cada frase nova.
- **Falar com ele:** 3 falas sorteadas a cada conversa (abertura + vanglória + despedida).
- Tudo está num bloco `<script>` próprio, logo depois do bloco "Castelo Nuvem cheio", começando em `PRÍNCIPE CÚMULO`. Posição em `PRN_DX/PRN_DY`, nome em `PRN_NAME`, falas em `BRAG` (balão) e `OPEN`/`MID`/`END` (conversa). O sprite (40x32) são as linhas `PRN_ROWS` com as cores de `PRN_PAL`.

## Portal de pétalas (tori da ilha de sakura)
- Antes de derrotar o Shirogane Ryu o tori é só o arco. Quando ele cai (você ou, no multijogador, qualquer jogador), pétalas de toda a ilha voam em espiral até o tori (as primeiras saem de onde ele caiu), vão se juntando dentro do arco e formam um portal que explode em luz no fim (~8,6 s, com som e tremor leve).
- Depois disso o portal fica aceso para sempre (chave `shiro-portal` no save). Se o Shirogane for derrotado de novo, a animação toca outra vez.
- Com o portal aceso, andar até ele leva à **Kōmyō no Mori** (veja abaixo).
- Código: bloco `PORTAL DE PÉTALAS` (depois do Shirogane Ryu); o desenho é chamado pelo bloco `ILHA SAKURA` (`SAKP.back` e `SAKP.front`). Ajustes: `TF` (duração), `N` (nº de pétalas), `CL` (cores).

## Kōmyō no Mori (光明の森) · dimensão do portal
- Ande até o portal aceso da ilha de sakura (depois de derrotar o Shirogane Ryu): clarão, tela some e você chega na floresta.
- Ilha especial enorme (célula `KC` = 1800,1800; raio `KR`) sem inimigos nem baús: cerejeiras gigantes, bambus, pétalas e raízes no chão, templos em ruínas com musgo, luz dourada, raios de sol e pétalas caindo na tela.
- Som (WebAudio próprio): vento, água corrente e sinos de vento em intervalos aleatórios (`AUD` = volumes).
- Saída: torii de pedra no centro da floresta; leva de volta ao portal da ilha de sakura. Se desmaiar, acorda no navio como sempre.
- Código: bloco `KŌMYŌ NO MORI` do `index.html`, logo antes do diário. Ajustes: `KC`, `KR`, `RUINS`, `AUD`.
- Ideias para a próxima etapa: inimigos/chefe, itens nos templos, trilha de sinos que guia o jogador, loop "infinito" até seguir um sinal.

### Kōmyō no Mori como continente (Japão fantástico)
- Ilha de raio `KR` = 34000 (as 8 células vizinhas ficam vazias). Tudo é desenhado em coordenadas relativas ao torii de saída (0,0); o norte é para cima (y negativo).
- **Estrada** (`ROAD`) do torii até Takayama passando por 3 vilas (`VILS`): Sakura-mura, Mizuumi-no-sato e Takayama, com casas (`HOUSES`) e portões torii.
- **Lagos de verdade** (`LAKES`): água animada, não dá para andar dentro. **Montanhas** (`MTS`) bloqueiam o caminho; a maior é o Monte Fuji (neve no topo).
- **Lojas** em 3 vilas (`SHOPS`): chegue perto do vendedor e o painel abre (onigiri, chá, ramen... gastam ouro e curam vida/núcleo).
- **Altares** (`ALTARS`): restauram vida e núcleo (recarga de 90 s). **Acampamentos** (`CAMPS`): curam devagar por perto.
- **NPCs** (`NPC`): 13 personagens com falas que aparecem em balões quando você chega perto. Edite posições, falas e preços nesses vetores.

### Materiais da Kōmyō no Mori: Caveira Angelical e Caveira Demoníaca
- São dois materiais **separados** (`MAT.skullA` e `MAT.skullD`), guardados na mochila como os outros materiais e salvos no save. Cada ponto de coleta vale uma vez.
- **Angelical** (auréola e asas): 2 pontos, ao lado do Altar dos Ancestrais e do Santuário do Monte Fuji. **Demoníaca** (chifres e olho rosa): 3 pontos escondidos, longe das vilas (leste, oeste e nordeste).
- Brilham no chão (dourado e rosa) e são coletados ao chegar perto. Posições e cores: vetor `SKP` no fim do bloco. Os ícones são o pixel art enviado, embutido no código.

## Ilha nova: Coluna do Colosso (Magnitude)
- **Onde fica:** ilha fixa (igual para todos) na célula 2 ao **norte** do Nexus da Magnitude (~72 mil px). Dá para desembarcar e andar.
- **A coluna:** 16 vértebras largas (cada uma com ~7 mil px de largura) do rabo (sul, lombar) ao **pescoço** (norte, vértebras estreitas). Discos entre as vértebras, canal e processos espinhosos desenhados no chão.
- **Arena das Costelas (centro):** praça redonda enorme (raio 5000) com anéis, símbolo de caveira no meio e 8 braseiros. Em volta, um muro de costelas com **dois portões** (norte e sul, alinhados com a coluna); os portões são o único jeito de entrar. Mais 12 costelas gigantes saem pelos lados por cima do mar.
- Sem inimigos nem baús por enquanto. As duas células vizinhas (norte e sul) ficam vazias, porque a coluna passa por elas.
- **Ajustes:** bloco `COLUNA DO COLOSSO` no `index.html`: `VT` (vértebras), `AR` (arena), `GW` (portões), `CX`/`CY` (lugar).

### Coluna do Colosso: costela quebrada e buraco escuro
- **Costela quebrada:** a costela do meio do muro, a **leste**, está partida: duas pontas com farpas, uma **brecha** de passagem (um terceiro portão, `BR` = abertura) e pedaços de osso caídos dentro da arena.
- **Buraco escuro (centro da arena):** substitui o símbolo da caveira. Borda de osso rachada, centro negro e tentáculos e fumaça escura que vazam e sobem (animados). É **sólido** (não dá para entrar; raio `HR`) e a tela escurece conforme você chega perto (a até ~3000 px).

### Caveiras no buraco escuro
- Chegando perto da borda do buraco, abre um painel com os dois encaixes: **Caveira Angelical** (oeste) e **Caveira Demoníaca** (leste). Cada botão gasta 1 do material (`MAT.skullA`/`MAT.skullD`) e só aparece se você tiver. Fechar o painel não o reabre até você se afastar.
- As caveiras colocadas ficam na borda do buraco (com o pixel art e um brilho dourado/rosa) e **ficam salvas** (chaves `hole-a` e `hole-d` no save). Quando as duas estão lá, dois arcos de luz (dourado e rosa) giram em volta e o jogo avisa. Por enquanto não acontece mais nada: o próximo efeito é livre para definir.

## Chefe: Cassiel · o 8º pecado, a Recusa (Vagador despertado)
- **Como surge:** coloque as **duas caveiras** (Angelical e Demoníaca) no buraco escuro da Arena das Costelas (Coluna do Colosso, Magnitude). Cassiel desperta do buraco. Se recarregar o jogo com as duas já colocadas, ele desperta de novo ao entrar na arena (até ser vencido).
- **Base do Vagador:** mesma defesa de osso (um golpe tira no máx. 3% da vida), teleporte espontâneo, **paralisia** (você perde a vontade de lutar), combos e ultimato com exaustão. Código: bloco `CASSIEL` no fim do bloco do Vagador (usa as funções dele). Vida 11000, dano 34 (`BCAS`).
- **Fase 1:** sprite com caveira de olhos vermelhos. **Fase 2 (abaixo de 50%):** cabeça em chamas e mais ataques (12 do Vagador + os dele).
- **Ataques dele:** Recusa do Céu e do Inferno (anéis dourados/roxos), Vazio Devorador (some, aparece atrás de você e **paraliza**), Cabeça em Chamas (só fase 2: leque de fogo). **ULT: O Oitavo Pecado** (3 feixes giratórios; depois ele fica EXAUSTO).
- **As duas caveiras** flutuam em volta dele, invulneráveis (somem quando ele cai), cada uma com IA própria:
  - **Angelical** (lança): Lança Celeste (marca a linha e investe), Chuva de Penas, Juízo (círculos sagrados). **ULT Trombeta do Juízo:** 8 raios de luz.
  - **Demoníaca** (foice girando): Giro Ceifador (gira atrás de você soltando espirais), Chama Infernal, Pacto Maldito (círculo que **paraliza**). **ULT Eclipse Infernal:** anéis roxos que se expandem.
  - Tempos em `SKC` (pausas e primeiro ultimato de cada uma: 24 s e 36 s).
- Recompensa: ouro (20 a 30 mil). Sem item exclusivo ainda.


## Coleta de materiais (madeira, pedra, nuvem e mais)
- As árvores, pedras, nuvens, cristais de gelo, cactos, corais, conchas e colunas que já existiam nas ilhas agora são **pontos de coleta**. Os prontos têm um brilho ✦ e o ícone do material flutuando em cima. Chegue perto e toque no botão **Coletar** (ou **E**). Na primeira vez o jogo avisa.
- **O que cada um dá:** árvore/palmeira → 🪵 Madeira (palmeira também 🥥 Coco) · pedra/rochedo → 🪨 Pedra (rochedo de vulcão também 🌋 Obsidiana) · espinho de vulcão → 🌋 Obsidiana · gelo/espinho de geleira → ❄️ Gelo Eterno · cacto → 🌵 Fibra de Cacto · coral → 🪸 Coral · concha → 🐚 Concha · coluna/entulho/estátua → 🏛️ Mármore · oliveira → 🪵 Madeira e 🫒 Azeitona · torre de nuvem → ☁️ Nuvem Macia.
- Cada ponto **esgota e renasce em 8 minutos** (o desenho fica, só o brilho some). Os pontos esgotados ficam salvos junto com o jogo (`DNX.snap`, campo `rn`). A coleta é de cada jogador (não é compartilhada no multijogador).
- Os materiais aparecem na aba **Materiais** da mochila (raridade Comum a Incomum; Obsidiana é Rara) e **não caem** de eventos. Ainda não entram em receitas da Oficina.
- **Onde mexer:** bloco `COLETA DE MATERIAIS` (último `<script>` do `index.html`): `RESP` (minutos para renascer), `REACH` (alcance), `DEF` (o que cada coisa dá: `[material, mín, máx, [extra, chance, mín, máx]]`). No console: `COLETA.give('r_wood', 50)` dá 50 de Madeira e `COLETA.resetAll()` renova todos os pontos.

## Bancadas (Serraria, Mesa do Escultor, Bigorna, Forja, Tear, Alquimia)
- Criadas na **Oficina de Criação** (Dona Fagulha), seção **🏗️ Bancadas**, com os materiais da coleta. Cada uma só se faz uma vez e fica na mochila (**Tab → aba Bancadas**).
- **Custos:** 🪚 Serraria: 12 Madeira + 4 Pedra · 🗿 Mesa do Escultor (mármore e pedra): 10 Pedra + 6 Mármore + 4 Madeira · ⚒️ Bigorna: 8 Pedra + 4 Carcaça de Arma + 2 Engrenagem · 🔥 Forja de Obsidiana: 8 Pedra + 4 Obsidiana + 4 Madeira · 🧵 Tear de Fibras e Nuvens: 8 Fibra de Cacto + 6 Nuvem Macia + 6 Madeira · ⚗️ Mesa de Alquimia: 6 Madeira + 4 Coral + 4 Concha + 3 Gelo Eterno.
- **Agora podem ser colocadas em terra sua** (seção Construção). Ainda não há receitas que as usem. Ficam salvas em `OWN2['b_<id>']`.
- **Onde mexer:** bloco `BANCADAS` (último `<script>`): lista `LIST`. A seção da Oficina e a aba da mochila são ligadas por `BANC.sec`, `BANC.craft` e `BANC.items` (pontos pequenos no `cfRender`, `craft`, `tabs` e `items` do `index.html`). Console: `BANC.give('serra')`.

## Mapa por chunks (Y = altura, X = largura) e Terras do Príncipe Cúmulo
- **Nomes dos chunks:** agora `Y` é a altura (linha) e `X` é a largura (coluna), começando em 1 na ilha de partida: **Y1X1**. Exemplo: `Y1X5` = linha 1, coluna 5. Para o norte/oeste da partida os números passam por 0 e ficam negativos (`Y0X-2`). Aparece na barra de baixo do jogo ("Chunk Y1X5"), no mapa grande (números nas bordas e o nome dentro de cada chunk) e nas mensagens. O código está em `CHK` (`col`, `row`, `name`).
- **Comprar terras:** fale com o **Príncipe Cúmulo** (castelo de nuvens). Depois da última fala o **mapa grande abre em modo de compra**: toque num chunk, veja o nome, quantas ilhas ele tem e o preço, e toque em **Comprar** (gasta ouro). Arrastar e dar zoom continuam funcionando.
- **Regras:** só dá para comprar chunk que você já explorou (pelo menos um quadrado visto no mapa); o chunk do castelo não está à venda; cada chunk só se compra uma vez. **Preço** = 2.500 + 2.500 por ilha que toca o chunk (máximo 40.000). Chunk só de mar custa 2.500.
- As terras compradas ficam **pintadas de dourado com 🏡** no mapa, são salvas junto com o jogo (`OPENED`, chave `terra:i,j`) e, ao entrar numa delas, o jogo avisa "Terra sua". No multijogador cada chunk tem um único dono por servidor e ele pode dar permissão a amigos (veja Construção). **Agora dá para construir nelas (veja abaixo).**
- **Onde mexer:** bloco `TERRAS DO PRÍNCIPE` (último `<script>`): `PRECO` (base, ilha, max) e a fala `OFERTA`. Console: `TERRAS.give(0,0)` dá o chunk Y1X1, `TERRAS.open()` abre a tela de compra, `TERRAS.list()` lista as suas.

## Construção nas terras compradas
- Em **terra sua** (chunk comprado do Príncipe Cúmulo) aparece o botão **🏗️ Construir**. Escolha a peça no painel de baixo e **toque no chão** para colocar (arraste para pintar vários). **🗑️ Recolher** remove a peça e devolve 100% dos materiais.
- **Peças** (grade de 80 px, custo em materiais da coleta): Piso de madeira, de pedra e de gelo (andáveis) · Parede de madeira e de pedra, Bloco de nuvem, Bloco de obsidiana, Coluna de mármore, Cerca (sólidas) · Porta (andável).
- **Bancadas** (Serraria, Escultor, Bigorna, Forja, Tear, Alquimia): aparecem no painel quando você as tem, são colocadas no mundo (sólidas) e voltam para a mochila ao recolher. Ainda não há receitas que as usem.
- **Regras:** só em chão firme e dentro de chunk seu; não dá para colocar peça sólida em cima de você. Paredes, colunas, cercas, blocos e bancadas **bloqueiam** o personagem (a colisão entra em `landOK`).
- **Cada chunk tem um dono só (multijogador).** Quem compra primeiro leva: o servidor guarda o dono de cada chunk em `data/builds.json` e recusa a compra de quem chegar depois ("Essa terra já tem dono"). O ouro só é gasto depois que o servidor confirma. No mapa de compra, as terras dos outros aparecem em azul com 🔒 e o nome do dono. Quem já tinha comprado antes disso tem as terras registradas ao entrar; se outro jogador já era dono de um chunk, o ouro daquela compra é devolvido.
- **Amigos:** dentro da sua terra, no painel Construir, o botão **👥 Amigos** abre a lista. Digite o nome de usuário exato do amigo e toque em Adicionar (✖ tira a permissão). Amigo (até 20 por terra) **constrói e recolhe as próprias peças** na sua terra; **só você vende** e só você recolhe as peças dos outros. Quem não é dono nem amigo vê e esbarra nas peças, mas não constrói ("Terra de fulano").
- **Peças no servidor:** todos os jogadores veem as peças em tempo real. Quem entra num chunk recebe as peças dele (`Kq` → `Ks`); cada peça nova ou recolhida vai para todos (`Kp` → `Kc`).
- **Limites:** 4000 peças e 300 chunks por jogador, 80 ações por segundo.
- **Offline / só você:** continua funcionando e salva junto com o jogo (`DNX.snap` → `bld`). Ao entrar num servidor, o que você já tinha construído é enviado de uma vez (`Km`).
- **Servidor:** a lógica está em `server.js` (bloco `CONSTRUÇÕES`: `BLD_OK` precisa ter os mesmos ids de `PECAS` do jogo). A cópia do servidor embutida no `index.html` (bloco `text/x-server`) foi atualizada e agora é idêntica ao `server.js`: os dois jeitos de ligar o servidor têm as construções. Ao mudar o `server.js`, copie o conteúdo de novo para esse bloco.
- Limitações: o servidor não confere ouro, materiais nem se o chão é firme (o cliente confere); monstros ainda atravessam paredes. Mensagens novas: `Kl` compra · `Kn` terras antigas · `Kr` lista de donos (`Ka`) · `Kf` amigos · `Ko` mudança de dono/amigos · `Kk` resposta.
- **Onde mexer:** último `<script>` do `index.html`, bloco `CONSTRUÇÃO NAS TERRAS COMPRADAS`: `PECAS` (nome, custo, cor, tipo de desenho), `S` (tamanho da célula). O desenho entra na fila de profundidade via `BLD_PUSH(D)` (chamado perto de `RMT_PUSH`). Console: `BLD.give('r_wood',100)`, `BLD.open()`, `BLD.list()`, `BLD.clear()`.

## Desafios do Capitão (conteúdo solo)
Menu Informações (tecla I) → botão **📅 Desafios do Capitão**. Salvo no navegador (chave `npv_solo_<semente>`), vale também para quem joga sozinho no servidor.
- **Contratos do dia**: 3 por dia (fácil, médio, difícil) sorteados pela data; ao cumprir os 3 vem o **Baú do Dia**. Faixa no topo mostra o próximo contrato.
- **Sequência de login**: 7 dias com recompensa crescente; o 7º dia dá o baú semanal. Faltou um dia: recomeça.
- **Bestiário**: marcos de abates por criatura (10/50/150/500) e por chefe (1/5/15/40) que dão ouro.
- **Patentes**: de Grumete até Rei dos Sete Céus; cada patente dá ouro, XP e 💀.
Para ajustar: edite `TPL`, `STREAK`, `BST`, `BSTG`, `BOSTG` e `RANKS` no começo do módulo (procure "DESAFIOS DO CAPITÃO" no index.html).

## Conta na nuvem (login ao abrir o jogo)
- Ao abrir o jogo (navegador ou APK) aparece a tela de **login/criar conta**. Só depois o menu principal. A sessão fica no `sessionStorage`: o login é pedido de novo cada vez que o jogo/app abre.
- **Saves (slots 0 a 4), missões, Diário de Bordo, Desafios do Capitão, visual e demais progresso** são enviados para a conta alguns segundos depois de gravar (e ao fechar/esconder a página). Servidor: `POST/GET /api/cloud`, arquivo `DATA_DIR/cloud/<usuário>.json` (limite de 12 MB por conta).
- O aparelho guarda só um **cache** da conta. **Sair da conta** (botão no menu principal) apaga esse cache. Outra pessoa que entrar no mesmo aparelho não vê os dados da anterior.
- Saves antigos que só existiam no aparelho sobem para a primeira conta que entrar nele. Se a mesma chave existir na nuvem e no aparelho, vale a da nuvem.
- O multijogador usa essa mesma conta (não pede senha de novo). A sessão vale 7 dias no servidor; se expirar no meio do jogo, aparece o login e o que ficou pendente é enviado depois.
- Endereço do servidor: `HOST` no começo do bloco "CONTA NA NUVEM" do `index.html` (igual ao `MP_HOST_DEFAULT`): `https://relic-of-the-clouds.onrender.com`.
- **Importante (Render grátis):** o disco do plano grátis é apagado quando o serviço reinicia. Para as contas e os saves não sumirem, use disco persistente (`DATA_DIR` apontando para ele) ou um backup externo de `users.json` e da pasta `cloud/`.

## Backup das contas e saves no GitHub (resolve o disco apagado do Render grátis)
O Render grátis apaga o disco a cada reinício. Com o backup ligado, o servidor copia **tudo de `DATA_DIR`** (contas, saves na nuvem, mapa explorado, terras, mercado…) para um **repositório privado do GitHub** (cada arquivo compactado em `data/<caminho>.gz`) e, se subir com o disco vazio, **baixa tudo de volta antes de ler as contas**.

**Como ligar (uma vez, uns 3 minutos):**
1. No GitHub, crie um repositório **privado** (ex.: `relic-backup`). Pode ficar vazio.
2. GitHub → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate. Em "Repository access" escolha **Only select repositories** → o `relic-backup`. Em "Permissions → Repository permissions" ponha **Contents: Read and write**. Copie o token.
3. No Render → seu serviço → **Environment** → adicione:
   - `BACKUP_GH_TOKEN` = o token
   - `BACKUP_GH_REPO` = `seu-usuario/relic-backup`
   - (opcional) `BACKUP_GH_BRANCH` (padrão `main`) · `BACKUP_MIN` (minutos entre backups, padrão 5)
4. Salve e faça o deploy. Nos logs deve aparecer **"Backup no GitHub ligado"** e, em até ~1 minuto, **"Backup: N arquivo(s) enviado(s) ao GitHub"**.

**Como funciona:**
- Envia só o que mudou, a cada `BACKUP_MIN` minutos, na manutenção e ao desligar (SIGTERM). Numa queda brusca podem se perder, no máximo, os últimos minutos.
- Ao subir **sem `users.json` no disco**, restaura do repositório. Se o GitHub estiver fora do ar nessa hora, o servidor **encerra** (a hospedagem tenta de novo) em vez de começar vazio e sobrescrever o backup.
- Sem `BACKUP_GH_TOKEN`/`BACKUP_GH_REPO` nada muda: os dados ficam só no disco, e o log avisa "Backup no GitHub desligado".
- O repositório guarda as contas (senhas só como hash scrypt com sal) e os saves de todo mundo: **mantenha-o privado** e não compartilhe o token.
- O histórico do repositório cresce com o tempo; se ficar grande, aumente `BACKUP_MIN`. Com um disco persistente pago do Render (`DATA_DIR` apontando para ele) o backup vira só um seguro extra.
