const OpenAI = require("openai")
const { createClient } = require("@supabase/supabase-js")

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE
)




const LOGOS = {
  "MERCATTO DELÍCIA": "COLOQUE_LINK_AQUI",
  "VILLA GOURMET": "COLOQUE_LINK_AQUI",
  "EMPORIO MERCATTO": "COLOQUE_LINK_AQUI",
  "M.KIDS": "COLOQUE_LINK_AQUI",
  "PADARIA DELÍCIA": "COLOQUE_LINK_AQUI",
  "DELÍCIA GOURMET": "COLOQUE_LINK_AQUI"
}





const ADMIN_TOKEN = process.env.ADMIN_TOKEN

module.exports = async function handler(req, res){

try{

/* ================= AUTORIZAÇÃO ================= */

if(req.headers.authorization !== `Bearer ${ADMIN_TOKEN}`){
return res.status(403).json({erro:"acesso negado"})
}

/* ================= BODY ================= */

const body =
typeof req.body === "string"
? JSON.parse(req.body)
: req.body

const pergunta = body?.pergunta || ""

/* ================= DATAS PRIMEIRO ================= */

const agora = new Date()

const formatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Bahia",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit"
})

const parts = formatter.formatToParts(agora)
const get = type => parts.find(p => p.type === type)?.value

const hojeISO = `${get("year")}-${get("month")}-${get("day")}`
const hora = `${get("hour")}:${get("minute")}:${get("second")}`

const ontem = new Date(`${hojeISO}T00:00:00`)
ontem.setDate(ontem.getDate() - 1)

const ontemISO = ontem.toISOString().split("T")[0]
const amanha = new Date(`${hojeISO}T00:00:00`)
amanha.setDate(amanha.getDate() + 1)

const amanhaISO = amanha.toISOString().split("T")[0]
/* ================= AGORA SIM ================= */









  
let dataFiltro = hojeISO

const texto = pergunta.toLowerCase()
const isRelatorio =
  texto.includes("relatorio") ||
  texto.includes("análise") ||
  texto.includes("analise") ||
  texto.includes("desempenho") ||
  texto.includes("resumo")


  
if(texto.includes("ontem")){
  dataFiltro = ontemISO
}

if(texto.includes("semana passada")){
const d = new Date(hojeISO + "T00:00:00")
  d.setDate(d.getDate() - 7)
  dataFiltro = d.toISOString().split("T")[0]
}

const matchData = texto.match(/\d{2}\/\d{2}\/\d{4}/)

if(matchData){
  const [dia, mes, ano] = matchData[0].split("/")
  dataFiltro = `${ano}-${mes}-${dia}`
}





  
let confirmar = body?.confirmar || null
/* ================= CONFIRMAR COM "SIM" ================= */

if(pergunta && pergunta.toLowerCase() === "sim"){

const { data:last } = await supabase
.from("administrador_chat")
.select("acao_json")
.not("acao_json","is",null)
.order("created_at",{ascending:false})
.limit(1)

if(last && last[0]){
confirmar = last[0].acao_json
}

}

/* ================= CONFIRMAR AÇÃO ================= */

if(confirmar){

try{

const acao = confirmar
// remove campos proibidos
if(acao.dados && acao.dados.created_at){
delete acao.dados.created_at
}
if(acao.operacao === "insert"){

// 🔥 CORREÇÃO CRÍTICA PARA RESERVAS
if(acao.tabela === "reservas_mercatto"){

  if(!acao.dados.email){
    acao.dados.email = "nao_informado@mercatto.com"
  }

  if(!acao.dados.status){
    acao.dados.status = "Pendente"
  }

  if(!acao.dados.comandaIndividual){
    acao.dados.comandaIndividual = "Não"
  }

  if(!acao.dados.valorEstimado){
    acao.dados.valorEstimado = 0
  }

  if(!acao.dados.pagamentoAntecipado){
    acao.dados.pagamentoAntecipado = 0
  }

  if(!acao.dados.banco){
    acao.dados.banco = ""
  }

  if(!acao.dados.observacoes){
    acao.dados.observacoes = ""
  }

}

const { data, error } = await supabase
.from(acao.tabela)
.insert(acao.dados)
.select()

if(error){
console.error("Erro insert:", error)
throw error
}

}

if(acao.operacao === "update"){

const { data, error } = await supabase
.from(acao.tabela)
.update(acao.dados)
.match(acao.filtro)
.select()

if(error){
console.error("Erro update:", error)
throw error
}

}

if(acao.operacao === "delete"){

const { error } = await supabase
.from(acao.tabela)
.delete()
.match(acao.filtro)

if(error){
console.error("Erro delete:", error)
throw error
}

}

await supabase
.from("administrador_chat")
.insert({
role:"assistant",
mensagem:"✅ Ação executada com sucesso"
})

return res.json({
resposta:"✅ Ação executada com sucesso"
})

}catch(e){

console.error("Erro executar ação:",e)

return res.json({
resposta:"Erro ao executar ação"
})

}

}

