
import { NextResponse } from 'next/server';
//connexion vers MySQL
import pool from '@/app/lib/db';

// Define the tool for searching products and hygiene reports
const tools = [
  {
    type: 'function',
    function: {
      name: 'obtenir_infos_produit',
      description: "Rechercher un produit alimentaire dans la base de données par nom et retourner ses ingrédients, allergènes, DLC et rapports d'hygiène officiels.",
      parameters: {
        type: 'object',
        properties: {
          nom_produit: {
            type: 'string',
            description: "Le nom ou une partie du nom du produit à chercher (ex: 'sandwich thon', 'thon', 'soupe')",
          },
        },
        required: ['nom_produit'],
      },
    },
  },
];

// Keywords that REQUIRE calling the DB tool before answering
const FOOD_QUESTION_KEYWORDS = [
  'ingredi', 'ingrédient', 'composant', 'contien', 'allerg', 'gluten', 'lactose',
  'dlc', 'expir', 'périm', 'perim', 'date', 'conformi', 'hygièn', 'hygien',
  'sain', 'danger', 'sécurit', 'securit', 'مكون', 'حساسي', 'تاريخ', 'صلاح',
];

function requiresDBLookup(msg: string): boolean {
  const lower = msg.toLowerCase();
  return FOOD_QUESTION_KEYWORDS.some(kw => lower.includes(kw));
}

interface ProductHygieneRow {
  id: number;
  name: string;
  description: string;
  type: string;
  expiration_date: string | null;
  hygiene_status: string | null;
  allergens: string | null;
  remarks: string | null;
  allergens_verified: number | null;
  expiration_verified: number | null;
}

async function obtenirInfosProduit(nomProduit: string) {
  try {
    // FIX 1: Removed `p.type = 'food'` filter — search ALL product types
    // FIX 2: Sort by name length DESC to prefer 'sandwich thon' over 'thon'
    const [rows] = await pool.query(
      `SELECT p.id, p.name, p.description, p.type, p.expiration_date, p.allergens, 
              h.status as hygiene_status, h.remarks, h.allergens_verified, h.expiration_verified
       FROM products p 
       LEFT JOIN hygiene_reports h ON p.id = h.product_id 
       WHERE p.name LIKE ? AND p.is_active = 1 AND p.approval_status = 'approved'
       ORDER BY LENGTH(p.name) DESC, h.created_at DESC LIMIT 1`,
      [`%${nomProduit}%`]
    ) as unknown as [ProductHygieneRow[], unknown];

    if (rows.length === 0) {
      return JSON.stringify({ 
        not_found: true,
        message: `Aucun produit nommé "${nomProduit}" n'a été trouvé dans notre base de données.`
      });
    }

    const p = rows[0];

    // Fetch ingredients from product_recipe table (actual recipe data)
    const [ingRows] = await pool.query(
      `SELECT p2.name, pr.quantity, pr.unit 
       FROM product_recipe pr
       JOIN products p2 ON p2.id = pr.ingredient_id
       WHERE pr.food_product_id = ?`,
      [p.id]
    ) as unknown as [{name: string, quantity: number, unit: string}[], unknown];

    let ingredientsList = "";
    if (ingRows.length > 0) {
      ingredientsList = ingRows.map(i => `- ${i.name} (${i.quantity} ${i.unit || 'pièce'})`).join("\n");
    } else if (p.description && p.description.trim().length > 2) {
      ingredientsList = p.description.trim();
    }

    // Parse allergens - handle both JSON array and plain string
    let allergensDisplay = "Aucun allergène déclaré";
    if (p.allergens) {
      try {
        const parsed = JSON.parse(p.allergens);
        if (Array.isArray(parsed) && parsed.length > 0) {
          allergensDisplay = parsed.join(', ');
        } else if (typeof parsed === 'string' && parsed.trim()) {
          allergensDisplay = parsed.trim();
        }
      } catch {
        if (p.allergens.trim()) allergensDisplay = p.allergens.trim();
      }
    }

    // GUARDRAIL 1: NON CONFORME — block all info disclosure
    if (p.hygiene_status === 'non_conforme') {
      return JSON.stringify({
        strict_response: true,
        message: `Ce produit (${p.name}) est marqué NON CONFORME par le responsable d'hygiène. Pour des raisons de sécurité alimentaire, aucune information ne peut être communiquée.`
      });
    }

    const hasData = ingredientsList.length > 0 || !!p.hygiene_status || (p.allergens && p.allergens.trim().length > 2) || !!p.expiration_date;

    // GUARDRAIL 2: No data at all — prevent Groq from hallucinating
    if (!hasData) {
      return JSON.stringify({
        strict_response: true,
        message: `Aucune donnée (ingrédients, allergènes, DLC ou rapport d'hygiène) n'a encore été enregistrée pour "${p.name}" dans le système. Contactez le personnel pour plus d'informations.`
      });
    }

    // Return full structured data for Groq to format nicely
    return JSON.stringify({
      produit: p.name,
      type: p.type,
      ingredients: ingredientsList || "Aucun ingrédient enregistré dans la recette.",
      dlc: p.expiration_date || "Non spécifiée",
      allergenes: allergensDisplay,
      statut_hygiene: p.hygiene_status || "Aucun rapport d'hygiène disponible",
      allergenes_verifies_par_hygiene: p.allergens_verified ? 'Oui' : 'Non',
      dlc_verifiee_par_hygiene: p.expiration_verified ? 'Oui' : 'Non',
      remarques_hygiene: p.remarks || "Aucune remarque.",
    });
  } catch (error: unknown) {
    console.error("DB Error:", error);
    const errMessage = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ 
      db_error: true,
      message: "Erreur de connexion à la base de données. Veuillez contacter le personnel.",
      details: errMessage
    });
  }
}

