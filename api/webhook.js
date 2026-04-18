import fetch from "node-fetch";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE
);

export default async function handler(req, res) {

  // 🔐 VERIFICAÇÃO META
  if (req.method === "GET") {
    const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    } else {
      return res.sendStatus(403);
    }
  }
  // 📩 RECEBER MENSAGEM
  if (req.method === "POST") {
    try {
      const body = req.body;

      const msg =
        body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

      if (!msg) return res.sendStatus(200);

      const from = msg.from;
      const text = msg.text?.body || "";

      // 💾 SALVAR NO SUPABASE
      await supabase.from("mensagens").insert({
        numero: from,
        mensagem: text,
        origem: "cliente"
      });

      // 🤖 CHAMAR OPENAI
      const ai = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: "Você é atendente do Mercatto Delícia, responda de forma simpática e objetiva." },
            { role: "user", content: text }
          ]
        })
      }).then(r => r.json());

      const resposta = ai.choices[0].message.content;

      // 💬 ENVIAR RESPOSTA
      await fetch(`https://graph.facebook.com/v18.0/${process.env.WHATSAPP_PHONE_ID}/messages`, {
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
      });

      // 💾 SALVAR RESPOSTA
      await supabase.from("mensagens").insert({
        numero: from,
        mensagem: resposta,
        origem: "bot"
      });

      return res.sendStatus(200);

    } catch (err) {
      console.error(err);
      return res.sendStatus(500);
    }
  }
}
