import fetch from "node-fetch"
import { createClient } from "@supabase/supabase-js"

export default async function handler(req, res){

  try{

    const VERIFY_TOKEN = process.env.VERIFY_TOKEN
    const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN
    const PHONE_ID = process.env.WHATSAPP_PHONE_ID
    const OPENAI_KEY = process.env.OPENAI_API_KEY

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE
    )

    /* ================= VERIFICAÇÃO ================= */
    if(req.method === "GET"){

      const mode = req.query["hub.mode"]
      const token = req.query["hub.verify_token"]
      const challenge = req.query["hub.challenge"]

      if(mode === "subscribe" && token === VERIFY_TOKEN){
        return res.status(200).send(challenge)
      }

      return res.status(403).end()
    }

    /* ================= MENSAGEM ================= */
    if(req.method === "POST"){

      console.log("📥 WEBHOOK:", JSON.stringify(req.body,null,2))

      const change = req.body?.entry?.[0]?.changes?.[0]?.value

      if(!change){
        return res.status(200).end()
      }

      if(change.statuses){
        return res.status(200).end()
      }

      const msg = change.messages?.[0]
      if(!msg){
        return res.status(200).end()
      }

      const from = msg.from
      const text = msg.text?.body || "[MÍDIA]"

      console.log("📩 CLIENTE:", from)
      console.log("💬 TEXTO:", text)

      /* SALVA */
      await supabase.from("mensagens").insert({
        numero: from,
        mensagem: text,
        origem: "cliente"
      })

      /* IA */
      let resposta = "Erro ao responder"

      try{
        const ai = await fetch("https://api.openai.com/v1/chat/completions",{
          method:"POST",
          headers:{
            Authorization:`Bearer ${OPENAI_KEY}`,
            "Content-Type":"application/json"
          },
          body: JSON.stringify({
            model:"gpt-4o-mini",
            messages:[
              {role:"system",content:"Você é atendente do Mercatto Delícia"},
              {role:"user",content:text}
            ]
          })
        }).then(r=>r.json())

        resposta = ai?.choices?.[0]?.message?.content || resposta

      }catch(e){
        console.log("❌ OPENAI:", e)
      }

      /* ENVIO */
      try{
        const envio = await fetch(
          `https://graph.facebook.com/v19.0/${PHONE_ID}/messages`,
          {
            method:"POST",
            headers:{
              Authorization:`Bearer ${WHATSAPP_TOKEN}`,
              "Content-Type":"application/json"
            },
            body: JSON.stringify({
              messaging_product:"whatsapp",
              to:from,
              type:"text",
              text:{ body:resposta }
            })
          }
        )

        const retorno = await envio.json()
        console.log("📤 META:", retorno)

      }catch(e){
        console.log("❌ WHATS:", e)
      }

      /* SALVA BOT */
      await supabase.from("mensagens").insert({
        numero: from,
        mensagem: resposta,
        origem: "bot"
      })

      return res.status(200).end()
    }

    return res.status(200).end()

  }catch(err){

    console.log("💥 ERRO:", err)

    return res.status(200).end()
  }
}
