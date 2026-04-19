export default async function handler(req, res){

  if(req.method !== "POST"){
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

    if(!telefone){
      return res.status(400).json({ error: "Telefone obrigatório" })
    }

    /* ===============================
       CONFIG WHATSAPP CLOUD API
    =============================== */

    const TOKEN = process.env.WHATSAPP_TOKEN
    const PHONE_ID = process.env.WHATSAPP_PHONE_ID

    if(!TOKEN || !PHONE_ID){
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

    /* ===============================
       MONTA PAYLOAD
    =============================== */

    let payload = {
      messaging_product: "whatsapp",
      to: telefone
    }

    // 📩 TEXTO
    if(!media_url){
      payload.type = "text"
      payload.text = {
        body: mensagem || ""
      }
    }

    // 📎 MIDIA
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

    /* ===============================
       ENVIO PARA META
    =============================== */

    const response = await fetch(
      `https://graph.facebook.com/v19.0/${PHONE_ID}/messages`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      }
    )

    const data = await response.json()

    /* ===============================
       TRATAMENTO DE ERRO
    =============================== */

    if(!response.ok){
      console.error("ERRO WHATSAPP:", data)

      return res.status(400).json({
        error: "Erro ao enviar mensagem",
        details: data
      })
    }

    /* ===============================
       SUCESSO
    =============================== */

    const messageId = data?.messages?.[0]?.id

    return res.status(200).json({
      success: true,
      message_id: messageId
    })

  }catch(e){

    console.error("ERRO INTERNO:", e)

    return res.status(500).json({
      error: "Erro interno",
      details: e.message
    })
  }

}
