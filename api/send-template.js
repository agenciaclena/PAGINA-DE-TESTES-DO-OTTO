const { createClient } = require("@supabase/supabase-js")

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE
)

/* ================= CONFIG ================= */

const PHONE_ID = process.env.PHONE_NUMBER_ID
const TOKEN = process.env.WHATSAPP_TOKEN

const TEMPLATES_PERMITIDOS = {
  confirmao_de_reserva: "en_US",
  reserva_especial: "en_US",
  hello_world: "en_US"
}

/* ================= API ================= */

module.exports = async function(req, res){

  try{

    /* ================= BODY SAFE ================= */

    let body = req.body
    if(typeof body === "string") body = JSON.parse(body)

    const { telefone, template, parametros = {} } = body

    /* ================= VALIDAÇÃO ================= */

    if(!telefone || !template){
      return res.status(400).json({
        error:"telefone e template são obrigatórios"
      })
    }

    if(!TOKEN || !PHONE_ID){
      return res.status(500).json({
        error:"WHATSAPP_TOKEN ou PHONE_NUMBER_ID não configurado"
      })
    }

    const idioma = TEMPLATES_PERMITIDOS[template]

    if(!idioma){
      return res.status(400).json({
        error:"Template não permitido"
      })
    }

    /* ================= FUNÇÃO TEMPLATE ================= */

    function montarTemplate(template, parametros){

      switch(template){

        /* ================= CONFIRMAÇÃO ================= */

        case "confirmao_de_reserva":
          return {
            name: template,
            language: { code: idioma },
            components: [
              {
                type:"body",
                parameters:[
                  { type:"text", text: parametros.nome || "Cliente" },
                  { type:"text", text: parametros.data || "20/03" },
                  { type:"text", text: parametros.hora || "20:00" },
                  { type:"text", text: parametros.pessoas || "2" }
                ]
              }
            ]
          }

        /* ================= RESERVA ESPECIAL (VIDEO) ================= */

        case "reserva_especial":

          if(!parametros.video){
            throw new Error("Template reserva_especial precisa de video")
          }

          return {
            name: template,
            language: { code: idioma },
            components: [
              {
                type:"header",
                parameters:[
                  {
                    type:"video",
                    video:{
                      link: parametros.video
                    }
                  }
                ]
              }
            ]
          }

        /* ================= HELLO WORLD ================= */

        case "hello_world":
          return {
            name: template,
            language: { code: idioma }
          }

        default:
          return null
      }
    }

    /* ================= MONTA TEMPLATE ================= */

    const templateData = montarTemplate(template, parametros)

    if(!templateData){
      return res.status(400).json({
        error:"Template não configurado corretamente"
      })
    }

    /* ================= PAYLOAD ================= */

    const payload = {
      messaging_product:"whatsapp",
      to: telefone,
      type:"template",
      template: templateData
    }

    console.log("📤 ENVIANDO PARA:", telefone)
    console.log("📦 PAYLOAD:", JSON.stringify(payload,null,2))

    /* ================= ENVIO META ================= */

    const resp = await fetch(
      `https://graph.facebook.com/v19.0/${PHONE_ID}/messages`,
      {
        method:"POST",
        headers:{
          Authorization:`Bearer ${TOKEN}`,
          "Content-Type":"application/json"
        },
        body: JSON.stringify(payload)
      }
    )

    const text = await resp.text()

    let data = {}

    try{
      data = JSON.parse(text)
    }catch{
      data = { raw:text }
    }

    console.log("📩 RESPOSTA META:", data)

    /* ================= ERRO META ================= */

    if(!resp.ok || data.error){

      console.log("❌ ERRO DETALHADO:", JSON.stringify(data,null,2))

      await supabase
        .from("conversas_whatsapp")
        .insert({
          telefone,
          mensagem:`[ERRO TEMPLATE: ${template}]`,
          role:"assistant",
          status:"erro"
        })

      return res.status(500).json({
        error:data.error || "Erro ao enviar",
        detalhe:data
      })
    }

    /* ================= SUCESSO ================= */

    const messageId = data?.messages?.[0]?.id || null

    await supabase
      .from("conversas_whatsapp")
      .insert({
        telefone,
        mensagem:`[TEMPLATE ENVIADO: ${template}]`,
        role:"assistant",
        message_id: messageId,
        status:"sent"
      })

    return res.json({
      ok:true,
      enviado:true,
      messageId,
      telefone,
      template
    })

  }catch(err){

    console.error("🔥 ERRO GERAL:", err)

    return res.status(500).json({
      error:err.message
    })
  }
}
