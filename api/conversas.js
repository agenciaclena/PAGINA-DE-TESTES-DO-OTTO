import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE
);
export default async function handler(req,res){

  res.setHeader("Cache-Control","no-store");

  const { numero } = req.query;

  if(!numero){

    const { data } = await supabase
      .from("conversas_whatsapp")
      .select("telefone")
      .order("created_at",{ascending:false});

    const unicos=[...new Set(data.map(d=>d.telefone))];

    return res.json(unicos);
  }

  const { data } = await supabase
    .from("conversas_whatsapp")
    .select("*")
    .eq("telefone",numero)
    .order("created_at",{ascending:true});

  return res.json(data);
}