/* ================= SALVAR PERGUNTA ================= */

await supabase
.from("administrador_chat")
.insert({
role:"user",
mensagem:pergunta
})

/* ================= HISTÓRICO ================= */

const {data:historico} = await supabase
.from("administrador_chat")
.select("*")
.order("created_at",{ascending:false})
.limit(20)

const mensagens = (historico || [])
.reverse()
.map(m => ({
  role: m.role,
  content: m.mensagem + (m.acao_json ? `\n\nAÇÃO_JSON:\n${JSON.stringify(m.acao_json)}` : "")
}))

mensagens.push({
role:"user",
content: pergunta
})



/* ================= BUSCA TOTAL DO SISTEMA ================= */

const { data:reservas } = await supabase
.from("reservas_mercatto")
.select("*")
.order("created_at",{ ascending:false })
.limit(1000)

/* ================= 🔥 COLE AQUI ================= */

const reservasHoje = reservas.filter(r =>
  r.datahora?.startsWith(dataFiltro)
)

const reservasOntem = reservas.filter(r =>
  r.datahora?.startsWith(ontemISO)
)

const totalHoje = reservasHoje.length
const totalOntem = reservasOntem.length

const clientesHoje = new Set(reservasHoje.map(r => r.telefone)).size

const faturamentoHoje = reservasHoje.reduce((acc,r)=>
  acc + (r.valorFinalPago || r.valorEstimado || 0)
,0)

const ticketHoje = totalHoje > 0 ? faturamentoHoje / totalHoje : 0

let variacao = 0
if(totalOntem > 0){
  variacao = ((totalHoje - totalOntem) / totalOntem) * 100
}

/* ================= 🔥 FIM ================= */

const { data:agenda } = await supabase
.from("agenda_musicos")
.select("*")
.order("data",{ ascending:false })
.limit(500)

const { data:clientes } = await supabase
.from("memoria_clientes")
.select("*")
.order("ultima_interacao",{ ascending:false })
.limit(1000)

const { data:buffet } = await supabase
.from("buffet")
.select("*")
.limit(500)


// 🔥 detectar empresa
let empresaFiltro = null

if(texto.includes("mercatto")){
  empresaFiltro = "MERCATTO DELÍCIA"
}

if(texto.includes("villa")){
  empresaFiltro = "VILLA GOURMET"
}

if(texto.includes("padaria")){
  empresaFiltro = "PADARIA DELÍCIA"
}

// 🔥 query correta (igual painel)
let query = supabase
  .from("buffet_lancamentos")
  .select("*")
  .eq("data", dataFiltro)

if(empresaFiltro){
  query = query.eq("empresa", empresaFiltro)
}

let { data:buffetLancamentos } = await query
buffetLancamentos = buffetLancamentos || []











  
// 🔥 fallback automático CORRETO
if(!buffetLancamentos || buffetLancamentos.length === 0){

  let queryOntem = supabase
    .from("buffet_lancamentos")
    .select("*")
    .eq("data", ontemISO)

  if(empresaFiltro){
    queryOntem = queryOntem.eq("empresa", empresaFiltro)
  }

  const { data:ontemData } = await queryOntem

  buffetLancamentos = ontemData || []
}

  
  
const { data:itensBuffet } = await supabase
.from("itens_buffet")
.select("*")
.limit(200)

const { data:produtos } = await supabase
.from("produtos")
.select("*")
.limit(2000)

const { data:pedidos } = await supabase
.from("pedidos")
.select("*")
.order("created_at",{ ascending:false })
.limit(1000)

const { data:pedidosPendentes } = await supabase
.from("pedidos_pendentes")
.select("*")
.order("created_at",{ ascending:false })
.limit(200)
  
