import fetch from "node-fetch"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE
)

export default async function handler(req, res) {

  try {

    /* ================= 🔐 VERIFY ================= */
    if (req.method === "GET") {

      console.log("🔐 Verificação recebida")

      const mode = req.query["hub.mode"]
      const token = req.query["hub.verify_token"]
      const challenge = req.query["hub.challenge"]

      if (mode === "subscribe" && token === process.env.VERIFY_TOKEN) {
        console.log("✅ Webhook verificado")
        return res.status(200).send(challenge)
      }

      return res.status(403).end()
    }

    /* ================= 📩 RECEBER ================= */
    if (req.method === "POST") {

      console.log("📥 WEBHOOK:", JSON.stringify(req.body, null, 2))

      const change = req.body?.entry?.[0]?.changes?.[0]?.value

      if (!change) {
        console.log("⚠️ Evento inválido")
        return res.status(200).end()
      }

      /* STATUS (DELIVERED / READ) */
      if (change.statuses) {
        console.log("📊 STATUS:", change.statuses[0]?.status)
        return res.status(200).end()
      }

      const msg = change.messages?.[0]

      if (!msg) {
        console.log("⚠️ Sem mensagem")
        return res.status(200).end()
      }

      const from = msg.from
      const message_id = msg.id
      const text = msg.text?.body || "[MÍDIA]"
      const phone_id = change.metadata.phone_number_id

      console.log("📩 CLIENTE:", from)
      console.log("💬 TEXTO:", text)
      console.log("🆔 MESSAGE ID:", message_id)

      /* ================= DUPLICIDADE ================= */

      const isTeste = message_id === "ABGGFlA5Fpa"

      const { data: jaProcessada } = await supabase
        .from("mensagens_processadas")
        .select("*")
        .eq("message_id", message_id)
        .maybeSingle()

      if (jaProcessada && !isTeste) {
        console.log("🚫 DUPLICADA IGNORADA")
        return res.status(200).end()
      }

      await supabase
        .from("mensagens_processadas")
        .insert({ message_id })

      /* ================= SALVAR CLIENTE ================= */

      await supabase.from("mensagens").insert({
        numero: from,
        mensagem: text,
        origem: "cliente"
      })

      /* ================= 🤖 OPENAI ================= */

      let resposta = "Não consegui entender, pode repetir?"

      try {

        const ai = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content: `
Você é um ASSISTENTE ADMINISTRATIVO do Mercatto Delícia.

Função:
- Ajudar com reservas
- Informações do restaurante
- Atendimento geral
- Ser direto e profissional

Regras:
- Seja curto e claro
- Não invente informações
- Responda como humano
`
              },
              {
                role: "user",
                content: text
              }
            ]
          })
        })

        const data = await ai.json()

        console.log("🧠 OPENAI RAW:", data)

        resposta = data?.choices?.[0]?.message?.content || resposta

      } catch (err) {
        console.log("❌ ERRO OPENAI:", err)
      }

      console.log("🤖 RESPOSTA FINAL:", resposta)

      /* ================= 📤 ENVIAR WHATS ================= */

      try {

        const envio = await fetch(
          `https://graph.facebook.com/v19.0/${phone_id}/messages`,
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

        const retorno = await envio.json()

        console.log("📤 META RETORNO:", retorno)

      } catch (err) {
        console.log("❌ ERRO WHATS:", err)
      }

      /* ================= SALVAR RESPOSTA ================= */

      await supabase.from("mensagens").insert({
        numero: from,
        mensagem: resposta,
        origem: "bot"
      })

      return res.status(200).end()
    }

    return res.status(200).end()

  } catch (error) {

    console.log("💥 ERRO GERAL:", error)

    return res.status(200).end()
  }
}
