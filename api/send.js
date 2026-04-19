export default async function handler(req, res){

  console.log("🚀 === INÍCIO ENVIO WHATSAPP ===")

  if(req.method !== "POST"){
    console.log("❌ Método inválido:", req.method)
    return res.status(405).json({ error: "Método não permitido" })
  }

  try{

    const {
      telefone,
      mensagem,
      media_url,
      tipo,
      nome_arquivo
    } = req.body

    console.log("📥 BODY RECEBIDO:", req.body)

    if(!telefone){
      console.log("❌ Telefone não enviado")
      return res.status(400).json({ error: "Telefone obrigatório" })
    }

    /* ===============================
       CONFIG WHATSAPP
    =============================== */

    const TOKEN = process.env.WHATSAPP_TOKEN
    const PHONE_ID = process.env.WHATSAPP_PHONE_ID

    console.log("🔐 ENV CHECK:", {
      TOKEN: TOKEN ? "OK" : "FALTA",
      PHONE_ID
    })

    if(!TOKEN || !PHONE_ID){
      console.log("❌ Credenciais ausentes")
      return res.status(500).json({
        error: "Credenciais do WhatsApp não configuradas"
      })
    }

    /* ===============================
       MAPEAR TIPO
    =============================== */

    const tipoMap = {
      imagem: "image",
      video: "video",
      audio: "audio",
      documento: "document",
      texto: "text"
    }

    const tipoConvertido = tipoMap[tipo] || "text"

    console.log("📦 Tipo convertido:", tipoConvertido)

    /* ===============================
       PAYLOAD
    =============================== */

    let payload = {
      messaging_product: "whatsapp",
      to: telefone
    }

    // TEXTO
    if(!media_url){
      payload.type = "text"
      payload.text = {
        body: mensagem || ""
      }
    }

    // MIDIA
    else{

      payload.type = tipoConvertido

      if(tipoConvertido === "image"){
        payload.image = {
          link: media_url,
          caption: mensagem || ""
        }
      }

      if(tipoConvertido === "video"){
        payload.video = {
          link: media_url,
          caption: mensagem || ""
        }
      }

      if(tipoConvertido === "audio"){
        payload.audio = {
          link: media_url
        }
      }

      if(tipoConvertido === "document"){
        payload.document = {
          link: media_url,
          filename: nome_arquivo || "arquivo"
        }
      }
    }

    console.log("📤 PAYLOAD FINAL:", JSON.stringify(payload, null, 2))

    /* ===============================
       ENVIO META
    =============================== */

    const url = `https://graph.facebook.com/v19.0/${PHONE_ID}/messages`

    console.log("🌐 URL:", url)

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    })

    const data = await response.json()

    console.log("📥 RESPOSTA META:", data)
    console.log("📊 STATUS HTTP:", response.status)

    /* ===============================
       ERRO META
    =============================== */

    if(!response.ok){

      console.log("❌ ERRO WHATSAPP DETECTADO")

      return res.status(400).json({
        error: "Erro ao enviar mensagem",
        status: response.status,
        details: data
      })
    }

    /* ===============================
       SUCESSO
    =============================== */

    const messageId = data?.messages?.[0]?.id

    console.log("✅ MENSAGEM ENVIADA:", messageId)
    console.log("🏁 === FIM ENVIO ===")

    return res.status(200).json({
      success: true,
      message_id: messageId,
      meta_response: data
    })

  }catch(e){

    console.log("💥 ERRO INTERNO:", e)

    return res.status(500).json({
      error: "Erro interno",
      details: e.message
    })
  }
}
