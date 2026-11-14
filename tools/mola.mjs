// Gera as curvas de mola do app como `linear()` do CSS, para não escrever a string à mão.
//
// Uso: node tools/mola.mjs
//
// A mola é descrita por duração e "bounce", no modelo do SwiftUI: massa 1, rigidez
// (2π/duração)² e amortecimento 4π(1 - bounce)/duração. Rodar de novo dá a mesma saída.
// Com bounce 0 a mola é criticamente amortecida (sem passar do ponto). A curva é amostrada até
// assentar, simplificada (Ramer-Douglas-Peucker) e arredondada; a saída traz também quanto
// tempo a animação leva até assentar, que é a duração a usar no CSS.

import { pathToFileURL } from 'node:url';

const MOLAS = [
  { nome: 'mola-estado', duracao: 0.22, bounce: 0.15, uso: 'troca de estado, soltar o dedo' },
  { nome: 'mola-folha', duracao: 0.33, bounce: 0, uso: 'folha e troca de tela, sem pulo' },
];

const TOLERANCIA = 0.002; // erro máximo da curva simplificada, na escala de 0 a 1
const ASSENTOU = 0.001; // distância do fim abaixo da qual a mola parou
const PASSO = 1 / 600; // segundos entre amostras

function posicao({ duracao, bounce }) {
  const w0 = (2 * Math.PI) / duracao;
  const zeta = 1 - bounce;
  if (zeta < 1) {
    const wd = w0 * Math.sqrt(1 - zeta * zeta);
    return (t) => 1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + ((zeta * w0) / wd) * Math.sin(wd * t));
  }
  return (t) => 1 - (1 + w0 * t) * Math.exp(-w0 * t);
}

function amostrar(mola) {
  const x = posicao(mola);
  let fim = 0;
  // Assenta quando fica perto do fim e não sai mais de perto por um bom trecho.
  for (let t = 0, perto = 0; perto < 120; t += PASSO) {
    if (Math.abs(1 - x(t)) < ASSENTOU) {
      if (perto === 0) fim = t;
      perto += 1;
    } else {
      perto = 0;
    }
  }
  const pontos = [];
  const n = Math.round(fim / PASSO);
  for (let i = 0; i <= n; i += 1) pontos.push([i / n, i === n ? 1 : x((i / n) * fim)]);
  return { fim, pontos };
}

function simplificar(pontos) {
  if (pontos.length < 3) return pontos;
  const [a, b] = [pontos[0], pontos[pontos.length - 1]];
  let maior = 0;
  let indice = 0;
  for (let i = 1; i < pontos.length - 1; i += 1) {
    const [t, v] = pontos[i];
    const linha = a[1] + ((b[1] - a[1]) * (t - a[0])) / (b[0] - a[0]);
    const erro = Math.abs(v - linha);
    if (erro > maior) [maior, indice] = [erro, i];
  }
  if (maior <= TOLERANCIA) return [a, b];
  const esquerda = simplificar(pontos.slice(0, indice + 1));
  return [...esquerda.slice(0, -1), ...simplificar(pontos.slice(indice))];
}

function linear(pontos) {
  const arredonda = (n, casas) => String(Number(n.toFixed(casas)));
  const partes = pontos.map(([t, v], i) => {
    const valor = arredonda(v, 3);
    return i === 0 || i === pontos.length - 1 ? valor : `${valor} ${arredonda(t * 100, 1)}%`;
  });
  return `linear(${partes.join(', ')})`;
}

// Cada mola como o CSS a usa: nome, duração até assentar (ms) e a curva linear().
export function gerarMolas() {
  return MOLAS.map((mola) => {
    const { fim, pontos } = amostrar(mola);
    return { ...mola, ms: Math.round(fim * 1000), curva: linear(simplificar(pontos)) };
  });
}

// Rodado direto (node tools/mola.mjs), imprime as variáveis para colar no app.css. O teste
// tests/unidade/mola.test.js confere que o app.css tem exatamente o que o script gera.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  for (const mola of gerarMolas()) {
    console.log(`/* ${mola.uso}: duração ${mola.duracao} s, bounce ${mola.bounce} */`);
    console.log(`--${mola.nome}-ms: ${mola.ms}ms;`);
    console.log(`--${mola.nome}: ${mola.curva};`);
  }
}
