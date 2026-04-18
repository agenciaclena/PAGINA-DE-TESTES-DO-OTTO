import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
process.env.SUPABASE_URL,
process.env.SUPABASE_SERVICE_ROLE
)

export default async function handler(req,res){

if(req.method==="GET"){

const { data } = await supabase
.from("pedidos_pendentes")
.select("*")
.order("created_at",{ascending:true})

return res.json(data || [])

}

if(req.method==="POST"){

const { acao,id } = req.body

if(acao==="aprovar"){

const { data } = await supabase
.from("pedidos_pendentes")
.select("*")
.eq("id",id)
.single()

const total=(data.itens||[])
.reduce((s,it)=>s+(it.preco*it.quantidade),0)

await supabase.from("pedidos").insert([{
cliente_nome:data.cliente_nome,
cliente_telefone:data.cliente_telefone,
cliente_endereco:data.cliente_endereco,
cliente_bairro:data.cliente_bairro,
tipo:data.tipo,
itens:data.itens,
valor_total:total,
status:"novo"
}])

await supabase.from("pedidos_pendentes").delete().eq("id",id)

}

if(acao==="rejeitar"){

await supabase
.from("pedidos_pendentes")
.update({status:"rejeitado"})
.eq("id",id)

}

return res.json({ok:true})

}

}
