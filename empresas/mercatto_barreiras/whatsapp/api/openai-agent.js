import OpenAI from "openai"

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

export default async function handler(req, res) {

  try {

    const { mensagem } = req.body

    if (!mensagem) {
      return res.status(400).json({ erro: "Mensagem não enviada" })
    }

    const completion = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: `
Você é o assistente de reservas do restaurante Mercatto Delícia.

Seu trabalho é ajudar clientes com:

- reservas
- cardápio
- horários
- aniversários

Locais disponíveis:
Sala VIP 1
Sala VIP 2
Sacada
Salão Central

Cliente disse:
${mensagem}

Responda de forma curta e educada.
`
    })

    const resposta = completion.output_text

    console.log("Resposta OpenAI:", resposta)

    return res.status(200).json({
      resposta
    })

  } catch (erro) {

    console.error("Erro OpenAI:", erro)

    return res.status(500).json({
      resposta: "Desculpe, houve um erro no atendimento."
    })

  }

}
