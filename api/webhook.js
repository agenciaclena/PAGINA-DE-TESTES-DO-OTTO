import fetch from "node-fetch";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE
);

export default async function handler(req, res) {

  /* ================= VERIFY ================= */

  if (req.method === "GET") {
    const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

    if (
      req.query["hub.mode"] === "subscribe" &&
      req.query["hub.verify_token"] === VERIFY_TOKEN
    ) {
      console.log("✅ WEBHOOK VERIFICADO");
      return res.status(200).send(req.query["hub.challenge"]);
    }

    return res.sendStatus(403);
  }

  /* ================= RECEBER ================= */

  if (req.method === "POST") {

    try {

      const body = req.body;

      console.log("📥 WEBHOOK:", JSON.stringify(body, null, 2));

      const change = body?.entry?.[0]?.changes?.[0]?.value;
      const msg = change?.messages?.[0];

      if (!msg) return res.sendStatus(200);

      const from = msg.from;
      const text = msg.text?.body || "";

      /* ===== IGNORA PRÓPRIO BOT ===== */
      const numeroBot = change?.metadata?.display_phone_number;

      if (from === numeroBot) {
        console.log("⚠️ Ignorando mensagem do bot");
        return res.sendStatus(200);
      }

      console.log("📩 CLIENTE:", from);
      console.log("💬 TEXTO:", text);

      /* ================= SALVAR ================= */

      await supabase.from("mensagens").insert({
        numero: from,
        mensagem: text,
        origem: "cliente"
      });

      /* ================= OPENAI ================= */

      let resposta = "Desculpe, tive um problema agora 😅";

      try {

        const ai = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content: "Você é atendente do Mercatto Delícia. Responda de forma simpática, curta e objetiva."
              },
              {
                role: "user",
                content: text
              }
            ]
          })
        });

        const json = await ai.json();

        console.log("🤖 OPENAI:", json);

        if (json?.choices?.[0]?.message?.content) {
          resposta = json.choices[0].message.content;
        }

      } catch (err) {
        console.log("❌ ERRO OPENAI:", err);
      }

      console.log("🧠 RESPOSTA:", resposta);

      /* ================= WHATSAPP ================= */

      const envio = await fetch(
        `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_ID}/messages`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${process.env.WHATSAPP_TOKEN}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: from,
            type: "text",
            text: { body: resposta }
          })
        }
      );

      const retorno = await envio.json();

      console.log("📤 META:", retorno);

      /* ================= SALVAR BOT ================= */

      await supabase.from("mensagens").insert({
        numero: from,
        mensagem: resposta,
        origem: "bot"
      });

      return res.sendStatus(200);

    } catch (err) {

      console.error("❌ ERRO GERAL:", err);
      return res.sendStatus(200);

    }
  }
}
