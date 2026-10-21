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
  "cards",
  "dashboard",
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
  cards: "Cartões e faturas",
  dashboard: "Dashboard",
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
  { id: "start-category-suggestion", topic: "start" },
  { id: "start-apply-similar", topic: "start" },
  { id: "recurrence-create", topic: "recurrence" },
  { id: "recurrence-variable", topic: "recurrence" },
  { id: "recurrence-adjust", topic: "recurrence" },
  { id: "states-estimated", topic: "states" },
  { id: "states-transfer", topic: "states" },
  { id: "states-hidden", topic: "states" },
  { id: "states-uncategorized", topic: "states" },
  { id: "budgets-set", topic: "budgets" },
  { id: "budgets-levels", topic: "budgets" },
  { id: "cards-register", topic: "cards" },
  { id: "cards-invoices", topic: "cards" },
  { id: "cards-home-bar", topic: "cards" },
  { id: "cards-migration", topic: "cards" },
  { id: "cards-pay-invoice", topic: "cards" },
  { id: "dashboard-heatmap", topic: "dashboard" },
  { id: "reserves-kinds", topic: "reserves" },
  { id: "reserves-move", topic: "reserves" },
  { id: "reserves-monthly", topic: "reserves" },
  { id: "import-how", topic: "import" },
  { id: "import-installments", topic: "import" },
  { id: "import-password", topic: "import" },
  { id: "import-summary", topic: "import" },
  { id: "import-offline", topic: "import" },
  { id: "sync-what", topic: "sync" },
  { id: "sync-pair", topic: "sync" },
  { id: "sync-hub-off", topic: "sync" },
  { id: "privacy-local", topic: "privacy" },
  { id: "privacy-hide", topic: "privacy" },
  { id: "privacy-export", topic: "privacy" },
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
      "Ao lançar, ligue Repetir este lançamento. Escolha a frequência (semanal, quinzenal, mensal ou anual). Em mensal e anual, escolha o dia: um dia fixo do mês ou o enésimo dia útil. Dia útil considera segunda a sexta, sem feriados. Dá para definir uma data final.",
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
      "A transferência continua na lista, mas não é receita nem despesa: fica fora do saldo, dos gráficos, das metas e das faturas dos cartões. Sem isso, pagar a fatura contaria duas vezes.",
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
  "start-category-suggestion": {
    question: "O app sugere a categoria quando eu lanço algo?",
    answer: [
      "Sim, enquanto você não escolheu categoria. Ao digitar a descrição, o app procura no seu histórico um lançamento do mesmo tipo (despesa ou receita) com a mesma descrição, sem contar acento, caixa, pontuação e números. Se não achar, tenta pela primeira palavra, desde que tenha ao menos três letras. A sugestão aparece como Sugestão: e o nome da categoria.",
      "Toque em Usar para escolher essa categoria, ou no X (Dispensar sugestão) para ignorá-la. O app nunca grava a categoria sozinho: sem o seu toque, o lançamento fica sem categoria. Ao editar um lançamento que já tem categoria, nada é sugerido.",
    ],
  },
  "start-apply-similar": {
    question: "Troquei a categoria de um lançamento. Dá para trocar nos outros iguais?",
    answer: [
      "Sim. Ao editar um lançamento e salvar com outra categoria, se houver outros do mesmo tipo e com a mesma descrição em categoria diferente, abre Aplicar às semelhantes. A descrição precisa ser inteira igual depois de normalizada: acento, caixa, pontuação e números não contam, então Uber Trip 123 e UBER TRIP 456 são o mesmo lugar. Só a primeira palavra igual não basta.",
      "Primeiro você vê a contagem e a lista, com todos marcados (dá para desmarcar um a um). Na segunda etapa, a prévia mostra de qual categoria cada um sai e para qual vai. Só o botão Aplicar grava, tudo de uma vez: se algo falhar, nada muda. Em Agora não, nenhum outro lançamento é alterado.",
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
  "cards-register": {
    question: "Como cadastro um cartão de crédito?",
    answer: [
      "O caminho mais rápido é o botão Novo cartão de crédito. Ele aparece em Ajustes, em Formas de pagamento, e também onde você escolhe a forma de pagamento de um lançamento e ao importar uma fatura em PDF. Um sheet curto pede Banco, Fechamento e Vencimento, depois o nome (em branco, vale o banco) e a cor, e mostra uma prévia antes de Salvar cartão. Se você veio de um lançamento ou da importação, o cartão novo já fica selecionado.",
      "Também dá para criar em Ajustes, Formas de pagamento, Nova, com o tipo Crédito: depois do nome, há uma etapa Cartão com os mesmos campos. Fechamento e vencimento são dias do mês, de 1 a 31, e banco, fechamento e vencimento são obrigatórios para cartão de crédito.",
      "Esses dados definem a fatura: compra feita até o dia do fechamento (inclusive) entra na fatura que fecha naquele mês, e depois dele, na do mês seguinte. Em mês curto, vale o último dia. Cartão de crédito não tem ícone: ele é reconhecido só pela cor, que você escolhe no cadastro e que aparece nas listas, nas faturas e na barra da aba Início.",
    ],
  },
  "cards-invoices": {
    question: "Onde vejo a fatura do cartão?",
    answer: [
      "Em Ajustes, em Cadastros, abra Faturas dos cartões (ou toque em Faturas na barra do mês, na aba Início, quando há gasto no cartão). Cada cartão completo lista a fatura aberta e as anteriores, com as datas de fechamento e vencimento. Toque numa fatura para ver as compras dela.",
      "A fatura aberta, que ainda não fechou, é só uma estimativa: leva um til (~) e o aviso Estimativa, pode mudar até o fechamento, porque cada compra nova a altera e ela ainda não é o valor que o banco fecha. Faturas anteriores só aparecem se tiveram compra. A fatura é calculada dos seus lançamentos; transferências e lançamentos ocultos ficam fora.",
    ],
  },
  "cards-home-bar": {
    question: "O que é a barra colorida do mês na aba Início?",
    answer: [
      "Quando o mês tem despesa no cartão de crédito, a barra do mês passa a ter um segmento por cartão, na cor escolhida para ele. O que não foi no cartão segue na cor de despesa. Abaixo da barra, uma legenda traz o nome e o valor de cada cartão, porque a cor sozinha pode confundir.",
      "A barra mostra até cinco segmentos: se houver mais cartões com gasto, os menores se juntam em Outros cartões. O valor é o gasto no mês pela data da compra, não pelo vencimento da fatura, e já está dentro do total de despesas: não é uma soma a mais.",
    ],
  },
  "cards-migration": {
    question: "O app pediu para Ajustar cartões. O que é isso?",
    answer: [
      "Antes, o cartão de crédito era um cadastro genérico, sem banco, fechamento e vencimento. Agora cada cartão tem esses dados, e as compras entram na fatura dele. Se você tem lançamentos em um cartão sem os dados, o app abre Ajustar cartões: para cada cartão antigo, você escolhe um cartão já cadastrado ou cria um novo, e confere uma prévia.",
      "Na primeira etapa dá para tocar em Exportar dados antes e baixar uma cópia de segurança. O botão final nomeia a ação (por exemplo, Mover 12 lançamentos): os lançamentos e as séries passam para o cartão escolhido, o cartão antigo deixa de existir e nada é apagado.",
      "Se não quiser agora, toque em Depois: o aviso volta na próxima vez que abrir o app. Também dá para abrir Ajustar cartões pela tela Faturas, enquanto houver cartão por completar. Esse cartão não gera fatura até ser ajustado.",
    ],
  },
  "cards-pay-invoice": {
    question: "Como lanço o pagamento da fatura sem contar a despesa duas vezes?",
    answer: [
      "As compras no cartão já são despesas, uma a uma, na data em que você as fez. Por isso, ao pagar a fatura com o dinheiro da conta, lance o pagamento como Transferência (em vez de Conta). A transferência continua na lista, mas fica fora do saldo, dos gráficos e das metas.",
      "Se o pagamento for lançado como despesa comum, o mesmo gasto é contado duas vezes: uma nas compras e outra no pagamento. O app não marca a fatura como paga nem faz essa troca por você.",
    ],
  },
  "dashboard-heatmap": {
    question: "Como leio o mapa de calor Saídas por dia?",
    answer: [
      "No Dashboard, o cartão Saídas por dia mostra o calendário do mês, com um quadrado por dia. Quanto mais forte a cor, maior a saída daquele dia, em quatro degraus relativos ao maior dia do mês: um mês barato também mostra onde foi o pico. Dia sem saída fica sem cor. O cartão só aparece se o mês tem despesa.",
      "Acima do calendário ficam Média por dia, Maior dia (com o número do dia) e Dias sem saída. No mês em curso, a média e os dias sem saída contam só até hoje: os dias que ainda não chegaram não entram na média nem viram dia sem saída. Em meses passados, vale o mês inteiro.",
      "Toque num dia para ver os lançamentos dele e o total, e toque num lançamento para editá-lo. Transferências e lançamentos ocultos não entram, como no saldo. Com os valores escondidos (o olho), o mapa mostra a distribuição sem os números.",
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
      "Na aba Início, toque em Importar fatura ou extrato. Escolha o tipo, a forma de pagamento (a fatura exige um cartão de crédito; se não houver, toque em Novo cartão de crédito ali mesmo) e o PDF baixado do app ou do site do banco.",
      "O app lista o que reconheceu, com categorias sugeridas pelo seu histórico. Revise, desmarque o que não quer, ajuste descrições e importe. Reimportar o mesmo PDF não duplica lançamentos. Ao final, o app mostra um resumo do que entrou.",
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
  "import-summary": {
    question: "O que o resumo depois de importar quer dizer?",
    answer: [
      "Ao terminar, o app mostra três contagens: Importadas (viraram lançamento agora), Já existiam (linhas que já estavam no app, por uma importação anterior, e por isso não entram de novo) e Não interpretadas.",
      "Não interpretadas são linhas que começam com uma data, mas que o leitor não conseguiu transformar em lançamento. Cada uma aparece com o texto original e o motivo: Data inválida, Sem valor ou Formato desconhecido. Cabeçalhos, totais e rodapés não são listados. Lance à mão o que faltar; o texto fica só no aparelho.",
      "Reimportar o mesmo PDF não duplica nada. Se todas as linhas já existirem, o botão passa a ser Ver resumo, para você conferir que estava tudo lá.",
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
      "Só saem do aparelho se você ligar a sincronização, e então vão apenas para o hub no seu próprio computador, dentro da sua rede, ou se você mesmo exportar um arquivo.",
    ],
  },
  "privacy-hide": {
    question: "Como escondo os valores da tela?",
    answer: [
      "Toque no olho no topo de qualquer tela. Os valores viram pontos até você tocar de novo. É útil para usar o app perto de outras pessoas.",
    ],
  },
  "privacy-export": {
    question: "Como exporto meus dados?",
    answer: [
      "Em Ajustes, no grupo Seus dados, toque em Exportar. O app avisa sobre o arquivo e, na etapa seguinte, mostra uma prévia do que entra, antes de Baixar arquivo. O arquivo se chama homefinance-AAAA-MM-DD.json e vai para a pasta de downloads.",
      "Ele traz todas as tabelas (perfis, categorias, formas de pagamento, lançamentos, recorrências e reajustes, reservas e movimentos, metas), incluindo o que você apagou, para uma restauração futura. As credenciais do hub não entram. Funciona sem internet: o arquivo é montado no aparelho.",
      "Atenção: o arquivo é texto simples, sem senha nem proteção, com todos os seus valores e descrições. Quem abrir lê tudo, então guarde-o onde só você acessa. Restaurar a partir do arquivo ainda não existe no app.",
    ],
  },
  "privacy-reset": {
    question: "Como apago tudo?",
    answer: [
      "Em Ajustes, na Zona de risco, use Resetar conta. Ela apaga tudo deste aparelho, não tem desfazer e pede confirmação. Para guardar uma cópia, exporte antes em Seus dados. O que você já enviou ao hub continua lá.",
    ],
  },
};
