import OpenAI from "openai"
import { createClient } from "@supabase/supabase-js"

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE
)

export default async function handler(req, res){

  /* ================= VERIFICAÇÃO WEBHOOK ================= */
  if(req.method === "GET"){

    const verify_token = process.env.VERIFY_TOKEN

    const mode = req.query["hub.mode"]
    const token = req.query["hub.verify_token"]
    const challenge = req.query["hub.challenge"]

    if(mode && token === verify_token){
      console.log("✅ Webhook verificado")
      return res.status(200).send(challenge)
    }

    return res.status(403).end()
  }

  /* ================= RECEBER MENSAGEM ================= */
  if(req.method === "POST"){

    try{

      const body = req.body

      console.log("📩 Webhook recebido:", JSON.stringify(body,null,2))

      const change = body.entry?.[0]?.changes?.[0]?.value

      if(!change || !change.messages){
        return res.status(200).end()
      }

      const msg = change.messages[0]

      const cliente = String(msg.from || "").replace(/\D/g,"")

      // ignora status
      if(change.statuses){
        return res.status(200).end()
      }

      // ignora mensagem do próprio bot
      if(msg.from === change.metadata.phone_number_id){
        return res.status(200).end()
      }

      const mensagem = msg.text?.body || ""

      if(!mensagem){
        console.log("⚠️ Sem texto")
        return res.status(200).end()
      }

      console.log("💬 Cliente:", cliente)
      console.log("📝 Mensagem:", mensagem)

      /* ================= OPENAI ================= */

      const completion = await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        messages: [
          {
            role: "system",
            content: `
Você é um assistente administrativo do Mercatto Delícia.

Funções:
- Atender clientes com educação
- Responder dúvidas sobre reservas, funcionamento e serviços
- Ser direto, claro e profissional
- Nunca inventar informações

Se não souber, diga que um atendente irá ajudar.
`
          },
          {
            role: "user",
            content: mensagem
          }
        ]
      })

      const resposta = completion.choices[0].message.content

      console.log("🤖 Resposta:", resposta)

      /* ================= ENVIAR WHATSAPP ================= */

      const url = `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_ID}/messages`

      const envio = await fetch(url,{
        method:"POST",
        headers:{
          Authorization:`Bearer ${process.env.WHATSAPP_TOKEN}`,
          "Content-Type":"application/json"
        },
        body: JSON.stringify({
          messaging_product:"whatsapp",
          to: cliente,
          type:"text",
          text:{ body: resposta }
        })
      })

      const retorno = await envio.json()

      console.log("📤 Envio WhatsApp:", retorno)

      /* ================= SALVAR (OPCIONAL) ================= */

      await supabase.from("conversas_whatsapp").insert([
        {
          telefone: cliente,
          mensagem: mensagem,
          role: "user"
        },
        {
          telefone: cliente,
          mensagem: resposta,
          role: "assistant"
        }
      ])

      return res.status(200).end()

    }catch(err){

      console.log("❌ ERRO:", err)

      return res.status(200).end()
    }

  }

}
