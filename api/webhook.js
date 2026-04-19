import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {

  try {

    // ================== ENV ==================
    const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
    const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
    const PHONE_ID = process.env.WHATSAPP_PHONE_ID;

    if (!VERIFY_TOKEN) {
      console.log("❌ VERIFY_TOKEN não definido");
    }

    // ================== SUPABASE ==================
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE
    );

    // ================== VERIFICAÇÃO ==================
    if (req.method === "GET") {

      const mode = req.query["hub.mode"];
      const token = req.query["hub.verify_token"];
      const challenge = req.query["hub.challenge"];

      console.log("🔐 Verificação recebida");

      if (mode === "subscribe" && token === VERIFY_TOKEN) {
        console.log("✅ Webhook verificado");
        return res.status(200).send(challenge);
      }

      return res.sendStatus(403);
    }

    // ================== RECEBER MENSAGEM ==================
    if (req.method === "POST") {

      const body = req.body;

      console.log("📥 WEBHOOK:", JSON.stringify(body, null, 2));

      const change = body?.entry?.[0]?.changes?.[0]?.value;

      if (!change) {
        console.log("⚠️ Evento inválido");
        return res.sendStatus(200);
      }

      // STATUS (delivered, read...)
      if (change.statuses) {
        console.log("📊 STATUS:", change.statuses[0]?.status);
        return res.sendStatus(200);
      }

      const msg = change.messages?.[0];

      if (!msg) {
        console.log("⚠️ Sem mensagem");
        return res.sendStatus(200);
      }

      const from = msg.from;
      const text = msg.text?.body || "[MÍDIA]";

      console.log("📩 CLIENTE:", from);
      console.log("💬 TEXTO:", text);

      // ================== SALVAR ==================
      await supabase.from("mensagens").insert({
        numero: from,
        mensagem: text,
        origem: "cliente"
      });

      // ================== OPENAI ==================
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
              content: "Você é atendente do Mercatto Delícia. Seja direto, simpático e objetivo."
            },
            {
              role: "user",
              content: text
            }
          ]
        })
      }).then(r => r.json());

      const resposta = ai?.choices?.[0]?.message?.content || "Não entendi, pode repetir?";

      console.log("🤖 RESPOSTA:", resposta);

      // ================== ENVIAR WHATS ==================
      await fetch(`https://graph.facebook.com/v19.0/${PHONE_ID}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: from,
          type: "text",
          text: { body: resposta }
        })
      });

      // ================== SALVAR RESPOSTA ==================
      await supabase.from("mensagens").insert({
        numero: from,
        mensagem: resposta,
        origem: "bot"
      });

      return res.sendStatus(200);
    }

  } catch (error) {

    console.error("💥 ERRO GERAL:", error);

    return res.status(200).send("OK"); // 🔥 nunca quebra webhook

  }
}
