import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {

  try {

    /* ================= ENV ================= */
    const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
    const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
    const PHONE_ID = process.env.WHATSAPP_PHONE_ID;
    const OPENAI_KEY = process.env.OPENAI_API_KEY;

    /* ================= SUPABASE ================= */
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE
    );

    /* ================= VERIFICAÇÃO META ================= */
    if (req.method === "GET") {

      console.log("🔐 Verificação recebida");

      const mode = req.query["hub.mode"];
      const token = req.query["hub.verify_token"];
      const challenge = req.query["hub.challenge"];

      if (mode === "subscribe" && token === VERIFY_TOKEN) {
        console.log("✅ Webhook verificado");
        return res.status(200).send(challenge);
      }

      return res.status(200).send("Webhook ativo 🚀");
    }

    /* ================= RECEBER EVENTO ================= */
    if (req.method === "POST") {

      console.log("📥 WEBHOOK:", JSON.stringify(req.body, null, 2));

      const change = req.body?.entry?.[0]?.changes?.[0]?.value;

      if (!change) {
        console.log("⚠️ Evento inválido");
        return res.status(200).end();
      }

      /* STATUS (read, delivered...) */
      if (change.statuses) {
        console.log("📊 STATUS:", change.statuses[0]?.status);
        return res.status(200).end();
      }

      const msg = change.messages?.[0];

      if (!msg) {
        console.log("⚠️ Sem mensagem");
        return res.status(200).end();
      }

      const from = msg.from;
      const text = msg.text?.body || "[MÍDIA]";

      console.log("📩 CLIENTE:", from);
      console.log("💬 TEXTO:", text);

      /* ================= SALVAR CLIENTE ================= */
      await supabase.from("mensagens").insert({
        numero: from,
        mensagem: text,
        origem: "cliente"
      });

      /* ================= OPENAI ================= */
      let resposta = "Desculpe, pode repetir?";

      try {

        const ai = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${OPENAI_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content: "Você é atendente do Mercatto Delícia. Seja simpático, direto e natural."
              },
              {
                role: "user",
                content: text
              }
            ]
          })
        }).then(r => r.json());

        resposta = ai?.choices?.[0]?.message?.content || resposta;

      } catch (err) {
        console.log("❌ ERRO OPENAI:", err);
      }

      console.log("🧠 RESPOSTA FINAL:", resposta);

      /* ================= ENVIAR WHATSAPP ================= */
      try {

        const envio = await fetch(
          `https://graph.facebook.com/v19.0/${PHONE_ID}/messages`,
          {
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
          }
        );

        const retorno = await envio.json();
        console.log("📤 META RETORNO:", retorno);

      } catch (err) {
        console.log("❌ ERRO WHATSAPP:", err);
      }

      /* ================= SALVAR RESPOSTA ================= */
      await supabase.from("mensagens").insert({
        numero: from,
        mensagem: resposta,
        origem: "bot"
      });

      return res.status(200).end();
    }

    return res.status(200).end();

  } catch (error) {

    console.log("💥 ERRO GERAL:", error);

    return res.status(200).end(); // 🔥 nunca quebra webhook

  }
}
