import fetch from "node-fetch"
import OpenAI from "openai"
import { createClient } from "@supabase/supabase-js"

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE
)

/* 🔐 NUMEROS ADM */
const ADMINS = [
  "557798253249",
  "557798315510"
]

/* 🌎 TIMEZONE */
function agoraBahia(){
  return new Date(
    new Date().toLocaleString("en-US",{ timeZone:"America/Bahia" })
  )
}

/* ================= HANDLER ================= */

export default async function handler(req, res){

  try{

    /* ================= VERIFICAÇÃO META ================= */
    if(req.method === "GET"){

      const VERIFY_TOKEN = process.env.VERIFY_TOKEN

      const mode = req.query["hub.mode"]
      const token = req.query["hub.verify_token"]
      const challenge = req.query["hub.challenge"]

      if(mode === "subscribe" && token === VERIFY_TOKEN){
        return res.status(200).send(challenge)
      }

      return res.status(403).end()
    }

    /* ================= RECEBER ================= */
    if(req.method === "POST"){

      const body = req.body

      console.log("📥 WEBHOOK:", JSON.stringify(body,null,2))

      const change = body?.entry?.[0]?.changes?.[0]?.value

      if(!change) return res.status(200).end()

      /* IGNORA STATUS */
      if(change.statuses){
        return res.status(200).end()
      }

      const msg = change.messages?.[0]
      if(!msg) return res.status(200).end()

      const from = msg.from
      const texto = msg.text?.body || ""

      console.log("📩 ADMIN:", from)
      console.log("💬 TEXTO:", texto)

      /* 🚫 IGNORA CLIENTE */
      if(!ADMINS.includes(from)){
        console.log("🚫 Ignorado (não é admin)")
        return res.status(200).end()
      }

      /* ================= DADOS DO SISTEMA ================= */

      const hoje = agoraBahia().toISOString().split("T")[0]

      /* RESERVAS */
      const { data: reservas } = await supabase
        .from("reservas_mercatto")
        .select("*")
        .gte("datahora", hoje+"T00:00")
        .lte("datahora", hoje+"T23:59")

      /* CONVERSAS */
      const { data: conversas } = await supabase
        .from("conversas_whatsapp")
        .select("*")
        .gte("created_at", hoje+"T00:00")

      /* ================= CONTEXTO ================= */

      const contextoSistema = `
DADOS DO MERCATTO DELÍCIA

RESERVAS HOJE:
${JSON.stringify(reservas || [])}

CONVERSAS HOJE:
${(conversas || []).length} mensagens

REGRAS:
- Responder como gestor
- Seja direto
- Use dados reais
- Nunca invente
`

      /* ================= OPENAI ================= */

      const ai = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: contextoSistema
          },
          {
            role: "user",
            content: texto
          }
        ]
      })

      const resposta = ai.choices[0].message.content

      console.log("🧠 RESPOSTA:", resposta)

      /* ================= ENVIAR ================= */

      await fetch(
        `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_ID}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: from,
            type: "text",
            text: { body: resposta }
          })
        }
      )

      return res.status(200).end()
    }

  }catch(err){

    console.log("💥 ERRO:", err)

    return res.status(200).end()
  }
}
