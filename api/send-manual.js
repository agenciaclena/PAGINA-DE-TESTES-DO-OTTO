import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE
);

export default async function handler(req,res){

  if(req.method !== "POST"){
    return res.status(405).end();
  }

  try{

    const { numero, mensagem } = req.body;

    const PHONE_ID = process.env.PHONE_NUMBER_ID;
    const TOKEN = process.env.WHATSAPP_TOKEN;

    const url = `https://graph.facebook.com/v19.0/${PHONE_ID}/messages`;

    /* 🔥 PAUSAR BOT */
    await supabase
      .from("controle_bot")
      .upsert({
        telefone: numero,
        pausado: true,
        pausado_ate: null
      });

    /* 🔥 SALVAR COMO HUMANO */
    await supabase
      .from("conversas_whatsapp")
      .insert({
        telefone: numero,
        mensagem: mensagem,
        role: "admin"
      });

    /* 🔥 ENVIAR WHATSAPP */
    const resp = await fetch(url,{
      method:"POST",
      headers:{
        Authorization:`Bearer ${TOKEN}`,
        "Content-Type":"application/json"
      },
      body: JSON.stringify({
        messaging_product:"whatsapp",
        to: numero,
        type:"text",
        text:{ body: mensagem }
      })
    });

    const data = await resp.json();

    if(!resp.ok){
      console.log("ERRO WHATS:", data);
      return res.status(500).json(data);
    }

    return res.json({ success:true });

  }catch(e){
    console.log(e);
    return res.status(500).json({ error:e.message });
  }

}