const { data:histReservas } = await supabase
.from("hist_reservas_mercatto")
.select("*")
.order("created_at",{ ascending:false })
.limit(2000)


  
/* ================= BUSCAR PROMPTS DO AGENTE ================= */

const {data:promptTabela} = await supabase
.from("prompt_agente")
.select("*")
.order("ordem",{ascending:true})

  
/* ================= BUSCAR PROMPT DO AGENTE ================= */

const { data: prompts } = await supabase
.from("prompt_agente")
.select("prompt")
.eq("ativo", true)
.order("ordem",{ascending:true})

const promptAgente = (prompts || [])
.map(p => p.prompt)
.join("\n\n")

/* ================= CONTEXTO INTELIGENTE ================= */

function addContext(label, data){
  if(!data) return null

  const limite = Array.isArray(data) ? data.slice(0, 200) : data

  return {















    
    role:"system",
    content:`${label}:\n${JSON.stringify(limite)}`
  }
}

const contextos = [

addContext("RESERVAS", reservas),
addContext("HIST_RESERVAS", histReservas),
addContext("AGENDA", agenda),
addContext("CLIENTES", clientes),
addContext("CARDAPIO", buffet),
addContext("BUFFET_LANCAMENTOS", buffetLancamentos),
addContext("PEDIDOS", pedidos),
addContext("PEDIDOS_PENDENTES", pedidosPendentes),
addContext("ITENS_BUFFET", itensBuffet),
addContext("PRODUTOS", produtos)

].filter(Boolean)


  
/* ================= OPENAI ================= */

