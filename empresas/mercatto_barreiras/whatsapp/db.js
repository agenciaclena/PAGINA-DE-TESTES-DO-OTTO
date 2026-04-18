// =======================================================
//  SUPABASE CLIENT
// =======================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const supa = createClient(
  "https://ckkqcxbzfkjzicvoeehw.supabase.co",
  "sb_publishable_djiQsCSrnLUm0iA_eNjjMw__7rfP11m"
);

// =======================================================
// 1. LISTAR ITENS DO SETOR
// =======================================================
export async function listarItens(setor){
  const { data, error } = await supa
    .from("itens_setores")
    .select("*")
    .eq("setor", setor);

  if (error) {
    console.error("Erro listar itens:", error);
    return [];
  }

  return data || [];
}

// =======================================================
// 2. REGISTRAR UMA CONTAGEM
// =======================================================
export async function registrarContagem(info){
  const { error } = await supa
    .from("registros")
    .insert(info);

  if (error) {
    console.error("Erro registrar contagem:", error);
    return false;
  }

  return true;
}

// =======================================================
// 3. REGISTRAR HISTÓRICO (entrada, ações etc.)
// =======================================================
export async function registrarHistorico(usuario, cargo, descricao){
  const { error } = await supa.from("registros").insert({
    usuario,
    setor: "HISTORICO",
    categoria: cargo,
    item: descricao,
    quantidade: 0
  });

  if (error){
    console.error("Erro histórico:", error);
    return false;
  }

  return true;
}

// =======================================================
// 4. CONTAR PENDENTES DO SETOR
//    (quantidade de itens que NÃO foram contados hoje)
// =======================================================
export async function contarPendentes(setor){
  const { count, error } = await supa
    .from("registros")
    .select("id", { count:"exact" })
    .eq("setor", setor);

  if (error) {
    console.error("Erro pendentes:", error);
    return 0;
  }

  return count ?? 0;
}

// =======================================================
// 5. DIAS VÁLIDOS DA TABELA dias_parametros
// =======================================================
export async function diasValidos(){
  const { data, error } = await supa
    .from("dias_parametros")
    .select("*");

  if (error) {
    console.error("Erro dias_parametros:", error);
    return [];
  }

  return data || [];
}

// =======================================================
// 6. DIAS QUE TIVERAM CONTAGEM (COM BASE NA TABELA registros)
// =======================================================
export async function diasComContagem(setor){
  const { data, error } = await supa
    .from("registros")
    .select("data_hora")
    .eq("setor", setor);

  if (error) {
    console.error("Erro diasComContagem:", error);
    return [];
  }

  // Extrair só o dia YYYY-MM-DD
  return [...new Set(
    data.map(x => x.data_hora.split("T")[0])
  )];
}

// =======================================================
// 7. PEGAR REGISTROS COMPLETOS DE UM DIA
// =======================================================
export async function registrosDoDia(dia, setor){
  const inicio = dia + " 00:00:00";
  const fim = dia + " 23:59:59";

  const { data, error } = await supa
    .from("registros")
    .select("*")
    .eq("setor", setor)
    .gte("data_hora", inicio)
    .lte("data_hora", fim)
    .order("categoria", { ascending:true })
    .order("item", { ascending:true });

  if (error){
    console.error("Erro registrosDoDia:", error);
    return [];
  }

  return data;
}

// =======================================================
// 8. PEGAR ÚLTIMA CONTAGEM ANTES DE UM DIA
// =======================================================
export async function ultimaContagemAntes(dia, setor){
  const { data, error } = await supa
    .from("registros")
    .select("*")
    .eq("setor", setor)
    .lt("data_hora", dia + " 00:00:00")
    .order("data_hora", { ascending:false })
    .limit(9999);

  if (error){
    console.error("Erro ultimaContagemAntes:", error);
    return [];
  }

  return data;
}
