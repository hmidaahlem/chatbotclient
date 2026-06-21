import { NextResponse } from 'next/server';
import pool from '@/app/lib/db';

// Define the tool for searching products and hygiene reports
const tools = [
  {
    type: 'function',
    function: {
      name: 'obtenir_infos_produit',
      description: "Rechercher un produit et ses rapports d'hygiène par nom.",
      parameters: {
        type: 'object',
        properties: {
          nom_produit: {
            type: 'string',
            description: "Le nom ou une partie du nom du produit (ex: 'sandwich', 'poulet')",
          },
        },
        required: ['nom_produit'],
      },
    },
  },
];

interface ProductHygieneRow {
  id: number;
  name: string;
  description: string;
  type: string;
  hygiene_status: string | null;
  allergens: string | null;
  remarks: string | null;
}

async function obtenirInfosProduit(nomProduit: string) {
  try {
    const [rows] = await pool.query(
      `SELECT p.id, p.name, p.description, p.type, h.status as hygiene_status, p.allergens, h.remarks 
       FROM products p 
       LEFT JOIN hygiene_reports h ON p.id = h.product_id 
       WHERE p.name LIKE ? AND p.type = 'food'
       ORDER BY h.created_at DESC LIMIT 1`,
      [`%${nomProduit}%`]
    ) as unknown as [ProductHygieneRow[], unknown];

    if (rows.length === 0) {
      return JSON.stringify({ erreur: "Aucun produit trouvé avec ce nom." });
    }

    const p = rows[0];
    if (!p.hygiene_status) {
      return JSON.stringify({
        produit: p.name,
        alerte: "AUCUN RAPPORT D'HYGIÈNE",
        message: "Désolé, aucun rapport officiel d'hygiène ou de conformité n'a été enregistré pour ce produit. Par sécurité, aucun conseil ne peut être donné.",
      });
    }

    return JSON.stringify({
      produit: p.name,
      description: p.description,
      statut_hygiene: p.hygiene_status,
      allergenes_declares: p.allergens,
      remarques_sante: p.remarks,
    });
  } catch (error: unknown) {
    console.error("DB Error:", error);
    const errMessage = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ 
      erreur: "Erreur de connexion à la base de données.",
      details: errMessage
    });
  }
}

export async function POST(req: Request) {
  try {
    if (!process.env.GROQ_API_KEY) {
      return NextResponse.json({ 
        error: 'Configuration Error',
        details: 'GROQ_API_KEY is not defined in the environment variables on Vercel/local.'
      }, { status: 500 });
    }

    const { message, messages: history = [] } = await req.json();

    const systemRole = `Tu es l'assistant clientèle virtuel officiel d'AeroServe, accessible via QR Code sur les tables.
Tu parles directement aux clients finaux.
Directives strictes:
1. Tu dois répondre EXACTEMENT dans la langue utilisée par le client (S'il parle arabe, réponds en arabe. S'il parle français, en français).
2. SÉCURITÉ ALIMENTAIRE STRICTE : Tu as L'INTERDICTION ABSOLUE d'utiliser tes propres connaissances pour deviner les allergènes ou la conformité d'un produit. Tu DOIS utiliser l'outil 'obtenir_infos_produit' pour vérifier la base de données.
3. Si l'outil retourne qu'il n'y a 'AUCUN RAPPORT D'HYGIÈNE', tu dois refuser poliment de donner des conseils sur ce produit pour des raisons de sécurité.
4. Reste professionnel, concis et courtois. Ne réponds pas aux questions hors sujet (politique, blagues, etc.).`;

    const apiMessages = [
      { role: 'system', content: systemRole },
      ...history,
      { role: 'user', content: message },
    ];

    const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: apiMessages,
        tools: tools,
        tool_choice: 'auto',
        temperature: 0.1,
        max_tokens: 800,
      }),
    });

    if (!groqResponse.ok) {
      const err = await groqResponse.text();
      console.error("Groq Error:", err);
      return NextResponse.json({ 
        error: 'Failed to communicate with AI provider',
        details: err,
        status: groqResponse.status
      }, { status: 500 });
    }

    const data = await groqResponse.json();
    const choice = data.choices[0];

    // Handle Tool Call
    if (choice.finish_reason === 'tool_calls' && choice.message.tool_calls) {
      apiMessages.push(choice.message);

      for (const toolCall of choice.message.tool_calls) {
        if (toolCall.function.name === 'obtenir_infos_produit') {
          const args = JSON.parse(toolCall.function.arguments);
          const toolResult = await obtenirInfosProduit(args.nom_produit);
          apiMessages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: toolResult,
          });
        }
      }

      // Second call to Groq with tool results
      const finalResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: apiMessages,
          temperature: 0.1,
          max_tokens: 800,
        }),
      });

      if (!finalResponse.ok) {
        const err = await finalResponse.text();
        console.error("Groq Final Error:", err);
        return NextResponse.json({ 
          error: 'Failed to communicate with AI provider during tool response',
          details: err,
          status: finalResponse.status
        }, { status: 500 });
      }

      const finalData = await finalResponse.json();
      
      if (!finalData.choices || !finalData.choices[0] || !finalData.choices[0].message) {
        return NextResponse.json({ 
          error: 'AI Provider returned invalid response structure',
          details: JSON.stringify(finalData)
        }, { status: 500 });
      }

      return NextResponse.json({ response: finalData.choices[0].message.content });
    }

    // Direct response (no tool needed)
    return NextResponse.json({ response: choice.message.content });

  } catch (error: unknown) {
    console.error("API Error:", error);
    const errMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ 
      error: 'Internal server error',
      details: errMessage
    }, { status: 500 });
  }
}