const completion = await openai.chat.completions.create({

model:"gpt-4.1",
temperature:0,

  
messages:[



{
role:"system",
content:`
📊 DADOS REAIS DE RESERVAS:

reservas_hoje: ${totalHoje}
reservas_ontem: ${totalOntem}

clientes_hoje: ${clientesHoje}

faturamento_hoje: ${faturamentoHoje}

ticket_medio_hoje: ${ticketHoje}

variacao_percentual: ${variacao.toFixed(2)}

⚠️ REGRA:
Use apenas esses dados. Não inventar.
`
},

{
role:"system",
content:`
🚨 RELATÓRIO DE RESERVAS

Use os dados fornecidos.

reservas = reservas_hoje  
clientes = clientes_hoje  
faturamento = faturamento_hoje  
ticket_medio = ticket_medio_hoje  

Se variacao < 0 → CAINDO  
Se variacao > 0 → SUBINDO  
`
},

  


{
role:"system",
content:`

📊 MODO RELATÓRIO PROFISSIONAL ATIVADO

Sempre que o usuário pedir:

- relatório
- análise
- desempenho
- resumo
- faturamento
- resultado

Você DEVE responder obrigatoriamente em JSON:

RELATORIO_JSON:
{
  "empresa": "",
  "logo": "",
  "data": "",
  "resumo": "",
  "kpis": {
    "faturamento": 0,
    "clientes": 0,
    "ticket_medio": 0,
    "reservas": 0
  },
  "analise": "",
  "alertas": [],
  "recomendacoes": [],
  "status": "SAUDÁVEL | ATENÇÃO | CRÍTICO",
  "score": 0,
  "tendencia": "SUBINDO | CAINDO | ESTÁVEL"
}

⚠️ Nunca responder apenas texto quando for relatório
⚠️ Sempre preencher todos os campos
⚠️ Sempre usar dados reais do sistema

`
},
{
role:"system",
content:`LOGOS DISPONÍVEIS: ${JSON.stringify(LOGOS)}`
},

  
{

role:"system",
content:`
⚠️ REGRA CRÍTICA DE DATA E HORA

Você NÃO possui acesso ao tempo real.

A ÚNICA data válida é a fornecida abaixo.

Qualquer referência a:
- hoje
- agora
- amanhã
- ontem

DEVE obrigatoriamente usar estes valores:

DATA_ATUAL = ${hojeISO}
HORA_ATUAL = ${hora}

ONTEM = ${ontemISO}
AMANHA = ${amanhaISO}

Se você usar qualquer outra data:
→ sua resposta estará ERRADA

NUNCA invente datas
NUNCA use conhecimento próprio
NUNCA ignore essas variáveis

Sempre substitua:

"hoje" → ${hojeISO}
"agora" → ${hora}
`
},
{
role:"system",
content:`DATA FILTRADA: ${dataFiltro}`
},

{
role:"system",
content:`

📊 REGRA INTELIGENTE — BUFFET_LANCAMENTOS

Sempre que o usuário pedir dados do buffet:

1. Se NÃO informar a empresa:
→ Pergunte QUAL EMPRESA antes de qualquer resposta

2. Se informar empresa MAS não houver dados no dia:
→ NÃO pare a resposta
→ Você DEVE automaticamente:

- buscar dados de ONTEM
- ou sugerir outras datas disponíveis

3. Se não houver dados nem hoje nem ontem:
→ informe claramente:
"Não houve lançamentos recentes"

4. Nunca responda vazio
5. Sempre sugira próximo passo

Exemplo correto:

"Hoje não houve registros para Mercatto.
Ontem houve produção de X kg.
Deseja ver outro período ou outra empresa?"

`
},



  
{
role:"system",
content:`

📦 RELAÇÃO DE DADOS DO CARDÁPIO

Tabela: buffet
→ representa os PRATOS

Tabela: itens_buffet
→ representa os INGREDIENTES de cada prato

Ligação:
itens_buffet.buffet_id = buffet.id

Tabela: produtos
→ contém custo_unitario dos ingredientes

Ligação:
itens_buffet.produto_id = produtos.id

📊 COMO CALCULAR CUSTO (CMV):

Para cada item do prato:

custo = quantidade * custo_unitario

CMV do prato = soma de todos os ingredientes

⚠️ REGRAS:
- Nunca inventar custo
- Sempre usar produtos.custo_unitario
- Sempre multiplicar pela quantidade
`
},






  {
role:"system",
content:`

📜 HISTÓRICO DE RESERVAS

Tabela: HIST_RESERVAS

Essa tabela contém o histórico completo de ações:

- INSERT (criação de reserva)
- UPDATE (edições)
- DELETE (exclusões)

Cada registro representa uma ação feita no sistema.

Use essa tabela para:

- Saber quem criou uma reserva
- Saber quem alterou
- Saber quem excluiu
- Ver histórico completo de mudanças

⚠️ REGRAS:

- Nunca inventar histórico
- Sempre usar os dados da tabela HIST_RESERVAS
- Sempre considerar a ordem cronológica (created_at)
`
},
{
role:"system",
content:`

🔥 RESERVAS

Se o usuário pedir:

- criar reserva
- marcar mesa
- reservar

Você DEVE gerar:

RESERVA_JSON:
{
"operacao":"insert",
"tabela":"reservas_mercatto",
"dados":{
  "nome":"",
  "telefone":"",
  "email":"nao_informado@mercatto.com",
  "pessoas":1,
  "mesa":"Salão Central",
  "cardapio":"",
  "comandaIndividual":"Não",
  "datahora":"",
  "valorEstimado":0,
  "pagamentoAntecipado":0,
  "banco":"",
  "observacoes":"",
  "status":"Pendente"
}
}

⚠️ Não escrever texto fora do JSON
`
},
{
role:"system",
content:`REGRAS DO AGENTE:

${promptAgente}

Todas as regras acima são obrigatórias e devem ser seguidas rigorosamente.
`
},
{
role:"system",
content:`

🔥 CONTROLE TOTAL DO SISTEMA

Você pode criar, editar ou excluir QUALQUER registro em QUALQUER tabela.

Para isso use:

ALTERAR_REGISTRO_JSON:
{
"operacao":"insert | update | delete",
"tabela":"nome_da_tabela",
"dados":{...},
"filtro":{...}
}

REGRAS:
- Sempre usar confirmação antes de executar
- Nunca executar sem confirmação
- Nunca inventar dados
- Sempre usar dados existentes como base
`
},
{
role:"system",
content:`
TABELA: reservas_mercatto

Você já recebeu os dados completos da tabela RESERVAS no contexto acima.

Se uma reserva não aparecer nesses dados:
→ significa que ela NÃO EXISTE no sistema.

Regras obrigatórias:

- Nunca inventar reservas
- Nunca deduzir reservas
- Nunca criar dados que não estejam no contexto
- Sempre responder baseado na tabela RESERVAS fornecida

Use apenas os dados reais já enviados anteriormente.
`},

{
role:"system",
content:`

Você pode criar, editar ou apagar prompts da tabela "prompt_agente".

Estrutura da tabela:

prompt_agente
- id
- prompt
- ordem
- ativo
- created_at

Se o usuário pedir para alterar ou criar prompts, gere uma ação usando:

ALTERAR_REGISTRO_JSON:
{
"operacao":"insert | update | delete",
"tabela":"prompt_agente",
"dados":{...},
"filtro":{...}
}

Exemplo criar prompt:

ALTERAR_REGISTRO_JSON:
{
"operacao":"insert",
"tabela":"prompt_agente",
"dados":{
"prompt":"Sempre enviar a foto do prato antes da descrição.",
"ordem":10,
"ativo":true
}
}

Exemplo editar prompt:

ALTERAR_REGISTRO_JSON:
{
"operacao":"update",
"tabela":"prompt_agente",
"dados":{
"prompt":"texto atualizado"
},
"filtro":{
"id":5
}
}

Se o usuário pedir para criar, editar ou apagar um prompt:

1. Gere obrigatoriamente a ação ALTERAR_REGISTRO_JSON.
2. Não explique nada antes.
3. Não escreva texto adicional.
4. Apenas retorne o JSON da ação.

Se não gerar o JSON a ação será ignorada.
`
},


...contextos,
...mensagens
]

})

