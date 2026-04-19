import OpenAI from "openai"

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

export default async function handler(req, res) {

  if (req.method !== "POST") {
    return res.status(405).json({ erro: "Método não permitido" })
  }

  try {

    const { mensagem, telefone, origem } = req.body

    if (!mensagem) {
      return res.status(400).json({ erro: "Mensagem não enviada" })
    }

    /* ================= PROMPT SISTEMA ================= */

    const prompt = `
Você é o assistente oficial do restaurante Mercatto Delícia.

SEU PAPEL:
Atender clientes via WhatsApp de forma natural, educada e comercial.

---------------------------------------
REGRAS DE COMPORTAMENTO
---------------------------------------

- Nunca diga que é IA
- Responder como humano
- Ser direto, elegante e objetivo
- Linguagem de WhatsApp
- Evitar textos longos
- Sempre ajudar a converter em venda ou reserva

---------------------------------------
SALAS DISPONÍVEIS
---------------------------------------

• Sala Paulo Augusto 1  
• Sala Paulo Augusto 2  

---------------------------------------
REGRA CRÍTICA — SALA VIP
---------------------------------------

- Nunca informar disponibilidade sem verificar sistema
- Nunca assumir disponibilidade
- Sempre dizer que irá verificar

Exemplo:
"Vou verificar a disponibilidade pra você agora 😊"

---------------------------------------
ORDEM DE PRIORIDADE
---------------------------------------

1. Sempre oferecer:
→ Sala Paulo Augusto 1

2. Só oferecer a 2 se a 1 estiver ocupada

---------------------------------------
SERVIÇOS
---------------------------------------

Você ajuda com:

- reservas
- aniversários
- eventos
- cardápio
- horários

---------------------------------------
CONTEXTO
---------------------------------------

Telefone: ${telefone || "não informado"}
Origem: ${origem || "desconhecida"}

---------------------------------------
CLIENTE DISSE:
${mensagem}

---------------------------------------
RESPONDA:
Como um atendente real do WhatsApp do Mercatto Delícia.
`

    /* ================= CHAMADA OPENAI ================= */

    const completion = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: prompt
    })

    const resposta = completion.output_text

    console.log("📩 Pergunta:", mensagem)
    console.log("🤖 Resposta:", resposta)

    return res.status(200).json({
      resposta
    })

  } catch (erro) {

    console.error("❌ Erro OpenAI:", erro)

    return res.status(500).json({
      resposta: "Desculpe, tivemos um problema aqui. Pode repetir por favor? 🙏"
    })

  }

}
