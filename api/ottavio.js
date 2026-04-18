const OpenAI = require("openai")
const { createClient } = require("@supabase/supabase-js")

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE
)

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
content: m.mensagem
}))

mensagens.push({
role:"user",
content: pergunta
})
/* ================= BUSCAR DADOS SISTEMA ================= */

const {data:reservas} = await supabase
.from("reservas_mercatto")
.select("*")
.limit(100)

const {data:agenda} = await supabase
.from("agenda_musicos")
.select("*")
.limit(100)

const {data:clientes} = await supabase
.from("memoria_clientes")
.select("*")
.limit(100)

const {data:conversas} = await supabase
.from("conversas_whatsapp")
.select("*")
.limit(50)

const {data:buffet} = await supabase
.from("buffet")
.select("*")
.limit(100)

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



/* ================= DATAS SISTEMA ================= */

const agora = new Date()

const hoje = new Date(
  agora.toLocaleString("en-US",{timeZone:"America/Bahia"})
)

const ontem = new Date(hoje)
ontem.setDate(hoje.getDate() - 1)

const amanha = new Date(hoje)
amanha.setDate(hoje.getDate() + 1)

const hojeISO = hoje.toISOString().split("T")[0]
const ontemISO = ontem.toISOString().split("T")[0]
const amanhaISO = amanha.toISOString().split("T")[0]

const agoraTexto = hoje.toLocaleString("pt-BR",{
  timeZone:"America/Bahia",
  dateStyle:"full",
  timeStyle:"long"
})
  
/* ================= OPENAI ================= */

const completion = await openai.chat.completions.create({

model:"gpt-4.1-mini",
temperature:0,

messages:[

{
role:"system",
content:`DATA DO SISTEMA

Local: Barreiras - Bahia - Brasil
Timezone: America/Bahia (UTC-3)

Agora:
${agoraTexto}

Datas calculadas:

HOJE = ${hojeISO}
ONTEM = ${ontemISO}
AMANHÃ = ${amanhaISO}

Regras obrigatórias:

- "hoje" = ${hojeISO}
- "ontem" = ${ontemISO}
- "amanhã" = ${amanhaISO}
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
TABELA: reservas_mercatto

Os dados abaixo são TODOS os registros retornados da tabela reservas_mercatto.

Se uma reserva não aparecer nessa lista, significa que ela NÃO EXISTE no sistema.

Nunca invente reservas.
Nunca deduza reservas.
Use apenas os registros abaixo.

Dados:

${JSON.stringify(reservas || [])}
`},


{
role:"system",
content:`AGENDA:\n${JSON.stringify(agenda || [])}`
},

{
role:"system",
content:`CLIENTES:\n${JSON.stringify(clientes || [])}`
},

{
role:"system",
content:`CONVERSAS:\n${JSON.stringify(conversas || [])}`
},

{
role:"system",
content:`CARDAPIO:\n${JSON.stringify(buffet || [])}`
},
{
role:"system",
content:`PROMPTS DO AGENTE:\n${JSON.stringify(promptTabela || [])}`
},


{
role:"system",
content:`

🔥 AÇÕES PERMITIDAS NO SISTEMA

Você pode executar ações no banco de dados.

Sempre que o usuário pedir algo que envolva:

- criar reserva
- editar reserva
- cancelar reserva

Você DEVE gerar obrigatoriamente:

RESERVA_JSON:
{
"operacao":"insert | update | delete",
"tabela":"reservas_mercatto",
"dados":{...},
"filtro":{...}
}

---

📌 EXEMPLO CRIAR RESERVA:

RESERVA_JSON:
{
"operacao":"insert",
"tabela":"reservas_mercatto",
"dados":{
  "nome":"João",
  "email":"nao_informado@mercatto.com",
  "telefone":"557799999999",
  "pessoas":4,
  "mesa":"Salão Central",
  "cardapio":"",
  "comandaIndividual":"Não",
  "datahora":"2026-04-15T20:00",
  "valorEstimado":0,
  "pagamentoAntecipado":0,
  "banco":"",
  "observacoes":"",
  "status":"Pendente"
}
}

---

📌 EXEMPLO CANCELAR:

RESERVA_JSON:
{
"operacao":"update",
"tabela":"reservas_mercatto",
"dados":{
  "status":"Cancelada"
},
"filtro":{
  "telefone":"557799999999"
}
}

---

REGRAS:

- Nunca inventar dados
- Sempre gerar JSON quando for ação
- Não explicar nada antes
- Não escrever texto fora do JSON

Se não gerar o JSON, a ação NÃO será executada.

Campos obrigatórios para criar reserva:

- nome
- telefone
- pessoas
- datahora

Se faltar algum desses dados:
NÃO gere o JSON
Peça a informação ao usuário primeiro


`
},


  
...mensagens
]

})

let resposta = completion.choices[0].message.content

/* ================= DETECTAR AÇÃO ================= */

const match = resposta.match(/RESERVA_JSON:\s*(\{[\s\S]*\})/)
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
