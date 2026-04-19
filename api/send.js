export default async function handler(req, res){

  const start = Date.now()
  const reqId = Math.random().toString(36).substring(2,8)

  console.log(`\n==============================`)
  console.log(`🚀 REQUEST ID: ${reqId}`)
  console.log(`📥 MÉTODO: ${req.method}`)
  console.log(`==============================`)

  if(req.method !== "POST"){
    console.log(`⛔ Método inválido`)
    return res.status(405).json({ error: "Método não permitido" })
  }

  try{

    console.log("📦 BODY RECEBIDO:", JSON.stringify(req.body, null, 2))

    const {
      telefone,
      mensagem,
      media_url,
      tipo,
      nome_arquivo
    } = req.body

    console.log("📞 TELEFONE:", telefone)
    console.log("💬 MENSAGEM:", mensagem)
    console.log("📎 MEDIA_URL:", media_url)
    console.log("📂 TIPO:", tipo)

    if(!telefone){
      console.log("❌ ERRO: telefone obrigatório")
      return res.status(400).json({ error: "Telefone obrigatório" })
    }

    /* ================= CONFIG ================= */

    const TOKEN = process.env.WHATSAPP_TOKEN
    const PHONE_ID = process.env.WHATSAPP_PHONE_ID

    console.log("🔐 TOKEN OK:", !!TOKEN)
    console.log("📱 PHONE_ID:", PHONE_ID)

    if(!TOKEN || !PHONE_ID){
      console.log("❌ ERRO: credenciais não configuradas")
      return res.status(500).json({
        error: "Credenciais do WhatsApp não configuradas"
      })
    }

    /* ================= MAP ================= */

    const tipoMap = {
      imagem: "image",
      video: "video",
      audio: "audio",
      documento: "document",
      texto: "text"
    }

    const tipoConvertido = tipoMap[tipo] || "text"

    console.log("🔄 TIPO CONVERTIDO:", tipoConvertido)

    /* ================= PAYLOAD ================= */

    let payload = {
      messaging_product: "whatsapp",
      to: telefone
    }

    if(!media_url){
      payload.type = "text"
      payload.text = {
        body: mensagem || ""
      }
    } else {

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

    console.log("📤 PAYLOAD ENVIADO:", JSON.stringify(payload, null, 2))

    /* ================= REQUEST ================= */

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

    console.log("📩 STATUS META:", response.status)
    console.log("📥 RESPOSTA META:", JSON.stringify(data, null, 2))

    /* ================= ERRO ================= */

    if(!response.ok){

      console.log("💥 ERRO DETECTADO NA META")

      return res.status(400).json({
        error: "Erro ao enviar mensagem",
        status: response.status,
        details: data
      })
    }

    /* ================= SUCESSO ================= */

    const messageId = data?.messages?.[0]?.id

    console.log("✅ MENSAGEM ENVIADA")
    console.log("🆔 MESSAGE ID:", messageId)

    console.log(`⏱️ TEMPO TOTAL: ${Date.now() - start}ms`)
    console.log(`==============================\n`)

    return res.status(200).json({
      success: true,
      message_id: messageId
    })

  }catch(e){

    console.log("💣 ERRO INTERNO GERAL")
    console.log(e)

    return res.status(500).json({
      error: "Erro interno",
      details: e.message
    })
  }
}
