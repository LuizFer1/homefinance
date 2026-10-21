/**
 * Conteúdo da Ajuda. Estrutura e texto ficam separados de propósito: a ordem,
 * os temas e os ids (`HELP_STRUCTURE`) não mudam com o idioma, e só os
 * dicionários `HELP_TEXT_PT` e `HELP_TOPIC_LABELS_PT` precisam ser traduzidos
 * quando a spec de i18n sair do rascunho. O id é também o que vai no link
 * (`#ajuda=<id>`): renomear um id quebra os links já compartilhados.
 *
 * O texto descreve o que o app faz hoje. Recurso que ainda não existe não entra
 * aqui, nem como "em breve".
 */

export const HELP_TOPICS = [
  "start",
  "recurrence",
  "states",
  "budgets",
  "reserves",
  "import",
  "sync",
  "privacy",
] as const;
export type HelpTopic = (typeof HELP_TOPICS)[number];

export const HELP_TOPIC_LABELS_PT: Record<HelpTopic, string> = {
  start: "Primeiros passos",
  recurrence: "Lançamentos que se repetem",
  states: "Estados de um lançamento",
  budgets: "Metas por categoria",
  reserves: "Reservas",
  import: "Importar PDF",
  sync: "Sincronizar com o hub",
  privacy: "Privacidade",
};

export interface HelpEntryShape {
  id: string;
  topic: HelpTopic;
}

export const HELP_STRUCTURE: readonly HelpEntryShape[] = [
  { id: "start-first-entry", topic: "start" },
  { id: "start-tabs", topic: "start" },
  { id: "start-categories", topic: "start" },
  { id: "recurrence-create", topic: "recurrence" },
  { id: "recurrence-variable", topic: "recurrence" },
  { id: "recurrence-adjust", topic: "recurrence" },
  { id: "states-estimated", topic: "states" },
  { id: "states-transfer", topic: "states" },
  { id: "states-hidden", topic: "states" },
  { id: "states-uncategorized", topic: "states" },
  { id: "budgets-set", topic: "budgets" },
  { id: "budgets-levels", topic: "budgets" },
  { id: "reserves-kinds", topic: "reserves" },
  { id: "reserves-move", topic: "reserves" },
  { id: "reserves-monthly", topic: "reserves" },
  { id: "import-how", topic: "import" },
  { id: "import-installments", topic: "import" },
  { id: "import-password", topic: "import" },
  { id: "import-offline", topic: "import" },
  { id: "sync-what", topic: "sync" },
  { id: "sync-pair", topic: "sync" },
  { id: "sync-hub-off", topic: "sync" },
  { id: "privacy-local", topic: "privacy" },
  { id: "privacy-hide", topic: "privacy" },
  { id: "privacy-reset", topic: "privacy" },
];

export interface HelpText {
  question: string;
  /** Um item por parágrafo. */
  answer: readonly string[];
}

