import { createClient } from "@supabase/supabase-js"
import OpenAI from "openai"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE
)

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

const VERIFY_TOKEN = process.env.VERIFY_TOKEN
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN

/* ================= LOGGER ================= */

function log(step, data = null){
  console.log("================================")
  console.log(`🧩 STEP: ${step}`)
  if(data){
    console.log(JSON.stringify(data, null, 2))
  }
  console.log("================================")
}

/* ================= UTIL ================= */

function agoraBahia(){
  return new Date(
    new Date().toLocaleString("en-US",{ timeZone:"America/Bahia" })
  )
}

/* ================= ENVIAR WHATSAPP ================= */

async function enviarMensagem(to, texto, phone_number_id){

  log("ENVIANDO MENSAGEM", { to, texto })

  const resp = await fetch(`https://graph.facebook.com/v19.0/${phone_number_id}/messages`,{
    method:"POST",
    headers:{
      Authorization:`Bearer ${WHATSAPP_TOKEN}`,
      "Content-Type":"application/json"
    },
    body:JSON.stringify({
      messaging_product:"whatsapp",
      to,
      type:"text",
      text:{ body:texto }
    })
  })

  const json = await resp.json()

  log("RESPOSTA META", json)

}

/* ================= BAIXAR MIDIA ================= */

async function baixarMidia(mediaId){

  try{

    log("BAIXANDO MIDIA", { mediaId })

    const meta = await fetch(
      `https://graph.facebook.com/v19.0/${mediaId}`,
      {
        headers:{ Authorization:`Bearer ${WHATSAPP_TOKEN}` }
      }
    )

    const json = await meta.json()

    log("URL MIDIA", json)

    const file = await fetch(json.url,{
      headers:{ Authorization:`Bearer ${WHATSAPP_TOKEN}` }
    })

    const buffer = Buffer.from(await file.arrayBuffer())

    const path = `whatsapp/${Date.now()}.bin`

    const { error } = await supabase.storage
      .from("buffet_whatsa_mercatto")
      .upload(path, buffer)

    if(error){
      log("ERRO UPLOAD", error)
      return null
    }

    const { data } = supabase.storage
      .from("buffet_whatsa_mercatto")
      .getPublicUrl(path)

    log("MIDIA SALVA", data)

    return data.publicUrl

  }catch(e){
    log("ERRO MIDIA", e)
    return null
  }
}

/* ================= IA ================= */

async function gerarRespostaIA(historico, mensagem){

  log("GERANDO RESPOSTA IA", { mensagem })

  const completion = await openai.chat.completions.create({
    model:"gpt-4.1-mini",
    messages:[
      {
        role:"system",
        content:`
Você é atendente do Mercatto Delícia.

Seja direto, humano e objetivo.
Nunca invente.
`
      },
      ...historico,
      { role:"user", content:mensagem }
    ]
  })

  const resposta = completion.choices[0].message.content

  log("RESPOSTA IA", resposta)

  return resposta
}

/* ================= HANDLER ================= */

export default async function handler(req,res){

log("🚀 NOVA REQUISIÇÃO", {
  metodo: req.method
})

/* ================= VERIFY ================= */

if(req.method === "GET"){

  log("VERIFICAÇÃO WEBHOOK", req.query)

  const mode = req.query["hub.mode"]
  const token = req.query["hub.verify_token"]
  const challenge = req.query["hub.challenge"]

  if(mode === "subscribe" && token === VERIFY_TOKEN){
    log("WEBHOOK VALIDADO")
    return res.status(200).send(challenge)
  }

  log("WEBHOOK NEGADO")
  return res.status(403).end()
}

/* ================= POST ================= */

if(req.method === "POST"){

  try{

    const body = req.body

    log("BODY RECEBIDO", body)

    const change = body.entry?.[0]?.changes?.[0]?.value

    if(!change){
      log("EVENTO INVÁLIDO")
      return res.status(200).end()
    }

    const phone_number_id = change.metadata.phone_number_id

/* ================= STATUS ================= */

    if(change.statuses){

      const status = change.statuses[0]

      log("STATUS RECEBIDO", status)

      await supabase
      .from("conversas_whatsapp")
      .update({ status: status.status })
      .eq("message_id", status.id)

      return res.status(200).end()
    }

/* ================= MSG ================= */

    const msg = change.messages?.[0]

    if(!msg){
      log("SEM MENSAGEM")
      return res.status(200).end()
    }

    const cliente = msg.from
    const message_id = msg.id

    log("MENSAGEM RECEBIDA", {
      cliente,
      message_id,
      tipo: msg.type
    })

/* ================= DUPLICIDADE ================= */

    const { data: existe } = await supabase
      .from("mensagens_processadas")
      .select("*")
      .eq("message_id", message_id)
      .maybeSingle()

    if(existe){
      log("MENSAGEM DUPLICADA IGNORADA", message_id)
      return res.status(200).end()
    }

    await supabase
      .from("mensagens_processadas")
      .insert({ message_id })

/* ================= TRATAR ================= */

    let mensagem = ""
    let tipo = "texto"
    let media_url = null

    switch(msg.type){

      case "text":
        mensagem = msg.text.body
      break

      case "image":
        tipo = "imagem"
        mensagem = "[Imagem]"
        media_url = await baixarMidia(msg.image.id)
      break

      case "audio":
        tipo = "audio"
        mensagem = "[Áudio]"
        media_url = await baixarMidia(msg.audio.id)
      break

      case "video":
        tipo = "video"
        mensagem = "[Vídeo]"
        media_url = await baixarMidia(msg.video.id)
      break

      default:
        mensagem = "[Não suportado]"
    }

    log("MENSAGEM TRATADA", {
      mensagem,
      tipo,
      media_url
    })

/* ================= SALVAR ================= */

    await supabase
    .from("conversas_whatsapp")
    .insert({
      telefone:cliente,
      mensagem,
      tipo,
      media_url,
      role:"user",
      message_id,
      status:"received"
    })

    log("SALVO NO BANCO")

/* ================= HISTÓRICO ================= */

    const { data: historicoDB } = await supabase
      .from("conversas_whatsapp")
      .select("*")
      .eq("telefone",cliente)
      .order("created_at",{ascending:false})
      .limit(15)

    const historico = (historicoDB || [])
      .reverse()
      .map(m => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.mensagem
      }))

    log("HISTÓRICO MONTADO", historico)

/* ================= IA ================= */

    const resposta = await gerarRespostaIA(historico, mensagem)

/* ================= ENVIO ================= */

    await enviarMensagem(cliente, resposta, phone_number_id)

/* ================= SALVAR RESPOSTA ================= */

    await supabase
    .from("conversas_whatsapp")
    .insert({
      telefone:cliente,
      mensagem:resposta,
      role:"assistant"
    })

    log("RESPOSTA FINAL ENVIADA")

    return res.status(200).end()

  }catch(e){

    log("ERRO GERAL", e)

    return res.status(200).end()
  }
}

}