let resposta = completion.choices[0].message.content

const matchRelatorio = resposta.match(/RELATORIO_JSON:\s*(\{[\s\S]*\})/)

if(matchRelatorio){
  try{

    const relatorio = JSON.parse(
      matchRelatorio[1]
      .replace(/```json/g,"")
      .replace(/```/g,"")
      .trim()
    )

    return res.json({
      tipo:"relatorio",
      relatorio
    })

  }catch(e){
    console.log("Erro parse relatorio:", e)
  }
}







/* ================= DETECTAR RESERVA ================= */

const matchReserva = resposta.match(/RESERVA_JSON:\s*(\{[\s\S]*?\})/)

if(matchReserva){

  try{

    let jsonTexto = matchReserva[1]
      .replace(/```json/g,"")
      .replace(/```/g,"")
      .trim()

    const acaoReserva = JSON.parse(jsonTexto)

    const dados = {

      nome: acaoReserva.dados.nome || "Cliente",
      telefone: acaoReserva.dados.telefone || "ADMIN",
      email: acaoReserva.dados.email || "nao_informado@mercatto.com",
      pessoas: parseInt(acaoReserva.dados.pessoas) || 1,
      mesa: acaoReserva.dados.mesa || "Salão",
      cardapio: acaoReserva.dados.cardapio || "",
      datahora: acaoReserva.dados.datahora,
      observacoes: acaoReserva.dados.observacoes || "",
      status: acaoReserva.dados.status || "Pendente",
      valorEstimado: 0,
      pagamentoAntecipado: 0,
      banco: "",
      comandaIndividual: acaoReserva.dados.comandaIndividual || "Não"
    }

    delete dados.comandaindividual

    const { error } = await supabase
      .from("reservas_mercatto")
      .insert(dados)

    if(error){
      console.error("❌ ERRO REAL AO SALVAR:", error)
      throw new Error(error.message)
    }

    resposta = "✅ Reserva criada com sucesso"

  }catch(e){
    console.error("❌ ERRO RESERVA:", e)
  }
}








  
/* ================= DETECTAR AÇÃO ================= */













  
const match = resposta.match(/ALTERAR_REGISTRO_JSON:\s*(\{[\s\S]*\})/)

let acao = null

if(match){

try{

let jsonTexto = match[1]

jsonTexto = jsonTexto
.replace(/```json/g,"")
.replace(/```/g,"")
.trim()

acao = JSON.parse(jsonTexto)

if(!resposta.includes("Confirme")){
resposta += "\n\n⚠️ Confirme para executar esta ação."
}

}catch(e){

console.log("Erro parse JSON ação:", match[1])

}

}

/* ================= SALVAR RESPOSTA ================= */

await supabase
.from("administrador_chat")
.insert({
role:"assistant",
mensagem:resposta,
acao_json:acao
})

return res.json({
resposta,
acao
})

}catch(e){

console.error("ERRO GERAL:",e)

return res.status(500).json({
erro:"erro interno"
})

}

}
