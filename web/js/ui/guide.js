// SI disclosure: parts of this file were drafted with an AI coding assistant and reviewed by Kristen and Arthur.
// The keyboard guide: every shortcut of the app, grouped by where it works.
// This list is the single written source of the shortcuts; the guide dialog is built from it.
// Each section is a heading and a list, so a screen reader can jump between sections by heading
// and read one "key: action" line at a time.

// Each row is [keys, action]: keys holds only real keys (shown in <kbd>); every qualifier is in
// the action text. A section with pointer: true lists gestures instead of keys (no <kbd>).
export const GUIDE = {
  en: [
    {
      title: "Tour and remote",
      rows: [
        ["Down arrow, Up arrow", "wherever the focus is: next and previous place (the tour's stops during the tour, every place of the record otherwise)"],
        ["Right arrow, Left arrow", "wherever the focus is: switch to the fire record, switch to the sea record"],
        ["Space, Enter", "play, pause and continue (on another button they press that button); the tour starts again only with its button"],
        ["Esc, S", "stop the tour, or all sound (some screen readers keep Esc for themselves: S works too)"],
        ["Tab", "move to the next control; the full place list comes after the remote"],
        ["?", "open this guide"],
      ],
    },
    {
      title: "Place list",
      rows: [
        ["Up arrow, Down arrow", "choose a place and hear it; after a moment it plays through time from its first date (moving on cancels it)"],
        ["Space, Enter", "play, pause, and continue from where it stopped; at the end of the record, play it again"],
        ["Home, End", "first and last place"],
        ["A … Z", "jump to the next place that starts with that letter (the letters below that are shortcuts keep their shortcut)"],
      ],
    },
    {
      title: "More keys",
      rows: [
        ["C", "compare two dates"],
        ["L", "sound legend"],
        ["V", "say the value under the needle"],
        ["W", "say the place under the needle, with its latitude and longitude"],
        ["D", "describe this date: places with the highest and lowest values"],
        ["N", "next place"],
        ["Shift + N", "previous place"],
        [",", "previous date (comma)"],
        [".", "next date (period)"],
        ["+, =", "zoom in on the globe (plus or equals)"],
        ["-", "zoom out from the globe (minus)"],
        ["H", "open this guide"],
        ["G", "voice guide (synthetic voice) on or off"],
        ["S", "stop all sound"],
      ],
    },
    {
      title: "Date slider",
      rows: [
        ["Left arrow, Right arrow", "previous and next date"],
        ["Home, End", "first and last date"],
      ],
    },
    {
      title: "Mouse and touch",
      pointer: true,
      rows: [
        ["Click", "on a place in the list: choose it; it plays through time after a moment"],
        ["Click", "on the place that is playing: pause or continue"],
        ["Click", "on a dot on the globe or on the NASA frame: go there and hear it (a dot of the other record switches record)"],
      ],
    },
    {
      title: "Phone with a screen reader",
      pointer: true,
      rows: [
        ["Remote", "the first buttons on the page, at the bottom of the screen: Pause or Play, Next place, Previous place, Switch to fire or sea, Stop or Start the tour"],
        ["Swipe right or left", "next or previous control (TalkBack, VoiceOver)"],
        ["Double tap", "on Start sound, a record or a button: activate it; on a place: choose it and play it, and again to pause or continue"],
        ["Date slider", "change the date (VoiceOver: swipe up or down; TalkBack: volume keys)"],
        ["Vibration", "Android, Chrome or Samsung Internet: count the pulses, 1 low to 5 high; a rough buzz is no data"],
      ],
    },
  ],
  "pt-BR": [
    {
      title: "Passeio e controle remoto",
      rows: [
        ["Seta para baixo, Seta para cima", "onde estiver o foco: próximo e anterior lugar (as paradas durante o passeio, todos os lugares do disco fora dele)"],
        ["Seta para a direita, Seta para a esquerda", "onde estiver o foco: troca para o disco do fogo, troca para o disco do mar"],
        ["Espaço, Enter", "toca, pausa e continua (em outro botão, apertam esse botão); o passeio só recomeça pelo botão dele"],
        ["Esc, S", "para o passeio, ou todo o som (alguns leitores de tela guardam o Esc para si: o S também funciona)"],
        ["Tab", "vai para o próximo controle; a lista completa de lugares vem depois do controle remoto"],
        ["?", "abre este guia"],
      ],
    },
    {
      title: "Lista de lugares",
      rows: [
        ["Seta para cima, Seta para baixo", "escolhe um lugar e toca o som dele; depois de um instante ele toca ao longo do tempo desde a primeira data (seguir adiante cancela)"],
        ["Espaço, Enter", "toca, pausa, e continua de onde parou; no fim do disco, toca de novo"],
        ["Home, End", "primeiro e último lugar"],
        ["A … Z", "pula para o próximo lugar que começa com essa letra (as letras de atalho abaixo continuam sendo atalhos)"],
      ],
    },
    {
      title: "Mais teclas",
      rows: [
        ["C", "compara duas datas"],
        ["L", "legenda sonora"],
        ["V", "diz o valor sob a agulha"],
        ["W", "diz o lugar sob a agulha, com a latitude e a longitude"],
        ["D", "descreve esta data: lugares com os valores mais altos e mais baixos"],
        ["N", "próximo lugar"],
        ["Shift + N", "lugar anterior"],
        [",", "data anterior (vírgula)"],
        [".", "próxima data (ponto)"],
        ["+, =", "aproxima o globo (mais ou igual)"],
        ["-", "afasta o globo (menos)"],
        ["H", "abre este guia"],
        ["G", "liga ou desliga a voz guia (voz sintética)"],
        ["S", "para todo o som"],
      ],
    },
    {
      title: "Controle de data",
      rows: [
        ["Seta para a esquerda, Seta para a direita", "data anterior e próxima"],
        ["Home, End", "primeira e última data"],
      ],
    },
    {
      title: "Mouse e toque",
      pointer: true,
      rows: [
        ["Clique", "em um lugar da lista: escolhe o lugar; ele toca ao longo do tempo depois de um instante"],
        ["Clique", "no lugar que está tocando: pausa ou continua"],
        ["Clique", "em um ponto do globo ou do quadro da NASA: vai até lá e toca o som dele (um ponto do outro disco troca de disco)"],
      ],
    },
    {
      title: "Celular com leitor de tela",
      pointer: true,
      rows: [
        ["Controle remoto", "os primeiros botões da página, na parte de baixo da tela: Pausar ou Tocar, Próximo lugar, Lugar anterior, Trocar para o fogo ou o mar, Parar ou Começar o passeio"],
        ["Deslizar para a direita ou esquerda", "próximo controle ou anterior (TalkBack, VoiceOver)"],
        ["Toque duplo", "em Ligar o som, um disco ou um botão: ativa; em um lugar: escolhe e toca, e de novo pausa ou continua"],
        ["Controle de data", "muda a data (VoiceOver: deslizar para cima ou para baixo; TalkBack: teclas de volume)"],
        ["Vibração", "Android, Chrome ou Samsung Internet: conte os pulsos, 1 baixo a 5 alto; vibração áspera é sem dados"],
      ],
    },
  ],
};

/** Build the guide (a heading and a list per section) inside container, in the given language. */
export function renderGuide(container, lang = "en") {
  const sections = GUIDE[lang] || GUIDE.en;
  container.replaceChildren();
  for (const s of sections) {
    const section = document.createElement("section");
    const h = document.createElement("h3");
    h.textContent = s.title;
    const ul = document.createElement("ul");
    for (const [keys, action] of s.rows) {
      const li = document.createElement("li");
      // Keys go in <kbd>; a gesture (pointer section) is plain text with a class for styling.
      const kbd = document.createElement(s.pointer ? "span" : "kbd");
      if (s.pointer) kbd.className = "guide__gesture";
      kbd.textContent = keys;
      const text = document.createElement("span");
      text.textContent = action;
      // The colon is real text, so a screen reader reads "P: play through time, or pause".
      // A gesture row reads as one phrase: "Click on a place in the list: ...".
      // It is visually hidden: the grid column already separates the key from the action.
      const sep = document.createElement("span");
      sep.className = "visually-hidden";
      sep.textContent = s.pointer ? " " : ": ";
      li.append(kbd, sep, text);
      ul.append(li);
    }
    section.append(h, ul);
    container.append(section);
  }
}