export const HELP_TEXT_PT: Record<string, HelpText> = {
  "start-first-entry": {
    question: "Como lanço minha primeira despesa ou receita?",
    answer: [
      "Na aba Início, toque em Despesa ou Receita. O lançamento é feito em etapas: valor e data, se ele se repete, categoria e forma de pagamento. Categoria e pagamento são opcionais.",
      "O lançamento entra na lista do mês e nos totais assim que você salva. Para corrigir, toque nele na lista.",
    ],
  },
  "start-tabs": {
    question: "Para que serve cada aba?",
    answer: [
      "Início mostra o saldo do mês, o que falta confirmar e a lista de lançamentos, com busca e filtros. Dashboard mostra os gráficos do mês. Reservas guarda a reserva de emergência e as caixinhas. Ajustes reúne cadastros, metas, aparência, sincronização e esta ajuda.",
      "Você também pode arrastar para o lado para trocar de aba.",
    ],
  },
  "start-categories": {
    question: "Posso criar e editar categorias e formas de pagamento?",
    answer: [
      "Sim. Em Ajustes, abra Categorias ou Formas de pagamento. O app já vem com alguns padrões, e você pode renomear, trocar cor e ícone ou criar os seus.",
      "Apagar uma categoria não apaga os lançamentos dela: eles passam a aparecer como Sem categoria.",
    ],
  },
  "recurrence-create": {
    question: "Como faço um lançamento se repetir todo mês?",
    answer: [
      "Ao lançar, ligue Repetir este lançamento. Escolha a frequência (mensal, bimestral, trimestral, semestral ou anual) e o dia: um dia fixo do mês ou o enésimo dia útil. Dia útil considera segunda a sexta, sem feriados. Dá para definir uma data final.",
      "O app gera as ocorrências sozinho a cada mês, inclusive as que ficaram para trás se você passou um tempo sem abrir.",
    ],
  },
  "recurrence-variable": {
    question: "E contas que mudam de valor, como luz e água?",
    answer: [
      "Marque Valor varia todo mês. Cada mês nasce uma ocorrência estimada, com a média das que você já confirmou (no primeiro mês, o valor que você digitou).",
      "A estimativa aparece em A confirmar, na aba Início, e leva um til (~) na lista. Quando a conta chegar, toque nela e informe o valor real e a data. O mês passa a contar com o valor confirmado, que também entra na média das próximas estimativas.",
    ],
  },
  "recurrence-adjust": {
    question: "O aluguel subiu. Como reajusto uma série?",
    answer: [
      "Abra uma ocorrência da série e escolha Reajustar série. Informe a partir de qual mês vale e o valor novo. Os meses seguintes passam a nascer com o valor novo.",
      "Lançamentos já feitos não mudam, e excluir um reajuste também não altera o que já foi gerado. Série de valor variável não tem reajuste, porque o valor dela é a média.",
    ],
  },
  "states-estimated": {
    question: "O que significa um valor com til (~) ou estimado?",
    answer: [
      "É a ocorrência de uma série de valor variável que ainda não foi confirmada. Ela entra no saldo do mês com o valor estimado, e a aba Início avisa quanto do total é estimativa.",
      "Confirme com o valor real para trocar a estimativa pelo número verdadeiro.",
    ],
  },
  "states-transfer": {
    question: "O que é uma transferência?",
    answer: [
      "É um movimento entre contas suas, como pagar a fatura do cartão com o dinheiro da conta. Ao lançar, escolha Transferência em vez de Conta.",
      "A transferência continua na lista, mas não é receita nem despesa: fica fora do saldo, dos gráficos e das metas. Sem isso, pagar a fatura contaria duas vezes.",
    ],
  },
  "states-hidden": {
    question: "Como deixo um lançamento fora das contas?",
    answer: [
      "Escolha Oculto no lançamento. Ele continua na lista, mas fica fora de saldo, gráficos e relatórios.",
      "Para voltar a contar, edite o lançamento e escolha Conta.",
    ],
  },
  "states-uncategorized": {
    question: "Como classifico vários lançamentos sem categoria de uma vez?",
    answer: [
      "Na aba Início, quando há lançamentos sem categoria, o contador leva à lista deles. Marque os que quiser, escolha a categoria e confira a prévia antes de aplicar.",
    ],
  },
  "budgets-set": {
    question: "Como defino quanto posso gastar por categoria?",
    answer: [
      "Em Ajustes, abra Orçamento por categoria e crie uma meta: escolha a categoria e o limite mensal. A tela mostra o gasto, a meta e o que ainda resta em cada categoria, no mês que você escolher.",
      "Transferências e lançamentos ocultos não contam no gasto da meta.",
    ],
  },
  "budgets-levels": {
    question: "Quando uma meta fica em atenção ou estourada?",
    answer: [
      "A meta passa a Atenção quando o gasto chega a 80% do limite, e a Estourou quando o ultrapassa. É só um aviso, na aba Início e no Dashboard: o app nunca impede um gasto.",
    ],
  },
  "reserves-kinds": {
    question: "Qual a diferença entre reserva de emergência e caixinha?",
    answer: [
      "A reserva de emergência tem a meta calculada: 3, 6 ou 12 meses do seu custo essencial (moradia, alimentação, transporte, contas e saúde), pela média do seu histórico. Se ainda não há histórico, você digita o custo essencial.",
      "A caixinha é um objetivo seu, com nome, ícone, cor, valor-alvo e, se quiser, um mês-limite.",
    ],
  },
  "reserves-move": {
    question: "Como guardo e retiro dinheiro de uma reserva?",
    answer: [
      "Abra a reserva e toque em Guardar ou Retirar. Guardar sai do saldo do mês e não pode passar dele. Retirar não pode passar do que há na reserva e pede um motivo (saúde, casa, carro, trabalho ou outro).",
      "Guardar não é despesa: esses movimentos ficam à parte e não entram nos gastos do mês.",
    ],
  },
  "reserves-monthly": {
    question: "Dá para guardar um valor fixo todo mês?",
    answer: [
      "Sim. Na caixinha, defina um depósito mensal com valor e dia. O app registra o guardado sozinho a cada mês, a partir do saldo do mês, depois de gerar as receitas recorrentes, como o salário.",
    ],
  },
  "import-how": {
    question: "Como importo uma fatura de cartão ou um extrato em PDF?",
    answer: [
      "Na aba Início, toque em Importar fatura ou extrato. Escolha o tipo, a forma de pagamento (a fatura exige um cartão de crédito cadastrado) e o PDF baixado do app ou do site do banco.",
      "O app lista o que reconheceu, com categorias sugeridas pelo seu histórico. Revise, desmarque o que não quer, ajuste descrições e importe. Reimportar o mesmo PDF não duplica lançamentos.",
    ],
  },
  "import-installments": {
    question: "O que acontece com compras parceladas?",
    answer: [
      "Uma parcela como 03/10 vira uma série mensal: as parcelas já vencidas entram agora e as próximas nos meses seguintes. A fatura do mês que vem não as duplica.",
    ],
  },
  "import-password": {
    question: "Meu PDF pede senha. E se o PDF for uma foto?",
    answer: [
      "Se o PDF for protegido, o app pede a senha. Muitos bancos usam parte do CPF. A senha não é guardada.",
      "Se o PDF não tem texto, como uma imagem escaneada, o app não consegue ler. Use o PDF baixado direto do banco.",
    ],
  },
  "import-offline": {
    question: "A importação funciona sem internet?",
    answer: [
      "O arquivo é lido no próprio aparelho e não sai dele. Só o leitor de PDF é baixado separadamente, na primeira vez que você importa, e fica guardado depois disso. Sem internet e sem ter importado antes, o app avisa que o leitor não foi baixado: importe uma vez com internet.",
    ],
  },
  "sync-what": {
    question: "O que é o hub e preciso dele?",
    answer: [
      "O hub é um programa opcional que roda no seu computador. Ele junta os dados dos seus celulares, para que cada um veja o que o outro lançou, e mostra um painel de leitura no computador.",
      "Não precisa dele: o app funciona completo sem hub, e com o hub desligado cada celular segue normal. Não existe servidor de terceiros nessa história.",
    ],
  },
  "sync-pair": {
    question: "Como pareio o celular com o hub?",
    answer: [
      "Conecte o celular na mesma rede Wi-Fi do computador com o hub aberto. Em Ajustes, abra Sincronizar com o hub e informe o endereço (algo como 192.168.0.5:7777) e o código que a janela do hub mostra ao lado do QR code. O código vale cinco minutos.",
      "Depois de pareado, o app sincroniza sozinho ao voltar para ele, e o botão Sincronizar faz isso na hora.",
    ],
  },
  "sync-hub-off": {
    question: "O que acontece se o hub estiver desligado ou eu estiver fora de casa?",
    answer: [
      "Nada de grave. O app continua funcionando e guardando tudo no aparelho. Na próxima vez que o hub estiver acessível, o que mudou é trocado. Se o mesmo lançamento foi editado em dois aparelhos, vale a edição mais recente.",
    ],
  },
  "privacy-local": {
    question: "Onde ficam meus dados?",
    answer: [
      "Seus dados ficam no aparelho, no armazenamento do navegador. Não há conta, login, rastreamento nem servidor do app, e ele abre e funciona sem internet.",
      "Só saem do aparelho se você ligar a sincronização, e então vão apenas para o hub no seu próprio computador, dentro da sua rede.",
    ],
  },
  "privacy-hide": {
    question: "Como escondo os valores da tela?",
    answer: [
      "Toque no olho no topo de qualquer tela. Os valores viram pontos até você tocar de novo. É útil para usar o app perto de outras pessoas.",
    ],
  },
  "privacy-reset": {
    question: "Como apago tudo?",
    answer: [
      "Em Ajustes, na Zona de risco, use Resetar conta. Ela apaga tudo deste aparelho, não tem desfazer e pede confirmação. O que você já enviou ao hub continua lá.",
    ],
  },
};
