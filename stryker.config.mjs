// Teste de mutação do núcleo (Stryker). Roda com "npm run test:mutation" e no workflow Mutação.

// Os testes por propriedade geram 500 entradas cada um no "npm test". Aqui eles rodam uma vez por
// mutante, e com 500 a rodada passa de 10 minutos. Com menos casos a rodada cabe no CI e a
// semente continua fixa; quem confere as 500 entradas é o "npm test", no Gate.
// Os processos de teste herdam esta variável do processo do Stryker.
process.env.FOCO_CASOS_POR_PROPRIEDADE ??= '25';

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  testRunner: 'tap',
  tap: {
    testFiles: ['tests/unidade/**/*.test.js'],
  },
  mutate: ['www/js/nucleo/**/*.js'],
  coverageAnalysis: 'perTest',
  ignorePatterns: ['android', 'docker', 'referencias', 'saida', 'tests/e2e'],
  reporters: ['clear-text', 'progress'],
  clearTextReporter: {
    logTests: false,
    reportTests: false,
  },
  thresholds: {
    high: 95,
    low: 90,
    break: 90,
  },
  tempDirName: '.stryker-tmp',
  concurrency: 4,
};
