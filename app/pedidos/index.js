const { createClient } = require("@supabase/supabase-js")

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE
)

module.exports = async function(req, res){

  try{

    const { acao, dados } = req.body

    if(!acao){
      return res.status(400).json({ erro:"ação não enviada" })
    }

    /* ================= CRIAR PEDIDO ================= */

    if(acao === "criar"){

      const pedido = {
        cliente_nome: dados.cliente_nome,
        cliente_telefone: dados.cliente_telefone,
        itens: dados.itens || [],
        valor_total: dados.valor_total || 0,
        forma_pagamento: dados.forma_pagamento || "",
        observacao: dados.observacao || "",
        status: "Pendente",
        origem: dados.origem || "whatsapp",
        criado_por: "bot"
      }

      const { data, error } = await supabase
        .from("pedidos")
        .insert([pedido])
        .select()
        .single()

      if(error) throw error

      return res.json({
        ok:true,
        pedido_id:data.id,
        pedido:data
      })
    }

    /* ================= LISTAR PEDIDOS ================= */

    if(acao === "listar"){

      const { telefone } = dados

      const { data, error } = await supabase
        .from("pedidos")
        .select("*")
        .eq("cliente_telefone", telefone)
        .order("created_at",{ ascending:false })

      if(error) throw error

      return res.json({
        ok:true,
        pedidos:data
      })
    }

    /* ================= BUSCAR PEDIDO ================= */

    if(acao === "buscar"){

      const { id } = dados

      const { data, error } = await supabase
        .from("pedidos")
        .select("*")
        .eq("id", id)
        .single()

      if(error) throw error

      return res.json({
        ok:true,
        pedido:data
      })
    }

    /* ================= ATUALIZAR STATUS ================= */

    if(acao === "status"){

      const { id, status } = dados

      const { data, error } = await supabase
        .from("pedidos")
        .update({ status })
        .eq("id", id)
        .select()
        .single()

      if(error) throw error

      return res.json({
        ok:true,
        pedido:data
      })
    }

    /* ================= ATUALIZAR PEDIDO ================= */

    if(acao === "atualizar"){

      const { id, update } = dados

      const { data, error } = await supabase
        .from("pedidos")
        .update(update)
        .eq("id", id)
        .select()
        .single()

      if(error) throw error

      return res.json({
        ok:true,
        pedido:data
      })
    }

    /* ================= DELETAR ================= */

    if(acao === "deletar"){

      const { id } = dados

      const { error } = await supabase
        .from("pedidos")
        .delete()
        .eq("id", id)

      if(error) throw error

      return res.json({
        ok:true
      })
    }

    return res.status(400).json({ erro:"ação inválida" })

  }catch(e){

    console.error("ERRO API PEDIDOS:", e)

    return res.status(500).json({
      erro:"erro interno",
      detalhe:e.message
    })
  }
}