export async function POST(req: Request) {
  try {
    if (!process.env.GROQ_API_KEY) {
      return NextResponse.json({ 
        error: 'Configuration Error',
        details: 'GROQ_API_KEY is not defined.'
      }, { status: 500 });
    }

    const { message, messages: history = [] } = await req.json();

    // FIX 3: Stronger system prompt that FORBIDS answering food questions without tool
    const systemRole = `Tu es l'assistant clientèle virtuel d'AeroServe, disponible via QR Code sur les tables de l'aéroport.
Tu parles directement aux voyageurs et visiteurs.

RÈGLES ABSOLUES ET NON NÉGOCIABLES:
1. LANGUE : Réponds TOUJOURS dans la même langue que le client (français → français, arabe → arabe, anglais → anglais).
2. OUTIL OBLIGATOIRE : Pour TOUTE question sur un produit (ingrédients, allergènes, DLC, conformité, composition, santé), tu as L'OBLIGATION ABSOLUE d'appeler l'outil 'obtenir_infos_produit' AVANT de répondre. Tu n'as PAS le droit de répondre de mémoire sur les produits.
3. ANTI-HALLUCINATION : NE JAMAIS inventer ou deviner des ingrédients, allergènes ou informations nutritionnelles. Si l'outil ne retourne pas de données, dis-le clairement.
4. Si l'outil retourne 'NON CONFORME' ou 'aucune donnée', transmets exactement ce message au client.
5. Reste professionnel, concis et courtois. Refuse poliment les questions hors sujet (politique, blagues, etc.).`;

    const apiMessages = [
      { role: 'system', content: systemRole },
      ...history,
      { role: 'user', content: message },
    ];

    // FIX 4: Force tool_choice='required' when the message is clearly a food question
    // This prevents Groq from skipping the DB lookup and hallucinating
    const toolChoice = requiresDBLookup(message) ? 'required' : 'auto';

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
        tool_choice: toolChoice,
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
          
          // Handle strict/guardrail responses — return directly WITHOUT sending to Groq
          try {
            const parsedResult = JSON.parse(toolResult);
            if (parsedResult.strict_response) {
              return NextResponse.json({ response: parsedResult.message });
            }
            // If DB error, return clean message
            if (parsedResult.db_error) {
              return NextResponse.json({ response: parsedResult.message });
            }
          } catch {
            // continue
          }

          apiMessages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: toolResult,
          });
        }
      }

      // Second call to Groq with tool results to format a nice answer
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

    // Direct response (no tool needed — e.g. greetings, off-topic refusals)
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