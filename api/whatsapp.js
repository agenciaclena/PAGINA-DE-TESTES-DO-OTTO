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

/* ================= UTIL ================= */

function agoraBahia(){
  return new Date(
    new Date().toLocaleString("en-US",{ timeZone:"America/Bahia" })
  )
}

/* ================= ENVIAR WHATSAPP ================= */

async function enviarMensagem(to, texto, phone_number_id){

  await fetch(`https://graph.facebook.com/v19.0/${phone_number_id}/messages`,{
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

}

/* ================= BAIXAR MIDIA ================= */

async function baixarMidia(mediaId){

  try{

    const meta = await fetch(
      `https://graph.facebook.com/v19.0/${mediaId}`,
      {
        headers:{ Authorization:`Bearer ${WHATSAPP_TOKEN}` }
      }
    )

    const json = await meta.json()

    const file = await fetch(json.url,{
      headers:{ Authorization:`Bearer ${WHATSAPP_TOKEN}` }
    })

    const buffer = Buffer.from(await file.arrayBuffer())

    const path = `whatsapp/${Date.now()}.bin`

    await supabase.storage
      .from("buffet_whatsa_mercatto")
      .upload(path, buffer)

    const { data } = supabase.storage
      .from("buffet_whatsa_mercatto")
      .getPublicUrl(path)

    return data.publicUrl

  }catch(e){
    console.log("ERRO MIDIA:",e)
    return null
  }
}

/* ================= AGENTE IA ================= */

async function gerarRespostaIA(historico, mensagem){

  const completion = await openai.chat.completions.create({
    model:"gpt-4.1-mini",
    messages:[
      {
        role:"system",
        content:`
Você é um atendente do Mercatto Delícia.

Regras:
- Seja direto e humano
- Não invente
- Não fale demais
- Responda igual WhatsApp
`
      },
      ...historico,
      { role:"user", content:mensagem }
    ]
  })

  return completion.choices[0].message.content
}

/* ================= HANDLER ================= */

export default async function handler(req,res){

/* ================= VERIFY ================= */

if(req.method === "GET"){

  const mode = req.query["hub.mode"]
  const token = req.query["hub.verify_token"]
  const challenge = req.query["hub.challenge"]

  if(mode === "subscribe" && token === VERIFY_TOKEN){
    console.log("✅ Webhook verificado")
    return res.status(200).send(challenge)
  }

  return res.status(403).end()
}

/* ================= RECEBER ================= */

if(req.method === "POST"){

  try{

    const body = req.body

    const change = body.entry?.[0]?.changes?.[0]?.value

    if(!change){
      return res.status(200).end()
    }

    const phone_number_id = change.metadata.phone_number_id

/* ================= STATUS ================= */

    if(change.statuses){

      const status = change.statuses[0]

      await supabase
      .from("conversas_whatsapp")
      .update({ status: status.status })
      .eq("message_id", status.id)

      return res.status(200).end()
    }

/* ================= MENSAGEM ================= */

    const msg = change.messages?.[0]

    if(!msg){
      return res.status(200).end()
    }

    const cliente = msg.from
    const message_id = msg.id

/* ================= ANTI DUPLICIDADE ================= */

    const { data: jaExiste } = await supabase
      .from("mensagens_processadas")
      .select("*")
      .eq("message_id", message_id)
      .maybeSingle()

    if(jaExiste){
      return res.status(200).end()
    }

    await supabase
      .from("mensagens_processadas")
      .insert({ message_id })

/* ================= TRATAR MSG ================= */

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

/* ================= IA ================= */

    const resposta = await gerarRespostaIA(historico, mensagem)

/* ================= ENVIAR ================= */

    await enviarMensagem(cliente, resposta, phone_number_id)

/* ================= SALVAR RESPOSTA ================= */

    await supabase
    .from("conversas_whatsapp")
    .insert({
      telefone:cliente,
      mensagem:resposta,
      role:"assistant"
    })

    return res.status(200).end()

  }catch(e){
    console.log("ERRO GERAL:", e)
    return res.status(200).end()
  }
}

}
