const { createClient } = require("@supabase/supabase-js")

const supabase = createClient(
process.env.SUPABASE_URL,
process.env.SUPABASE_SERVICE_ROLE
)

module.exports = async function handler(req,res){

if(req.method !== "POST"){
return res.status(405).json({erro:"Método não permitido"})
}

/* ================= SEGURANÇA ================= */

const ADMIN_TOKEN = process.env.ADMIN_TOKEN

if(req.headers.authorization !== `Bearer ${ADMIN_TOKEN}`){
return res.status(403).json({erro:"Acesso negado"})
}

try{

const telefone = req.body.telefone
const mensagem = req.body.mensagem

if(!telefone || !mensagem){
return res.status(400).json({erro:"telefone ou mensagem faltando"})
}

/* ================= WHATSAPP API ================= */

const phone_number_id = process.env.WHATSAPP_PHONE_ID

const url = `https://graph.facebook.com/v19.0/${phone_number_id}/messages`

await fetch(url,{

method:"POST",

headers:{
Authorization:`Bearer ${process.env.WHATSAPP_TOKEN}`,
"Content-Type":"application/json"
},

body:JSON.stringify({

messaging_product:"whatsapp",

to:telefone,

type:"text",

text:{
body:mensagem
}

})

})

/* ================= SALVAR NO HISTORICO ================= */

await supabase
.from("conversas_whatsapp")
.insert({
telefone:telefone,
mensagem:mensagem,
role:"assistant"
})

return res.json({
ok:true
})

}catch(e){

console.log("ERRO ENVIO:",e)

return res.status(500).json({
erro:"erro ao enviar mensagem"
})

}

}
