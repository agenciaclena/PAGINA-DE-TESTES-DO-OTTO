import fetch from "node-fetch"

export default async function handler(req, res){

  try{

    /* ================= VERIFY ================= */
    if(req.method === "GET"){

      const mode = req.query["hub.mode"]
      const token = req.query["hub.verify_token"]
      const challenge = req.query["hub.challenge"]

      if(mode === "subscribe" && token === process.env.VERIFY_TOKEN){
        console.log("✅ WEBHOOK VERIFICADO")
        return res.status(200).send(challenge)
      }

      return res.status(403).end()
    }

    /* ================= RECEBER ================= */
    if(req.method === "POST"){

      console.log("📥 WEBHOOK:", JSON.stringify(req.body,null,2))

      const change = req.body?.entry?.[0]?.changes?.[0]?.value

      if(!change){
        return res.status(200).end()
      }

      /* STATUS (IGNORA) */
      if(change.statuses){
        return res.status(200).end()
      }

      const msg = change.messages?.[0]

      if(!msg){
        return res.status(200).end()
      }

      /* 🚫 EVITA LOOP (IMPORTANTE) */
      if(change.metadata?.phone_number_id === msg.from){
        return res.status(200).end()
      }

      const numero = msg.from
      const texto = msg.text?.body || "Mensagem recebida"

      console.log("📩 CLIENTE:", numero)
      console.log("💬 TEXTO:", texto)

      /* ================= IA ================= */

      let resposta = "Como posso te ajudar?"

      try{

        const ai = await fetch("https://api.openai.com/v1/chat/completions",{
          method:"POST",
          headers:{
            Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,
            "Content-Type":"application/json"
          },
          body: JSON.stringify({
            model:"gpt-4o-mini",
            messages:[
              {
                role:"system",
                content:`
Você é um atendente do Mercatto Delícia.
Seja direto, educado e profissional.
Responda curto.
`
              },
              {
                role:"user",
                content: texto
              }
            ]
          })
        })

        const data = await ai.json()

        console.log("🧠 OPENAI:", data)

        resposta = data?.choices?.[0]?.message?.content || resposta

      }catch(err){
        console.log("❌ ERRO IA:", err)
      }

      console.log("🤖 RESPOSTA:", resposta)

      /* ================= ENVIAR ================= */

      try{

        const envio = await fetch(
          `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_ID}/messages`,
          {
            method:"POST",
            headers:{
              Authorization:`Bearer ${process.env.WHATSAPP_TOKEN}`,
              "Content-Type":"application/json"
            },
            body: JSON.stringify({
              messaging_product:"whatsapp",
              to: numero,
              type:"text",
              text:{ body: resposta }
            })
          }
        )

        const retorno = await envio.json()

        console.log("📤 META:", retorno)

      }catch(err){
        console.log("❌ ERRO WHATS:", err)
      }

      return res.status(200).end()
    }

    return res.status(200).end()

  }catch(err){
    console.log("💥 ERRO GERAL:", err)
    return res.status(200).end()
  }
}
