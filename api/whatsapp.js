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

export default async function handler(req, res) {

  /* ================= VERIFICAÇÃO WEBHOOK ================= */

  if (req.method === "GET") {

    const verifyToken = process.env.VERIFY_TOKEN

    if (
      req.query["hub.mode"] === "subscribe" &&
      req.query["hub.verify_token"] === verifyToken
    ) {
      console.log("✅ Webhook verificado")
      return res.status(200).send(req.query["hub.challenge"])
    }

    return res.status(403).end()
  }

  /* ================= RECEBER MENSAGEM ================= */

  if (req.method === "POST") {

    try {

      const body = req.body
      const change = body.entry?.[0]?.changes?.[0]?.value

      if (!change) return res.status(200).end()

      /* ===== STATUS ===== */
      if (change.statuses) {
        return res.status(200).end()
      }

      /* ===== SEM MENSAGEM ===== */
      if (!change.messages) return res.status(200).end()

      const msg = change.messages[0]

      /* ===== IGNORA PRÓPRIO BOT ===== */
      const numeroBot = change.metadata.display_phone_number

      if (msg.from === numeroBot) {
        console.log("⚠️ Ignorando mensagem do bot")
        return res.status(200).end()
      }

      const cliente = msg.from
      const message_id = msg.id
      const texto = msg.text?.body || ""

      console.log("📩 MENSAGEM:", texto)

      /* ================= SALVAR CLIENTE ================= */

      await supabase
        .from("conversas_whatsapp")
        .insert({
          telefone: cliente,
          mensagem: texto,
          role: "user",
          message_id: message_id,
          status: "received"
        })

      /* ================= IA ================= */

      const completion = await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        messages: [
          {
            role: "system",
            content: `
Você é um assistente administrativo do Mercatto Delícia.

Regras:
- Responda curto e direto
- Seja educado
- Ajude com reservas, dúvidas e atendimento
- Nunca invente informações
`
          },
          {
            role: "user",
            content: texto
          }
        ]
      })

      const resposta = completion.choices[0].message.content

      console.log("🤖 RESPOSTA:", resposta)

      /* ================= ENVIAR WHATSAPP ================= */

      const url = `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_ID}/messages`

      const envio = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: cliente,
          type: "text",
          text: { body: resposta }
        })
      })

      const retorno = await envio.json()

      console.log("📤 META:", retorno)

      const messageId = retorno?.messages?.[0]?.id

      /* ================= SALVAR RESPOSTA ================= */

      await supabase
        .from("conversas_whatsapp")
        .insert({
          telefone: cliente,
          mensagem: resposta,
          role: "assistant",
          message_id: messageId,
          status: "sent"
        })

      return res.status(200).end()

    } catch (err) {

      console.log("❌ ERRO:", err)
      return res.status(200).end()
    }
  }
}
