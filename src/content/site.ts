/**
 * Todo o texto público da landing em um único objeto tipado.
 * Fonte: docs/templates/conteudo.md. Itens marcados com `// PENDENTE:` são
 * provisórios e devem ser trocados quando o cliente entregar o conteúdo real.
 *
 * Regra: nenhum componente tem texto hardcoded; tudo vem daqui.
 */

export const site = {
  brand: {
    name: "Barbearia VIP",
    shortName: "VIP",
    campaign: "10% OFF no primeiro corte",
    unitsCount: 30, // 31 cadastradas, SC 401 Antiga inativa (confirmado em 23/10)
    instagram: {
      handle: "@barbeariavip", // PENDENTE: Instagram oficial
      url: "https://instagram.com/barbeariavip", // PENDENTE: Instagram oficial
    },
  },

  /**
   * Tokens visuais provisórios. O CSS não consegue importar TS, então os valores
   * reais vivem em `src/app/globals.css` (`@theme`); este bloco documenta e
   * permite que componentes que precisem do hex (ex.: tema de widgets de terceiros) o leiam.
   */
  theme: {
    background: "#0B0B0C", // PENDENTE: cor de fundo da marca
    primary: "#D9B437", // PENDENTE: cor primária da marca
    fontBody: "Inter", // PENDENTE: fonte da marca
    fontDisplay: "Bebas Neue", // PENDENTE: fonte da marca
  },

  meta: {
    title: "Barbearia VIP | 10% OFF no seu primeiro corte",
    description:
      "Cadastre-se em 1 minuto, receba seu voucher na hora e use em qualquer uma das 30 unidades da Barbearia VIP em até 7 dias.",
    ogAlt: "Barbearia VIP — 10% OFF no seu primeiro corte, válido por 7 dias",
  },

  nav: {
    skipToContent: "Pular para o conteúdo",
    ctaShort: "Quero meu desconto",
  },

  hero: {
    eyebrow: "Campanha exclusiva para novos clientes",
    headline: "10% OFF no seu primeiro corte na Barbearia VIP",
    subtitle:
      "Cadastre-se em 1 minuto, receba seu voucher na hora e use em qualquer uma das nossas 30 unidades em até 7 dias.",
    cta: "Quero meu desconto",
    /** `{handle}` é substituído pelo @ do influencer. */
    referralBadge: "Indicação de @{handle}",
    referralBadgeFallback: "Indicação de {name}",
    highlights: ["Voucher na hora", "Válido por 7 dias", "Qualquer unidade"],
    imageAlt: "Ambiente da Barbearia VIP",
  },

  howItWorks: {
    title: "Como funciona",
    subtitle: "Três passos e o desconto é seu.",
    steps: [
      {
        title: "Faça seu cadastro",
        text: "Nome, WhatsApp e a unidade mais perto de você.",
      },
      {
        title: "Receba o voucher",
        text: "Código e QR na tela, válido por 7 dias.",
      },
      {
        title: "Apresente na recepção",
        text: "Mostre o QR, a recepção valida e aplica o desconto.",
      },
    ],
  },

  form: {
    sectionTitle: "Garanta seu desconto",
    sectionSubtitle: "Leva menos de 1 minuto. Sem app, sem cartão.",
    stepLabel: "Etapa {current} de {total}",
    step1: {
      title: "Seus dados",
      name: { label: "Nome completo", placeholder: "Como está no seu documento" },
      phone: { label: "WhatsApp", placeholder: "(11) 91234-5678", hint: "Enviamos o voucher e confirmamos seu cadastro por aqui." },
      unit: {
        label: "Unidade de preferência",
        placeholder: "Escolha a unidade mais perto",
        hint: "É só referência para o cadastro: o voucher vale em qualquer unidade.",
        emptyNotice:
          "A lista de unidades ainda não está disponível. Volte em instantes para concluir seu cadastro.",
      },
      submit: "Continuar",
      submitting: "Verificando...",
    },
    step2: {
      title: "Quase lá",
      intro:
        "Pedimos e-mail e data de nascimento para criar seu cadastro no app da Barbearia VIP, onde o voucher fica salvo e você acumula pontos de fidelidade.",
      email: { label: "E-mail", placeholder: "voce@exemplo.com" },
      birthDate: { label: "Data de nascimento", placeholder: "dd/mm/aaaa", hint: "Usamos também para benefícios de aniversário." }, // PENDENTE: confirmar benefício de aniversário
      consent: {
        label: "Li e concordo com a {link} e autorizo o uso dos meus dados para emitir o voucher e criar meu cadastro.",
        linkText: "Política de Privacidade",
      },
      back: "Voltar",
      submit: "Gerar meu voucher",
      submitting: "Gerando seu voucher...",
    },
    messages: {
      unknown: "Não conseguimos confirmar agora. Tente de novo em instantes.",
      retry: "Tentar de novo",
      unknownExhausted:
        "Ainda não conseguimos confirmar. Volte mais tarde ou, se você já tentou antes, recupere seu voucher em",
      unknownExhaustedLink: "/meu-voucher",
      unknownExhaustedLinkText: "Meu voucher",
      expired: "Seu voucher anterior já venceu e não pode ser renovado.",
      genericError: "Não foi possível concluir. Revise os campos e tente de novo.",
      serverError: "Tivemos um problema ao processar seu cadastro. Tente de novo em instantes.",
      secure: "Seus dados são protegidos e usados só para esta campanha e seu cadastro.",
    },
    validation: {
      nameRequired: "Informe seu nome completo.",
      nameTooShort: "Digite nome e sobrenome.",
      phoneRequired: "Informe seu WhatsApp.",
      phoneInvalid: "Digite um WhatsApp válido com DDD, ex. (11) 91234-5678.",
      unitRequired: "Escolha uma unidade.",
      emailRequired: "Informe seu e-mail.",
      emailInvalid: "Digite um e-mail válido.",
      birthDateRequired: "Informe sua data de nascimento.",
      birthDateInvalid: "Use o formato dd/mm/aaaa.",
      consentRequired: "É preciso aceitar a Política de Privacidade para continuar.",
    },
  },

  about: {
    title: "Sobre a Barbearia VIP",
    // PENDENTE: 2 a 3 frases oficiais sobre a marca (desde quando existe, diferencial, fidelidade)
    paragraphs: [
      "A Barbearia VIP é uma rede de barbearias com 30 unidades, criada para quem quer corte e barba bem feitos, em um ambiente pensado para você relaxar.",
      "Cada visita conta: quem é cliente VIP acumula pontos no programa de fidelidade e troca por benefícios nas unidades.",
    ],
    stats: [
      { value: "30", label: "unidades" },
      { value: "7 dias", label: "de validade do voucher" },
      { value: "1 min", label: "para se cadastrar" },
    ],
    imageAlt: "Fachada de uma unidade da Barbearia VIP",
  },

  rules: {
    title: "Regras da promoção",
    items: [
      "Desconto de 10% sobre qualquer serviço.", // PENDENTE: confirmar serviços elegíveis (ex. só corte e barba)
      "Válido por 7 dias a partir da emissão.",
      "Exclusivo para quem ainda não é cliente da Barbearia VIP.",
      "Um voucher por pessoa, uso único, em qualquer unidade participante.",
      "Não cumulativo com outras promoções ou descontos.", // PENDENTE: confirmar se é combinável
      "Todas as unidades participam.", // PENDENTE: confirmar se há unidades que não participam
    ],
  },

  faq: {
    title: "Perguntas frequentes",
    items: [
      {
        q: "Posso usar em qualquer unidade?",
        a: "Sim, em qualquer uma das 30 unidades.",
      },
      {
        q: "Já sou cliente, ganho o desconto?",
        a: "Esta promoção é exclusiva para a primeira visita. Clientes VIP já contam com o programa de fidelidade.", // PENDENTE: link/nome do programa de fidelidade
      },
      {
        q: "Preciso agendar?",
        a: "Não é obrigatório: você pode ir direto à unidade com o voucher. Se preferir, agende pelo WhatsApp da unidade escolhida.", // PENDENTE: confirmar como funciona o agendamento (app, WhatsApp, ordem de chegada)
      },
      {
        q: "O voucher venceu, e agora?",
        a: "O desconto é válido por 7 dias e não pode ser renovado.",
      },
      {
        q: "Por que pedem minha data de nascimento?",
        a: "Para criar seu cadastro no app da Barbearia VIP, que também usa a data para benefícios de aniversário.", // PENDENTE: confirmar benefício de aniversário
      },
      {
        q: "Fechei a página e perdi o voucher. Como recupero?",
        a: "Acesse Meu voucher, informe seu WhatsApp e data de nascimento e ele aparece de novo.",
        link: { href: "/meu-voucher", text: "Meu voucher" },
      },
    ],
  },

  booking: {
    label: "Agendar horário",
    // PENDENTE: link de agendamento ou WhatsApp oficial. Provisório: âncora vazia.
    url: "#",
  },

  jaCliente: {
    title: "Você já faz parte da Barbearia VIP",
    text: "Este desconto é exclusivo para a primeira visita. Mas a gente te espera do mesmo jeito: agende seu horário e aproveite seus pontos de fidelidade.",
    loyaltyNote: "Seus pontos de fidelidade continuam valendo normalmente nas unidades.", // PENDENTE: nome/link do programa de fidelidade
    backHome: "Voltar para a página inicial",
    metaTitle: "Você já é cliente | Barbearia VIP",
  },

  voucher: {
    metaTitle: "Seu voucher | Barbearia VIP",
    eyebrow: "Voucher de desconto",
    title: "Seu voucher está pronto",
    greeting: "Olá, {name}! Apresente este QR na recepção da unidade.",
    discount: "{percent}% de desconto",
    validUntil: "Válido até {date}",
    issuedAt: "Emitido em {date}",
    states: {
      ACTIVE: "Ativo",
      EXPIRED: "Expirado",
      USED: "Já utilizado",
      CANCELLED: "Cancelado",
    },
    usedAt: "Usado em {date} na unidade {unit}",
    expiredNote: "Este voucher venceu e não pode ser renovado. A promoção é válida por 7 dias a partir do cadastro.",
    cancelledNote: "Este voucher foi cancelado. Em caso de dúvida, fale com a unidade.",
    copy: "Copiar código",
    copied: "Código copiado",
    share: "Salvar no WhatsApp",
    book: "Agendar agora",
    bookHint: "Unidade de referência: {unit}",
    rulesTitle: "Como usar",
    rules: [
      "Mostre o QR ou informe o código na recepção antes de pagar.",
      "Uso único, em qualquer unidade participante.",
      "Não cumulativo com outras promoções.",
    ],
    lostLink: "Perdeu o link? Recupere seu voucher aqui.",
  },

  meuVoucher: {
    metaTitle: "Recuperar voucher | Barbearia VIP",
    title: "Recuperar meu voucher",
    text: "Informe o WhatsApp e a data de nascimento usados no cadastro.",
    phoneLabel: "WhatsApp",
    birthLabel: "Data de nascimento",
    submit: "Buscar voucher",
    notFound: "Não encontramos um voucher com esses dados. Confira o telefone e a data de nascimento, ou faça seu cadastro na página inicial.",
    pending: "Seu cadastro ainda está em confirmação. Volte em alguns minutos: assim que confirmarmos, seu voucher aparece aqui.",
    denied: "Este telefone já pertence a um cliente da Barbearia VIP. A promoção é exclusiva para a primeira visita.",
    rateLimited: "Muitas tentativas. Aguarde alguns minutos e tente de novo.",
    backHome: "Fazer meu cadastro",
  },

  company: {
    legalName: "Rede Barbearia VIP Ltda.",
    cnpj: "24.500.678/0001-00",
    address: "Av. Madre Benvenuta, 1168, Santa Mônica, Florianópolis/SC",
    privacyEmail: "privacidade@barbeariavip.com.br", // PENDENTE: e-mail de privacidade (LGPD)
  },

  privacy: {
    title: "Política de Privacidade",
    metaTitle: "Política de Privacidade | Barbearia VIP",
    provisionalBanner:
      "Versão provisória: este texto está em revisão jurídica e pode ser alterado sem aviso.", // PENDENTE: texto revisado pelo jurídico
    updatedAt: "22/10/2026",
    updatedLabel: "Última atualização",
    sections: [
      {
        title: "Quem somos e o que coletamos",
        text: "A Barbearia VIP ({legalName}, CNPJ {cnpj}) coleta nome, telefone, e-mail, data de nascimento e unidade de preferência quando você se cadastra nesta página.",
      },
      {
        title: "Para que usamos seus dados",
        list: [
          "Criar seu cadastro no aplicativo da Barbearia VIP.",
          "Emitir e validar o voucher promocional.",
          "Medir os resultados da campanha, inclusive por qual parceiro você chegou até nós.",
        ],
      },
      {
        title: "Base legal e consentimento",
        text: "A base legal é o seu consentimento, que pode ser retirado a qualquer momento pelo e-mail {privacyEmail}.",
      },
      {
        title: "Armazenamento e compartilhamento",
        text: "Os dados ficam armazenados em servidores na nuvem e são compartilhados apenas com o sistema da Barbearia VIP e com os fornecedores necessários para operar esta página. Não vendemos seus dados a terceiros.",
      },
      {
        title: "Seus direitos",
        text: "Você pode solicitar acesso, correção ou exclusão dos seus dados pelo e-mail {privacyEmail}.",
      },
      {
        title: "Cookies e medição",
        text: "Usamos um cookie para lembrar por qual parceiro você chegou (válido por 30 dias) e ferramentas de medição de audiência. Nenhum dado pessoal é vendido ou usado para fins diferentes dos descritos aqui.",
      },
    ],
    backHome: "Voltar para a página inicial",
  },

  footer: {
    tagline: "Corte e barba bem feitos, em 30 unidades.", 
    links: [
      { href: "/privacidade", text: "Política de Privacidade" },
      { href: "/meu-voucher", text: "Meu voucher" },
    ],
    legalLine: "Barbearia VIP",
    rights: "Todos os direitos reservados.",
  },

  notFound: {
    title: "Página não encontrada",
    text: "O endereço que você acessou não existe ou foi movido.",
    cta: "Ir para a página inicial",
  },
} as const;

export type SiteContent = typeof site;

/** Substitui `{chave}` em um texto por valores. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    key in values ? String(values[key]) : `{${key}}`,
  );
}
